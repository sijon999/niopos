CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN p.role = 'super_admin' THEN ARRAY['*']::text[]
        WHEN p.role IN ('admin', 'store_owner') THEN ARRAY[
          'pos', 'products', 'inventory', 'purchases', 'customers',
          'sales', 'reports', 'employees', 'expenses', 'settings',
          'billing', 'user_management', 'financials'
        ]::text[]
        WHEN p.role = 'manager' THEN ARRAY[
          'pos', 'products', 'sales', 'purchases', 'customers', 'reports', 'inventory'
        ]::text[]
        WHEN p.role = 'cashier' THEN ARRAY['pos', 'customers', 'sales']::text[]
        ELSE ARRAY[]::text[]
      END
      FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'approved'
    ),
    ARRAY[]::text[]
  );
$$;

REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

NOTIFY pgrst, 'reload schema';
