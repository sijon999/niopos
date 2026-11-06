DO $$
DECLARE
  v_definition text;
  v_old_footer text := 'Thank you for shopping with StyleBazaar!';
BEGIN
  v_definition := pg_get_functiondef(
    'public.create_store_settings()'::regprocedure
  );

  IF position(v_old_footer IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected default receipt footer was not found';
  END IF;

  EXECUTE replace(
    v_definition,
    v_old_footer,
    'Thank you for shopping with Nirvul POS!'
  );
END;
$$;
