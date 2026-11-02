DO $$
DECLARE
  v_function_definition text;
  v_target text := 'to_char(clock_timestamp(), ''YYMMDDHH24MISSMS'') || ''-'' || ';
  v_match_position integer;
BEGIN
  v_function_definition := pg_get_functiondef(
    'public.complete_pos_sale_internal(jsonb, uuid, numeric, text, numeric, uuid)'::regprocedure
  );
  v_match_position := position(v_target IN v_function_definition);

  IF v_match_position = 0
    OR position(v_target IN substring(v_function_definition FROM v_match_position + length(v_target))) > 0 THEN
    RAISE EXCEPTION 'Expected one timestamp prefix in complete_pos_sale_internal invoice generation';
  END IF;

  EXECUTE replace(v_function_definition, v_target, '');
END;
$$;
