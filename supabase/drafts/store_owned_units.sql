-- DESIGN DRAFT ONLY. This file is outside supabase/migrations.
-- The proposed DDL below is block-commented and must remain so until the
-- project, migration baseline, ownership map, unit-value mapping, and app
-- compatibility release are approved. This file has not been executed.

-- Read-only schema, constraints, indexes, policies, and grants.
SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('stores', 'units', 'products')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('stores', 'units', 'products')
ORDER BY c.relname, con.conname;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('units', 'products')
ORDER BY tablename, policyname;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name IN ('units', 'products')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('units', 'products')
ORDER BY tablename, indexname;

-- Read-only data mapping. Product names and other product attributes are omitted.
SELECT id, name, short_name, status
FROM public.units
ORDER BY lower(btrim(short_name)), id;

SELECT unit, count(*) AS product_count
FROM public.products
GROUP BY unit
ORDER BY unit;

SELECT id AS product_id, unit AS current_unit_value
FROM public.products
ORDER BY id;

SELECT lower(btrim(short_name)) AS normalized_short_name,
       count(*) AS unit_row_count,
       jsonb_agg(jsonb_build_object('id', id, 'name', name, 'short_name', short_name, 'status', status) ORDER BY id) AS rows
FROM public.units
GROUP BY lower(btrim(short_name))
HAVING count(*) > 1
ORDER BY lower(btrim(short_name));

SELECT (SELECT count(*) FROM public.stores) AS store_count,
       (SELECT count(*) FROM public.units) AS unit_count,
       (SELECT count(*) FROM public.products) AS product_count,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'store_id') AS units_store_id_column_exists,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'store_id') AS products_store_id_column_exists,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'unit_id') AS products_unit_id_column_exists;

/*
PROPOSED DDL, NOT EXECUTABLE UNTIL EACH GATE IS APPROVED

Preconditions to be checked by a reviewed migration, not inferred here:
- Intended Supabase project and migration baseline are confirmed.
- `public.stores(id)` is the verified primary key; `public.units.id` and
  `public.products.id` are UUID primary keys; `products.unit` is legacy text.
- A signed-off mapping assigns every existing unit row to a real store and
  every product row to a store and a unit ID. Current evidence does not supply
  such mappings: zero stores exist, all products say `pcs`, and units have
  duplicate IDs for each current label/code.
- Duplicate case-insensitive names and short names are resolved per store.
- Existing policies are fingerprinted; abort if unexpected permissive policies
  or grants exist. The known live policy names are not permission to drop any
  newly-added policy.
- `public.is_super_admin()` still exists and checks approved status.
- `public.subscriptions` still has store_id, status, start_date, and end_date.

BEGIN;

Phase A: nullable structural additions. Do not assign a default store or unit.

ALTER TABLE public.units ADD COLUMN store_id uuid;
ALTER TABLE public.units ADD COLUMN provision_key text;
ALTER TABLE public.products ADD COLUMN store_id uuid;
ALTER TABLE public.products ADD COLUMN unit_id uuid;

CREATE TABLE public.store_unit_catalog_versions (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  catalog_version text NOT NULL,
  provisioned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, catalog_version)
);

-- Backfill is intentionally omitted. It requires separately approved,
-- authoritative mappings keyed by existing units.id and products.id.
-- Never map by unit text alone and never select one duplicate unit arbitrarily.

Phase B: after approved backfill and duplicate cleanup, add keys and indexes.

ALTER TABLE public.units
  ADD CONSTRAINT units_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES public.stores(id)
  ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.products
  ADD CONSTRAINT products_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES public.stores(id)
  ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;

CREATE UNIQUE INDEX units_id_store_id_uq ON public.units (id, store_id);
CREATE UNIQUE INDEX products_id_store_id_uq ON public.products (id, store_id);
CREATE INDEX products_store_id_idx ON public.products (store_id);
CREATE INDEX products_unit_id_store_id_idx ON public.products (unit_id, store_id);
CREATE UNIQUE INDEX units_store_provision_key_uq
  ON public.units (store_id, provision_key)
  WHERE provision_key IS NOT NULL;

-- Unit identifiers and display names are unique per store, case-insensitively
-- and ignoring surrounding whitespace. Create only after mapping resolves all
-- duplicate groups. These expression indexes also begin with store_id and
-- support the store-scoped unit lookup.
CREATE UNIQUE INDEX units_store_short_name_ci_uq
  ON public.units (store_id, lower(btrim(short_name)));
CREATE UNIQUE INDEX units_store_name_ci_uq
  ON public.units (store_id, lower(btrim(name)));

ALTER TABLE public.units
  ADD CONSTRAINT units_store_id_not_null_check
  CHECK (store_id IS NOT NULL) NOT VALID;
ALTER TABLE public.products
  ADD CONSTRAINT products_store_id_not_null_check
  CHECK (store_id IS NOT NULL) NOT VALID;
ALTER TABLE public.products
  ADD CONSTRAINT products_unit_id_not_null_check
  CHECK (unit_id IS NOT NULL) NOT VALID;

ALTER TABLE public.products
  ADD CONSTRAINT products_unit_store_fkey
  FOREIGN KEY (unit_id, store_id)
  REFERENCES public.units (id, store_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;

-- Keep products.unit as a compatibility/display value during a staged app
-- rollout. After the approved mapping, set it to the selected unit's canonical
-- short_name. Application changes must write/read unit_id and store_id; do not
-- rely on text equality for authorization or ownership.

-- Validate NOT VALID constraints after an approved and complete backfill.
ALTER TABLE public.units VALIDATE CONSTRAINT units_store_id_fkey;
ALTER TABLE public.products VALIDATE CONSTRAINT products_store_id_fkey;
ALTER TABLE public.products VALIDATE CONSTRAINT products_unit_store_fkey;
ALTER TABLE public.units VALIDATE CONSTRAINT units_store_id_not_null_check;
ALTER TABLE public.products VALIDATE CONSTRAINT products_store_id_not_null_check;
ALTER TABLE public.products VALIDATE CONSTRAINT products_unit_id_not_null_check;
ALTER TABLE public.units ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN unit_id SET NOT NULL;
ALTER TABLE public.units DROP CONSTRAINT units_store_id_not_null_check;
ALTER TABLE public.products DROP CONSTRAINT products_store_id_not_null_check;
ALTER TABLE public.products DROP CONSTRAINT products_unit_id_not_null_check;

ALTER TABLE public.store_unit_catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_unit_catalog_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_unit_catalog_versions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.provision_store_unit_catalog(
  target_store_id uuid,
  target_catalog_version text,
  default_units jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF target_store_id IS NULL
    OR NULLIF(pg_catalog.btrim(target_catalog_version), '') IS NULL
    OR default_units IS NULL THEN
    RAISE EXCEPTION 'A store, catalog version, and non-empty unit array are required';
  END IF;
  target_catalog_version := pg_catalog.btrim(target_catalog_version);
  IF pg_catalog.jsonb_typeof(default_units) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Default units must be a non-empty JSON array';
  END IF;
  IF pg_catalog.jsonb_array_length(default_units) = 0 THEN
    RAISE EXCEPTION 'A store, catalog version, and non-empty unit array are required';
  END IF;

  PERFORM 1 FROM public.stores WHERE id = target_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store was not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.store_unit_catalog_versions
    WHERE store_id = target_store_id
      AND catalog_version = target_catalog_version
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(default_units)
      AS seed(provision_key text, name text, short_name text, description text)
    WHERE NULLIF(pg_catalog.btrim(provision_key), '') IS NULL
       OR NULLIF(pg_catalog.btrim(name), '') IS NULL
       OR NULLIF(pg_catalog.btrim(short_name), '') IS NULL
  ) OR EXISTS (
    SELECT provision_key
    FROM pg_catalog.jsonb_to_recordset(default_units)
      AS seed(provision_key text, name text, short_name text, description text)
    GROUP BY provision_key HAVING count(*) > 1
  ) OR EXISTS (
    SELECT lower(pg_catalog.btrim(name))
    FROM pg_catalog.jsonb_to_recordset(default_units)
      AS seed(provision_key text, name text, short_name text, description text)
    GROUP BY lower(pg_catalog.btrim(name)) HAVING count(*) > 1
  ) OR EXISTS (
    SELECT lower(pg_catalog.btrim(short_name))
    FROM pg_catalog.jsonb_to_recordset(default_units)
      AS seed(provision_key text, name text, short_name text, description text)
    GROUP BY lower(pg_catalog.btrim(short_name)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Default units must have unique non-empty provision keys, names, and short names';
  END IF;

  INSERT INTO public.units (store_id, provision_key, name, short_name, description, status)
  SELECT target_store_id, pg_catalog.btrim(seed.provision_key), pg_catalog.btrim(seed.name),
         pg_catalog.btrim(seed.short_name), seed.description, 'active'
  FROM pg_catalog.jsonb_to_recordset(default_units)
    AS seed(provision_key text, name text, short_name text, description text)
  ON CONFLICT (store_id, provision_key) WHERE provision_key IS NOT NULL DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(default_units)
      AS seed(provision_key text, name text, short_name text, description text)
    LEFT JOIN public.units AS u
      ON u.store_id = target_store_id
      AND u.provision_key = pg_catalog.btrim(seed.provision_key)
     WHERE u.id IS NULL
       OR u.name IS DISTINCT FROM pg_catalog.btrim(seed.name)
       OR u.short_name IS DISTINCT FROM pg_catalog.btrim(seed.short_name)
       OR u.description IS DISTINCT FROM seed.description
  ) THEN
    RAISE EXCEPTION 'Unit catalog provisioning did not create every default key';
  END IF;

  INSERT INTO public.store_unit_catalog_versions (store_id, catalog_version)
  VALUES (target_store_id, target_catalog_version);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_store_unit_catalog(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_store_units(target_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.stores AS s ON s.owner_id = p.id
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'store_owner'
      AND p.status = 'approved'
      AND s.id = target_store_id
      AND p.store_id = s.id
      AND EXISTS (
        SELECT 1
        FROM public.subscriptions AS sub
        WHERE sub.store_id = s.id
          AND sub.status IN ('trial', 'active')
          AND sub.start_date <= CURRENT_DATE
          AND sub.end_date >= CURRENT_DATE
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_store_units(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_store_units(uuid) TO authenticated;

-- Remove only the four verified legacy open policies after the migration has
-- rechecked their exact definitions and verified that no other policy overlaps.
DROP POLICY anon_select_units ON public.units;
DROP POLICY anon_insert_units ON public.units;
DROP POLICY anon_update_units ON public.units;
DROP POLICY anon_delete_units ON public.units;
DROP POLICY anon_select_products ON public.products;
DROP POLICY anon_insert_products ON public.products;
DROP POLICY anon_update_products ON public.products;
DROP POLICY anon_delete_products ON public.products;

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units FORCE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.units FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.units TO authenticated;
GRANT INSERT (store_id, name, short_name, description, status)
  ON TABLE public.units TO authenticated;
GRANT UPDATE (name, short_name, description, status)
  ON TABLE public.units TO authenticated;
REVOKE ALL ON TABLE public.products FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.products TO authenticated;

CREATE POLICY units_select_store_scope ON public.units
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.can_manage_store_units(store_id));
CREATE POLICY units_insert_store_scope ON public.units
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.can_manage_store_units(store_id));
CREATE POLICY units_update_store_scope ON public.units
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.can_manage_store_units(store_id))
  WITH CHECK (public.is_super_admin() OR public.can_manage_store_units(store_id));
CREATE POLICY units_delete_store_scope ON public.units
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.can_manage_store_units(store_id));

CREATE POLICY products_select_store_scope ON public.products
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.can_manage_store_units(store_id));
CREATE POLICY products_insert_store_scope ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.can_manage_store_units(store_id));
CREATE POLICY products_update_store_scope ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.can_manage_store_units(store_id))
  WITH CHECK (public.is_super_admin() OR public.can_manage_store_units(store_id));

COMMIT;
*/
