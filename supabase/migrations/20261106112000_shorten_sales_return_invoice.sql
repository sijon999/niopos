DO $$
DECLARE
  v_definition text;
  v_old_expression text := $pattern$v_invoice_number\s*:=\s*'RET-'\s*\|\|\s*to_char\(clock_timestamp\(\),\s*'YYMMDDHH24MISSMS'\)\s*\|\|\s*'-'\s*\|\|\s*upper\(substr\(replace\(gen_random_uuid\(\)::text,\s*'-',\s*''\),\s*1,\s*8\)\);$pattern$;
  v_new_expression text := $replacement$v_invoice_number := 'RET-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));$replacement$;
BEGIN
  v_definition := pg_get_functiondef(
    'public.complete_sale_return(uuid,jsonb,text,uuid)'::regprocedure
  );

  IF v_definition !~ v_old_expression THEN
    RAISE EXCEPTION 'Expected return invoice number expression was not found';
  END IF;

  EXECUTE regexp_replace(v_definition, v_old_expression, v_new_expression);
END;
$$;
