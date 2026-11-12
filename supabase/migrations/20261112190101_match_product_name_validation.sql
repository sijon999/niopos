CREATE OR REPLACE FUNCTION public.reject_invalid_product_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.name IS NULL
    OR pg_catalog.translate(
      NEW.name,
      pg_catalog.chr(9) || pg_catalog.chr(10) || pg_catalog.chr(11)
        || pg_catalog.chr(12) || pg_catalog.chr(13) || ' '
        || pg_catalog.chr(160) || pg_catalog.chr(5760)
        || pg_catalog.chr(8192) || pg_catalog.chr(8193)
        || pg_catalog.chr(8194) || pg_catalog.chr(8195)
        || pg_catalog.chr(8196) || pg_catalog.chr(8197)
        || pg_catalog.chr(8198) || pg_catalog.chr(8199)
        || pg_catalog.chr(8200) || pg_catalog.chr(8201)
        || pg_catalog.chr(8202) || pg_catalog.chr(8232)
        || pg_catalog.chr(8233) || pg_catalog.chr(8239)
        || pg_catalog.chr(8287) || pg_catalog.chr(12288)
        || pg_catalog.chr(65279) || '?'
        || pg_catalog.chr(65533) || pg_catalog.chr(9633)
        || pg_catalog.chr(9632) || pg_catalog.chr(9647)
        || pg_catalog.chr(9723) || pg_catalog.chr(9724),
      ''
    ) = ''
  THEN
    RAISE EXCEPTION 'Product name must not be empty or contain only placeholder characters.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
