DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Required publication supabase_realtime does not exist';
  END IF;

  IF to_regclass('public.employees') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'employees'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
  END IF;
END;
$$;
