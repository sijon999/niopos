CREATE OR REPLACE FUNCTION public.is_super_admin()
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
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'super_admin'
      AND p.status = 'approved'
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_store_owner_approvals()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  phone text,
  status text,
  created_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  store_names text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an approved Super Admin can view store-owner approvals'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.phone,
    p.status,
    p.created_at,
    p.approved_by,
    p.approved_at,
    p.rejected_by,
    p.rejected_at,
    COALESCE(
      array_agg(s.name ORDER BY s.created_at) FILTER (WHERE s.id IS NOT NULL),
      ARRAY[]::text[]
    )
  FROM public.profiles AS p
  LEFT JOIN public.stores AS s ON s.owner_id = p.id
  WHERE p.role = 'store_owner'
  GROUP BY p.id
  ORDER BY p.created_at DESC;
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
        WHEN requested_status = 'approved' THEN now()
        ELSE p.approved_at
      END,
      rejected_by = CASE
        WHEN requested_status = 'rejected' THEN (SELECT auth.uid())
        WHEN requested_status = 'approved' THEN NULL
        ELSE p.rejected_by
      END,
      rejected_at = CASE
        WHEN requested_status = 'rejected' THEN now()
        WHEN requested_status = 'approved' THEN NULL
        ELSE p.rejected_at
      END
  WHERE p.id = target_user_id
    AND p.role = 'store_owner'
  RETURNING p.id INTO v_profile_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Store owner profile was not found';
  END IF;

  UPDATE public.stores
  SET status = requested_status
  WHERE owner_id = v_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_store_owner_approvals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_owner_approvals() TO authenticated;
REVOKE ALL ON FUNCTION public.set_store_owner_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_store_owner_status(uuid, text) TO authenticated;
