CREATE OR REPLACE FUNCTION public.get_authenticated_profile(expected_user_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  phone text,
  role text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'The database request has no authenticated user context'
      USING ERRCODE = '28000';
  END IF;

  IF expected_user_id IS DISTINCT FROM v_auth_user_id THEN
    RAISE EXCEPTION 'The requested profile UUID does not match the authenticated user'
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
    p.created_at
  FROM public.profiles AS p
  WHERE p.id = v_auth_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_authenticated_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_authenticated_profile(uuid) TO authenticated;
