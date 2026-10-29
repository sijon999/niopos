DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'audit_logs',
    'bank_accounts',
    'bank_transactions',
    'barcode_history',
    'brands',
    'cash_transactions',
    'categories',
    'customer_discount_history',
    'customer_discount_offers',
    'customer_groups',
    'customer_payments',
    'customers',
    'discount_offer_usage',
    'discount_offers',
    'employees',
    'expense_categories',
    'expenses',
    'held_orders',
    'product_variants',
    'products',
    'purchase_items',
    'purchase_return_items',
    'purchase_returns',
    'purchases',
    'roles',
    'sale_items',
    'sale_return_items',
    'sale_returns',
    'sales',
    'settings',
    'stock_adjustments',
    'stock_movements',
    'stock_reconciliations',
    'supplier_payments',
    'suppliers',
    'units'
  ];
BEGIN
  IF to_regprocedure('public.is_super_admin()') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.stores') IS NULL THEN
    RAISE EXCEPTION 'Expected approved-admin helpers and tenant tables are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'store_id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'owner_id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'Expected profile-to-store ownership columns are missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stores GROUP BY owner_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'An account owns multiple stores; resolve ownership before enabling isolation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.role IN ('admin', 'store_owner')
      AND p.store_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.stores s
        WHERE s.id = p.store_id AND s.owner_id = p.id
      )
  ) THEN
    RAISE EXCEPTION 'A profile references a store it does not own; resolve ownership before enabling isolation';
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'Expected business table public.% is missing', v_table;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_store_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT s.id
  FROM public.profiles AS p
  JOIN public.stores AS s
    ON s.id = p.store_id
   AND s.owner_id = p.id
  WHERE p.id = (SELECT auth.uid())
    AND p.role IN ('admin', 'store_owner')
    AND p.status = 'approved'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_store_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_store_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_tenant_store_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    IF NEW.store_id IS NULL THEN
      RAISE EXCEPTION 'A store_id is required for trusted backend writes'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_store_id := (SELECT public.get_my_store_id());
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'An approved store owner account is required'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.store_id IS DISTINCT FROM v_store_id THEN
    RAISE EXCEPTION 'A record cannot be changed outside the current store'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.store_id IS NOT NULL AND NEW.store_id <> v_store_id THEN
    RAISE EXCEPTION 'A record cannot be assigned to another store'
      USING ERRCODE = '42501';
  END IF;

  NEW.store_id := v_store_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_tenant_foreign_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_row jsonb := pg_catalog.to_jsonb(NEW);
  v_constraint record;
  v_key record;
  v_match text;
  v_sql text;
  v_parent_matches boolean;
  v_has_null boolean;
BEGIN
  FOR v_constraint IN
    SELECT
      parent_namespace.nspname AS parent_schema,
      parent_table.relname AS parent_table,
      constraint_row.conkey,
      constraint_row.confkey
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS parent_table
      ON parent_table.oid = constraint_row.confrelid
    JOIN pg_catalog.pg_namespace AS parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    WHERE constraint_row.conrelid = TG_RELID
      AND constraint_row.contype = 'f'
      AND parent_namespace.nspname = 'public'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS store_column
        WHERE store_column.attrelid = parent_table.oid
          AND store_column.attname = 'store_id'
          AND NOT store_column.attisdropped
      )
  LOOP
    v_match := '';
    v_has_null := false;

    FOR v_key IN
      SELECT
        child_column.attname AS child_column,
        parent_column.attname AS parent_column
      FROM pg_catalog.generate_subscripts(v_constraint.conkey, 1) AS key_position(position)
      JOIN pg_catalog.pg_attribute AS child_column
        ON child_column.attrelid = TG_RELID
       AND child_column.attnum = v_constraint.conkey[key_position.position]
      JOIN pg_catalog.pg_attribute AS parent_column
        ON parent_column.attrelid = format(
          '%I.%I', v_constraint.parent_schema, v_constraint.parent_table
        )::regclass
       AND parent_column.attnum = v_constraint.confkey[key_position.position]
      ORDER BY key_position.position
    LOOP
      IF v_row ->> v_key.child_column IS NULL THEN
        v_has_null := true;
        EXIT;
      END IF;

      v_match := v_match || CASE WHEN v_match = '' THEN '' ELSE ' AND ' END
        || pg_catalog.format(
          'parent.%I::text = ($1 ->> %L)',
          v_key.parent_column,
          v_key.child_column
        );
    END LOOP;

    IF NOT v_has_null AND v_match <> '' THEN
      v_sql := pg_catalog.format(
        'SELECT EXISTS (SELECT 1 FROM %I.%I AS parent WHERE parent.store_id = $2 AND %s)',
        v_constraint.parent_schema,
        v_constraint.parent_table,
        v_match
      );
      EXECUTE v_sql INTO v_parent_matches USING v_row, NEW.store_id;

      IF NOT v_parent_matches THEN
        RAISE EXCEPTION 'A related record must belong to the same store'
          USING ERRCODE = '23503';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_store_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_tenant_foreign_keys() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table text;
  v_policy record;
  v_tables text[] := ARRAY[
    'audit_logs',
    'bank_accounts',
    'bank_transactions',
    'barcode_history',
    'brands',
    'cash_transactions',
    'categories',
    'customer_discount_history',
    'customer_discount_offers',
    'customer_groups',
    'customer_payments',
    'customers',
    'discount_offer_usage',
    'discount_offers',
    'employees',
    'expense_categories',
    'expenses',
    'held_orders',
    'product_variants',
    'products',
    'purchase_items',
    'purchase_return_items',
    'purchase_returns',
    'purchases',
    'roles',
    'sale_items',
    'sale_return_items',
    'sale_returns',
    'sales',
    'settings',
    'stock_adjustments',
    'stock_movements',
    'stock_reconciliations',
    'supplier_payments',
    'suppliers',
    'units'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS store_id uuid',
      v_table
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = format('public.%I', v_table)::regclass
        AND constraint_row.conname = 'store_scope_fkey'
        AND constraint_row.contype = 'f'
        AND constraint_row.confrelid = 'public.stores'::regclass
    ) THEN
      EXECUTE pg_catalog.format(
        'ALTER TABLE public.%I ADD CONSTRAINT store_scope_fkey '
        'FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT NOT VALID',
        v_table
      );
    END IF;

    EXECUTE pg_catalog.format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (store_id)',
      v_table || '_store_id_idx',
      v_table
    );

    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE pg_catalog.format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);

    FOR v_policy IN
      SELECT policyname
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename = v_table
    LOOP
      EXECUTE pg_catalog.format(
        'DROP POLICY %I ON public.%I',
        v_policy.policyname,
        v_table
      );
    END LOOP;

    EXECUTE pg_catalog.format(
      'CREATE POLICY store_isolation ON public.%I FOR ALL TO authenticated '
      'USING (store_id = (SELECT public.get_my_store_id())) '
      'WITH CHECK (store_id = (SELECT public.get_my_store_id()))',
      v_table
    );

    EXECUTE pg_catalog.format(
      'DROP TRIGGER IF EXISTS a_set_tenant_store_id ON public.%I',
      v_table
    );
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER a_set_tenant_store_id BEFORE INSERT OR UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.set_tenant_store_id()',
      v_table
    );
    EXECUTE pg_catalog.format(
      'DROP TRIGGER IF EXISTS z_validate_tenant_foreign_keys ON public.%I',
      v_table
    );
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER z_validate_tenant_foreign_keys BEFORE INSERT OR UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_foreign_keys()',
      v_table
    );

    EXECUTE pg_catalog.format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      v_table
    );
    EXECUTE pg_catalog.format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      v_table
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Stores are viewable by their owner or super admin" ON public.stores;
DROP POLICY IF EXISTS "Stores can be inserted by their owner" ON public.stores;
DROP POLICY IF EXISTS "Stores can be managed by their owner or super admin" ON public.stores;
DROP POLICY IF EXISTS stores_select_owner_or_super_admin ON public.stores;
CREATE POLICY stores_select_owner_or_super_admin
  ON public.stores
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      owner_id = (SELECT auth.uid())
      AND id = (SELECT public.get_my_store_id())
    )
  );

REVOKE ALL ON TABLE public.stores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.stores TO authenticated;

REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated;

ALTER VIEW public.purchase_expense_report SET (security_invoker = true);
REVOKE ALL ON TABLE public.purchase_expense_report FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_expense_report TO authenticated;

ALTER FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric)
  SECURITY INVOKER;
ALTER FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid)
  SECURITY INVOKER;
ALTER FUNCTION public.cancel_sale(uuid) SECURITY INVOKER;
ALTER FUNCTION public.complete_purchase_order(uuid, jsonb, numeric, numeric, numeric, text, text, text)
  SECURITY INVOKER;
ALTER FUNCTION public.cancel_purchase_order(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_customer_discount_summary(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_customer_discount_history(uuid, date, date, text, uuid, text, text)
  SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_sale(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_purchase_order(uuid, jsonb, numeric, numeric, numeric, text, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_purchase_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_discount_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_discount_history(uuid, date, date, text, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sale(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_purchase_order(uuid, jsonb, numeric, numeric, numeric, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_discount_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_discount_history(uuid, date, date, text, uuid, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_purchase_expense_report_summary(
  timestamptz, timestamptz, text, text, uuid, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_expense_report_summary(
  timestamptz, timestamptz, text, text, uuid, uuid, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
