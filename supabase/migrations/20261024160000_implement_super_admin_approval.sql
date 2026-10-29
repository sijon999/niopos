CREATE OR REPLACE FUNCTION public.create_profile_for_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_name text;
BEGIN
  v_store_name := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'store_name'), '');
  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'A store name is required to register an account';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'phone'), ''),
    'store_owner',
    'pending'
  );

  INSERT INTO public.stores (owner_id, name, phone, email, address, status)
  VALUES (
    NEW.id,
    v_store_name,
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'store_phone'), ''),
    NEW.email,
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'store_address'), ''),
    'pending'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_store_owner_status(
  target_user_id uuid,
  requested_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'super_admin'
      AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only an approved Super Admin can change account approval status'
      USING ERRCODE = '42501';
  END IF;

  IF requested_status NOT IN ('approved', 'rejected', 'suspended') THEN
    RAISE EXCEPTION 'Unsupported account status';
  END IF;

  UPDATE public.profiles
  SET status = requested_status
  WHERE id = target_user_id
    AND role = 'store_owner'
  RETURNING id INTO v_profile_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Store owner profile was not found';
  END IF;

  UPDATE public.stores
  SET status = requested_status
  WHERE owner_id = v_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_store_owner_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_store_owner_status(uuid, text) TO authenticated;
