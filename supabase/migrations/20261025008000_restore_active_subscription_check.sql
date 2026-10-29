CREATE OR REPLACE FUNCTION public.has_active_subscription()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT
    (SELECT public.is_super_admin())
    OR (SELECT public.get_my_store_id()) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.has_active_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription() TO authenticated;

NOTIFY pgrst, 'reload schema';
