CREATE OR REPLACE FUNCTION public.current_store_tax_rate()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_store_id uuid;
  v_tax_rate numeric;
BEGIN
  v_store_id := (SELECT public.get_my_store_id());
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'An approved store account is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT tax_rate
  INTO v_tax_rate
  FROM public.settings
  WHERE store_id = v_store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store settings are not configured';
  END IF;

  RETURN COALESCE(v_tax_rate, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.current_store_tax_rate() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_function_definition text;
  v_target text := 'v_tax := ROUND((v_subtotal - v_total_item_discounts - v_discount - v_offer_discount) * 0.00, 2);';
  v_replacement text := 'v_tax := ROUND((v_subtotal - v_total_item_discounts - v_discount - v_offer_discount) * public.current_store_tax_rate() / 100.0, 2);';
  v_match_position integer;
BEGIN
  v_function_definition := pg_get_functiondef(
    'public.complete_pos_sale_internal(jsonb, uuid, numeric, text, numeric, uuid)'::regprocedure
  );
  v_match_position := position(v_target IN v_function_definition);

  IF v_match_position = 0
    OR position(v_target IN substring(v_function_definition FROM v_match_position + length(v_target))) > 0 THEN
    RAISE EXCEPTION 'Expected one fixed-tax calculation in complete_pos_sale_internal';
  END IF;

  EXECUTE replace(v_function_definition, v_target, v_replacement);
END;
$$;
