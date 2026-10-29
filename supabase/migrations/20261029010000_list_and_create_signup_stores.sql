DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'store_id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'owner_id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'store_name' AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'store_phone' AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'store_address' AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'Unexpected profiles/stores schema; inspect before migration';
  END IF;

  IF to_regprocedure('public.handle_new_user_profile()') IS NULL
    OR (
      SELECT count(*)
      FROM pg_catalog.pg_trigger AS t
      JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'auth'
        AND c.relname = 'users'
        AND NOT t.tgisinternal
        AND (t.tgtype & 4) = 4
        AND t.tgfoid = 'public.handle_new_user_profile()'::regprocedure
    ) <> 1 THEN
    RAISE EXCEPTION 'Expected the auth signup trigger to call public.handle_new_user_profile()';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stores
    GROUP BY owner_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'An account owns multiple stores; resolve ownership before migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.role IN ('admin', 'store_owner')
      AND p.store_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.stores AS s
        WHERE s.id = p.store_id AND s.owner_id = p.id
      )
  ) THEN
    RAISE EXCEPTION 'A signup account references a store it does not own; resolve before migration';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_full_name text;
  v_store_name text;
  v_profile_email text;
  v_profile_role text;
  v_profile_store_id uuid;
  v_store_id uuid;
  v_store_count integer;
BEGIN
  IF NEW.email IS NULL OR NULLIF(pg_catalog.btrim(NEW.email), '') IS NULL THEN
    RAISE EXCEPTION 'A valid email is required to create an account';
  END IF;

  IF NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'employee_invite_token'), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Employee invitations are not configured for this project';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.id::text, 0));

  v_full_name := COALESCE(
    NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'name'), ''),
    NULLIF(pg_catalog.split_part(NEW.email, '@', 1), ''),
    'New User'
  );

  INSERT INTO public.profiles (id, email, full_name, phone, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'phone'), ''),
    'admin',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT p.email, p.role, p.store_id
  INTO v_profile_email, v_profile_role, v_profile_store_id
  FROM public.profiles AS p
  WHERE p.id = NEW.id
  FOR UPDATE;

  IF NOT FOUND
    OR pg_catalog.lower(v_profile_email) <> pg_catalog.lower(NEW.email)
    OR v_profile_role NOT IN ('admin', 'store_owner') THEN
    RAISE EXCEPTION 'An incompatible profile exists for this Auth user';
  END IF;

  SELECT count(*), (pg_catalog.array_agg(s.id))[1]
  INTO v_store_count, v_store_id
  FROM public.stores AS s
  WHERE s.owner_id = NEW.id;

  IF v_store_count > 1 THEN
    RAISE EXCEPTION 'This account owns multiple stores; resolve ownership before signup can continue';
  ELSIF v_store_count = 0 THEN
    IF v_profile_store_id IS NOT NULL THEN
      RAISE EXCEPTION 'The profile references a store it does not own';
    END IF;

    v_store_name := COALESCE(
      NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'store_name'), ''),
      v_full_name || '''s Store'
    );

    INSERT INTO public.stores (owner_id, store_name, store_phone, store_address)
    VALUES (
      NEW.id,
      v_store_name,
      NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'store_phone'), ''),
      NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'store_address'), '')
    )
    RETURNING id INTO v_store_id;
  ELSIF v_profile_store_id IS NOT NULL AND v_profile_store_id <> v_store_id THEN
    RAISE EXCEPTION 'The profile is linked to a different store than its owner record';
  END IF;

  UPDATE public.profiles AS p
  SET store_id = v_store_id
  WHERE p.id = NEW.id
    AND p.store_id IS DISTINCT FROM v_store_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.stores (owner_id, store_name, store_phone, store_address)
SELECT
  p.id,
  COALESCE(
    NULLIF(pg_catalog.btrim(u.raw_user_meta_data ->> 'store_name'), ''),
    NULLIF(pg_catalog.btrim(p.full_name), '') || '''s Store'
  ),
  COALESCE(
    NULLIF(pg_catalog.btrim(u.raw_user_meta_data ->> 'store_phone'), ''),
    NULLIF(pg_catalog.btrim(p.phone), '')
  ),
  NULLIF(pg_catalog.btrim(u.raw_user_meta_data ->> 'store_address'), '')
FROM public.profiles AS p
LEFT JOIN auth.users AS u ON u.id = p.id
WHERE p.role IN ('admin', 'store_owner')
  AND NOT EXISTS (
    SELECT 1 FROM public.stores AS s WHERE s.owner_id = p.id
  );

UPDATE public.profiles AS p
SET store_id = s.id
FROM public.stores AS s
WHERE s.owner_id = p.id
  AND p.role IN ('admin', 'store_owner')
  AND p.store_id IS DISTINCT FROM s.id;

NOTIFY pgrst, 'reload schema';
