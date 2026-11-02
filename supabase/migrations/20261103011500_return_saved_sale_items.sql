DO $$
DECLARE
  v_function_definition text;
  v_target text := $target$'customer_address_snapshot', (SELECT c.address FROM public.customers c WHERE c.id = p_customer_id)$target$;
  v_replacement text := $replacement$'customer_address_snapshot', (SELECT c.address FROM public.customers c WHERE c.id = p_customer_id),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', si.id,
        'name', si.product_name,
        'sku', si.sku_snapshot,
        'quantity', si.quantity,
        'price', COALESCE(si.unit_price, si.price, 0),
        'discount_amount', COALESCE(si.discount_amount, si.discount, 0),
        'total', si.total
      ) ORDER BY si.created_at, si.id)
      FROM public.sale_items si
      WHERE si.sale_id = v_sale_id
    ), '[]'::jsonb)$replacement$;
  v_match_position integer;
BEGIN
  v_function_definition := replace(
    pg_get_functiondef(
      'public.complete_pos_sale_internal(jsonb, uuid, numeric, text, numeric, uuid)'::regprocedure
    ),
    E'\r\n',
    E'\n'
  );
  v_match_position := position(v_target IN v_function_definition);

  IF v_match_position = 0
    OR position(v_target IN substring(v_function_definition FROM v_match_position + length(v_target))) > 0 THEN
    RAISE EXCEPTION 'Expected one customer snapshot in complete_pos_sale_internal result';
  END IF;

  EXECUTE replace(v_function_definition, v_target, v_replacement);
END;
$$;
