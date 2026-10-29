CREATE OR REPLACE FUNCTION public.get_pending_user_approvals()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  phone text,
  role text,
  status text,
  created_at timestamptz,
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
    RAISE EXCEPTION 'Only an approved Super Admin can view pending user approvals'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.phone,
    p.role,
    p.status,
    p.created_at,
    COALESCE(
      array_agg(s.name ORDER BY s.created_at) FILTER (WHERE s.id IS NOT NULL),
      ARRAY[]::text[]
    )
  FROM public.profiles AS p
  LEFT JOIN public.stores AS s ON s.owner_id = p.id
  WHERE p.status = 'pending'
  GROUP BY p.id
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_user_approvals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_user_approvals() TO authenticated;

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
  v_role text;
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
    AND p.role <> 'super_admin'
  RETURNING p.id, p.role INTO v_profile_id, v_role;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Eligible user profile was not found';
  END IF;

  IF v_role = 'store_owner' THEN
    UPDATE public.stores
    SET status = requested_status
    WHERE owner_id = v_profile_id;
  ELSIF v_role IN ('manager', 'cashier') THEN
    UPDATE public.store_memberships
    SET status = requested_status
    WHERE user_id = v_profile_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_store_owner_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_store_owner_status(uuid, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'The supabase_realtime publication is required for live signup updates';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  END IF;
END;
$$;
