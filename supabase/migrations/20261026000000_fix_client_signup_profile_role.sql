DO $$
DECLARE
  v_role_constraint_count integer;
  v_role_constraint_definition text;
  v_status_constraint_count integer;
  v_status_constraint_definition text;
  v_profile_store_attnum smallint;
  v_store_id_attnum smallint;
  v_owner_id_attnum smallint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'email' AND data_type = 'text' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'full_name' AND data_type = 'text' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'phone' AND data_type = 'text' AND is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'role' AND data_type = 'text' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'status' AND data_type = 'text' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'store_id' AND data_type = 'uuid' AND is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'owner_id' AND data_type = 'uuid' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'store_name' AND data_type = 'text' AND is_nullable = 'NO'
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_class AS child ON child.oid = c.conrelid
    JOIN pg_namespace AS child_schema ON child_schema.oid = child.relnamespace
    JOIN pg_class AS parent ON parent.oid = c.confrelid
    JOIN pg_namespace AS parent_schema ON parent_schema.oid = parent.relnamespace
    JOIN pg_attribute AS child_id ON child_id.attrelid = child.oid AND child_id.attname = 'id'
    JOIN pg_attribute AS auth_id ON auth_id.attrelid = parent.oid AND auth_id.attname = 'id'
    WHERE child_schema.nspname = 'public' AND child.relname = 'profiles'
      AND parent_schema.nspname = 'auth' AND parent.relname = 'users'
      AND c.contype = 'f'
      AND c.conkey = ARRAY[child_id.attnum]::smallint[]
      AND c.confkey = ARRAY[auth_id.attnum]::smallint[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_class AS child ON child.oid = c.conrelid
    JOIN pg_namespace AS child_schema ON child_schema.oid = child.relnamespace
    JOIN pg_class AS parent ON parent.oid = c.confrelid
    JOIN pg_namespace AS parent_schema ON parent_schema.oid = parent.relnamespace
    JOIN pg_attribute AS owner_id ON owner_id.attrelid = child.oid AND owner_id.attname = 'owner_id'
    JOIN pg_attribute AS profile_id ON profile_id.attrelid = parent.oid AND profile_id.attname = 'id'
    WHERE child_schema.nspname = 'public' AND child.relname = 'stores'
      AND parent_schema.nspname = 'public' AND parent.relname = 'profiles'
      AND c.contype = 'f'
      AND c.conkey = ARRAY[owner_id.attnum]::smallint[]
      AND c.confkey = ARRAY[profile_id.attnum]::smallint[]
  ) THEN
    RAISE EXCEPTION 'Expected profiles/auth and stores/owner foreign keys; inspect before migration';
  END IF;

  SELECT count(*)
  INTO v_role_constraint_count
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';

  SELECT pg_get_constraintdef(oid)
  INTO v_role_constraint_definition
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND conname = 'profiles_role_check'
    AND contype = 'c';

  IF v_role_constraint_count <> 1 OR v_role_constraint_definition IS NULL THEN
    RAISE EXCEPTION 'Expected only profiles_role_check; inspect role constraints before migration';
  END IF;

  IF v_role_constraint_definition NOT IN (
    'CHECK (role = ANY (ARRAY[''super_admin''::text, ''admin''::text, ''manager''::text, ''cashier''::text, ''staff''::text, ''user''::text]))',
    'CHECK (role = ANY (ARRAY[''super_admin''::text, ''admin''::text, ''manager''::text, ''cashier''::text, ''staff''::text, ''user''::text, ''store_owner''::text]))'
  ) THEN
    RAISE EXCEPTION 'Unexpected profiles_role_check definition; inspect before migration';
  END IF;

  SELECT count(*)
  INTO v_status_constraint_count
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  SELECT pg_get_constraintdef(oid)
  INTO v_status_constraint_definition
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND conname = 'profiles_status_check'
    AND contype = 'c';

  IF v_status_constraint_count <> 1 OR v_status_constraint_definition <>
    'CHECK (status = ANY (ARRAY[''pending''::text, ''approved''::text, ''rejected''::text, ''suspended''::text]))' THEN
    RAISE EXCEPTION 'Unexpected profiles_status_check definition; inspect before migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE role NOT IN ('super_admin', 'admin', 'manager', 'cashier', 'staff', 'user', 'store_owner')
       OR status NOT IN ('pending', 'approved', 'rejected', 'suspended')
  ) THEN
    RAISE EXCEPTION 'Unexpected profile role or status value; inspect existing rows';
  END IF;

  IF v_role_constraint_definition NOT LIKE '%store_owner%' THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('super_admin', 'admin', 'manager', 'cashier', 'staff', 'user', 'store_owner'));
  END IF;

  SELECT attnum INTO v_profile_store_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.profiles'::regclass AND attname = 'store_id' AND NOT attisdropped;

  SELECT attnum INTO v_store_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.stores'::regclass AND attname = 'id' AND NOT attisdropped;

  SELECT attnum INTO v_owner_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.stores'::regclass AND attname = 'owner_id' AND NOT attisdropped;

  IF EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.store_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.stores AS s WHERE s.id = p.store_id)
  ) OR EXISTS (
    SELECT 1 FROM public.profiles AS p
    JOIN public.stores AS s ON s.id = p.store_id
    WHERE s.owner_id <> p.id
  ) THEN
    RAISE EXCEPTION 'Existing profile store links are dangling or point to another owner';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stores GROUP BY owner_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'An owner has multiple stores; resolve ownership before migration';
  END IF;

  IF to_regclass('public.stores_owner_id_unique_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_index AS i
    WHERE i.indexrelid = to_regclass('public.stores_owner_id_unique_idx')
      AND i.indrelid = 'public.stores'::regclass
      AND i.indisunique AND i.indisvalid AND i.indpred IS NULL
      AND i.indnkeyatts = 1 AND i.indkey[0] = v_owner_id_attnum
  ) THEN
    RAISE EXCEPTION 'stores_owner_id_unique_idx exists but is not a unique owner_id index';
  END IF;

  IF to_regclass('public.stores_owner_id_unique_idx') IS NULL THEN
    CREATE UNIQUE INDEX stores_owner_id_unique_idx ON public.stores (owner_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_store_id_fkey'
      AND NOT (
        contype = 'f'
        AND confrelid = 'public.stores'::regclass
        AND conkey = ARRAY[v_profile_store_attnum]::smallint[]
        AND confkey = ARRAY[v_store_id_attnum]::smallint[]
        AND confdeltype = 'n'
      )
  ) THEN
    RAISE EXCEPTION 'profiles_store_id_fkey exists with an unexpected definition';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_store_id_fkey'
      AND contype = 'f'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
DECLARE
  v_insert_triggers integer;
BEGIN
  SELECT count(*)
  INTO v_insert_triggers
  FROM pg_trigger AS t
  JOIN pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'auth' AND c.relname = 'users'
    AND NOT t.tgisinternal AND (t.tgtype & 4) = 4;

  IF v_insert_triggers <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_proc AS p ON p.oid = t.tgfoid
    WHERE n.nspname = 'auth' AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
      AND NOT t.tgisinternal AND (t.tgtype & 4) = 4
      AND (t.tgtype & 1) = 1 AND (t.tgtype & 2) = 0
      AND t.tgfoid = 'public.handle_new_user_profile()'::regprocedure
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=""']::text[]
      AND (
        (p.prosrc ILIKE '%ON CONFLICT (id) DO NOTHING%'
          AND p.prosrc ILIKE '%''admin''%')
        OR
        (p.prosrc ILIKE '%employee_invite_token%'
          AND p.prosrc ILIKE '%''store_owner''%'
            AND p.prosrc ILIKE '%ON CONFLICT (owner_id) DO NOTHING%')
          OR
          (p.prosrc ILIKE '%employee_invite_token%'
            AND p.prosrc ILIKE '%''store_owner''%'
            AND p.prosrc ILIKE '%ON CONFLICT (id) DO NOTHING%'
            AND p.prosrc ILIKE '%ON CONFLICT (owner_id) DO NOTHING%'
            AND p.prosrc ILIKE '%An incompatible pre-existing profile%')
      )
  ) THEN
    RAISE EXCEPTION 'Auth INSERT trigger or audited handler definition changed; inspect before migration';
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
  v_profile_status text;
  v_profile_store_id uuid;
  v_store_id uuid;
  v_existing_store_name text;
  v_owned_store_count integer;
BEGIN
  IF NEW.email IS NULL OR NULLIF(pg_catalog.btrim(NEW.email), '') IS NULL THEN
    RAISE EXCEPTION 'A valid email is required to create a profile';
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
    'store_owner',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT p.email, p.role, p.status, p.store_id
  INTO v_profile_email, v_profile_role, v_profile_status, v_profile_store_id
  FROM public.profiles AS p
  WHERE p.id = NEW.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The signup profile could not be created';
  END IF;

  IF pg_catalog.lower(v_profile_email) <> pg_catalog.lower(NEW.email)
    OR v_profile_role <> 'store_owner'
    OR v_profile_status <> 'pending' THEN
    RAISE EXCEPTION 'An incompatible pre-existing profile exists for this Auth user';
  END IF;

  SELECT count(*)
  INTO v_owned_store_count
  FROM public.stores AS s
  WHERE s.owner_id = NEW.id;

  IF v_owned_store_count > 1 THEN
    RAISE EXCEPTION 'This account owns multiple stores; resolve ownership before signup can continue';
  ELSIF v_owned_store_count = 1 THEN
    SELECT s.id, s.store_name
    INTO v_store_id, v_existing_store_name
    FROM public.stores AS s
    WHERE s.owner_id = NEW.id
    FOR UPDATE;

    IF v_profile_store_id IS NOT NULL AND v_profile_store_id <> v_store_id THEN
      RAISE EXCEPTION 'The profile is linked to a different store than its owner record';
    END IF;

    IF NULLIF(pg_catalog.btrim(v_existing_store_name), '') IS NULL THEN
      RAISE EXCEPTION 'The existing owner store has no usable store name';
    END IF;
  ELSE
    IF v_profile_store_id IS NOT NULL THEN
      RAISE EXCEPTION 'The profile references a store but owns no matching store';
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
    ON CONFLICT (owner_id) DO NOTHING
    RETURNING id INTO v_store_id;

    IF v_store_id IS NULL THEN
      SELECT count(*)
      INTO v_owned_store_count
      FROM public.stores AS s
      WHERE s.owner_id = NEW.id;

      IF v_owned_store_count <> 1 THEN
        RAISE EXCEPTION 'A single store could not be resolved for this owner';
      END IF;

      SELECT s.id, s.store_name
      INTO v_store_id, v_existing_store_name
      FROM public.stores AS s
      WHERE s.owner_id = NEW.id
      FOR UPDATE;

      IF NULLIF(pg_catalog.btrim(v_existing_store_name), '') IS NULL THEN
        RAISE EXCEPTION 'The existing owner store has no usable store name';
      END IF;
    END IF;
  END IF;

  UPDATE public.profiles AS p
  SET store_id = v_store_id
  WHERE p.id = NEW.id
    AND p.store_id IS DISTINCT FROM v_store_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
