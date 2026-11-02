CREATE SEQUENCE IF NOT EXISTS public.sales_invoice_number_seq
  AS bigint
  MINVALUE 1
  MAXVALUE 16777215
  START 1
  NO CYCLE;

DO $$
DECLARE
  v_max_existing_number bigint;
  v_function_definition text;
  v_target text := $target$substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)$target$;
  v_replacement text := $replacement$lpad(to_hex(nextval('public.sales_invoice_number_seq')), 6, '0')$replacement$;
  v_match_position integer;
BEGIN
  SELECT COALESCE(MAX(('x' || substr(invoice_number, 5, 6))::bit(24)::bigint), 0)
  INTO v_max_existing_number
  FROM public.sales
  WHERE invoice_number ~ '^INV-[0-9a-f]{6}$';

  PERFORM setval(
    'public.sales_invoice_number_seq',
    GREATEST(v_max_existing_number, 1),
    v_max_existing_number > 0
  );

  v_function_definition := pg_get_functiondef(
    'public.complete_pos_sale_internal(jsonb, uuid, numeric, text, numeric, uuid)'::regprocedure
  );
  v_match_position := position(v_target IN v_function_definition);

  IF v_match_position = 0
    OR position(v_target IN substring(v_function_definition FROM v_match_position + length(v_target))) > 0 THEN
    RAISE EXCEPTION 'Expected one random suffix in complete_pos_sale_internal invoice generation';
  END IF;

  EXECUTE replace(v_function_definition, v_target, v_replacement);
END;
$$;
