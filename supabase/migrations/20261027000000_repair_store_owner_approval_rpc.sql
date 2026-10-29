DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'status' AND data_type = 'text' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'approved_by' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'approved_at' AND data_type = 'timestamp with time zone'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'rejected_by' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'rejected_at' AND data_type = 'timestamp with time zone'
  ) OR to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'Expected profile approval columns and public.is_super_admin(); inspect before migration';
  END IF;
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
SET row_security = off
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an approved Super Admin can change account approval status'
      USING ERRCODE = '42501';
  END IF;

  IF requested_status IS NULL
    OR requested_status NOT IN ('approved', 'rejected', 'suspended') THEN
    RAISE EXCEPTION 'Unsupported account status';
  END IF;

  UPDATE public.profiles AS p
  SET status = requested_status,
      approved_by = CASE
        WHEN requested_status = 'approved' THEN (SELECT auth.uid())
        ELSE p.approved_by
      END,
      approved_at = CASE
        WHEN requested_status = 'approved' THEN pg_catalog.now()
        ELSE p.approved_at
      END,
      rejected_by = CASE
        WHEN requested_status = 'rejected' THEN (SELECT auth.uid())
        WHEN requested_status = 'approved' THEN NULL
        ELSE p.rejected_by
      END,
      rejected_at = CASE
        WHEN requested_status = 'rejected' THEN pg_catalog.now()
        WHEN requested_status = 'approved' THEN NULL
        ELSE p.rejected_at
      END
  WHERE p.id = target_user_id
    AND p.role IN ('admin', 'store_owner')
  RETURNING p.id INTO v_profile_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Eligible user profile was not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_store_owner_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_store_owner_status(uuid, text) TO authenticated;