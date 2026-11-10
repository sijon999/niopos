DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'sales',
    'sale_items',
    'expenses',
    'customer_payments',
    'purchases',
    'supplier_payments',
    'sale_returns',
    'purchase_returns',
    'products',
    'customers',
    'suppliers',
    'categories'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Required publication supabase_realtime does not exist';
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END;
$$;
