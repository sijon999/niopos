ALTER FUNCTION public.update_updated_at_column()
  SET search_path = '';

REVOKE ALL ON FUNCTION public.create_profile_for_auth_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column()
  FROM PUBLIC, anon, authenticated;
