CREATE OR REPLACE FUNCTION public.get_dashboard_inventory_totals()
RETURNS TABLE (stock_quantity numeric, stock_value numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(COALESCE(p.stock, 0)), 0)::numeric,
    COALESCE(
      SUM(COALESCE(p.stock, 0) * COALESCE(p.cost_price, 0))
        FILTER (WHERE p.status = 'active' AND NOT COALESCE(p.is_deleted, false)),
      0
    )::numeric
  FROM public.products AS p
  WHERE p.store_id = (SELECT public.get_my_store_id());
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_inventory_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_inventory_totals() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Required publication supabase_realtime does not exist';
  END IF;

  IF to_regclass('public.settings') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'settings'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
  END IF;
END;
$$;
