ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS tax_rate_snapshot numeric,
  ADD COLUMN IF NOT EXISTS currency_symbol_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_name_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_phone_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_address_snapshot text;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS sku_snapshot text;

DO $$
DECLARE
  v_function_definition text;
  v_target text;
  v_replacement text;
  v_match_position integer;
BEGIN
  v_function_definition := replace(
    pg_get_functiondef(
      'public.complete_pos_sale_internal(jsonb, uuid, numeric, text, numeric, uuid)'::regprocedure
    ),
    E'\r\n',
    E'\n'
  );

  v_target := 'v_tax numeric := 0;';
  v_replacement := v_target || E'\n  v_tax_rate numeric := 0;';
  v_match_position := position(v_target IN v_function_definition);
  IF v_match_position = 0
    OR position(v_target IN substring(v_function_definition FROM v_match_position + length(v_target))) > 0 THEN
    RAISE EXCEPTION 'Expected one tax variable in complete_pos_sale_internal';
  END IF;
  v_function_definition := replace(v_function_definition, v_target, v_replacement);

  v_target := 'v_tax := ROUND((v_subtotal - v_total_item_discounts - v_discount - v_offer_discount) * public.current_store_tax_rate() / 100.0, 2);';
  v_replacement := 'v_tax_rate := public.current_store_tax_rate();' || E'\n  ' ||
    'v_tax := ROUND((v_subtotal - v_total_item_discounts - v_discount - v_offer_discount) * v_tax_rate / 100.0, 2);';
  v_match_position := position(v_target IN v_function_definition);
  IF v_match_position = 0
    OR position(v_target IN substring(v_function_definition FROM v_match_position + length(v_target))) > 0 THEN
    RAISE EXCEPTION 'Expected one tax calculation in complete_pos_sale_internal';
  END IF;
  v_function_definition := replace(v_function_definition, v_target, v_replacement);

  v_target := $target$    invoice_number, customer_id, subtotal, discount, tax, total, paid, change,
    due_amount, payment_method, payment_status, status, branch
  ) VALUES (
    v_invoice_number, p_customer_id, v_subtotal, v_total_item_discounts + v_discount + v_offer_discount, v_tax, v_total,
    v_paid, v_change, v_due, p_payment_method,
    CASE WHEN v_due > 0 THEN 'due' ELSE 'paid' END,
    'completed', 'main'
  ) RETURNING id INTO v_sale_id;$target$;
  v_replacement := $replacement$    invoice_number, customer_id, subtotal, discount, tax, total, paid, change,
    due_amount, payment_method, payment_status, status, branch, tax_rate_snapshot,
    currency_symbol_snapshot, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot
  ) VALUES (
    v_invoice_number, p_customer_id, v_subtotal, v_total_item_discounts + v_discount + v_offer_discount, v_tax, v_total,
    v_paid, v_change, v_due, p_payment_method,
    CASE WHEN v_due > 0 THEN 'due' ELSE 'paid' END,
    'completed', 'main', v_tax_rate,
    (SELECT s.currency_symbol FROM public.settings s WHERE s.store_id = public.get_my_store_id()),
    (SELECT c.name FROM public.customers c WHERE c.id = p_customer_id),
    (SELECT c.phone FROM public.customers c WHERE c.id = p_customer_id),
    (SELECT c.address FROM public.customers c WHERE c.id = p_customer_id)
  ) RETURNING id INTO v_sale_id;$replacement$;
  v_match_position := position(v_target IN v_function_definition);
  IF v_match_position = 0
    OR position(v_target IN substring(v_function_definition FROM v_match_position + length(v_target))) > 0 THEN
    RAISE EXCEPTION 'Expected one sale insert in complete_pos_sale_internal';
  END IF;
  v_function_definition := replace(v_function_definition, v_target, v_replacement);

  v_target := $target$      sale_id, product_id, product_name, quantity, price, discount, total,
      discount_type, discount_value, discount_amount, unit_price, final_unit_price
    ) VALUES (
      v_sale_id, v_product.id, v_product.name, v_quantity, v_price, v_line_discount, v_line_total,
      v_item_discount_type, v_item_discount_value, v_line_discount, v_price, v_final_unit_price
    ) RETURNING id INTO v_sale_item_id;$target$;
  v_replacement := $replacement$sale_id, product_id, product_name, quantity, price, discount, total,
      discount_type, discount_value, discount_amount, unit_price, final_unit_price, sku_snapshot
    ) VALUES (
      v_sale_id, v_product.id, v_product.name, v_quantity, v_price, v_line_discount, v_line_total,
      v_item_discount_type, v_item_discount_value, v_line_discount, v_price, v_final_unit_price, v_product.sku
    ) RETURNING id INTO v_sale_item_id;$replacement$;
  v_match_position := position(v_target IN v_function_definition);
  IF v_match_position = 0
    OR position(v_target IN substring(v_function_definition FROM v_match_position + length(v_target))) > 0 THEN
    RAISE EXCEPTION 'Expected one sale item insert in complete_pos_sale_internal';
  END IF;
  v_function_definition := replace(v_function_definition, v_target, v_replacement);

  v_target := $target$'sale_date', now()$target$;
  v_replacement := $replacement$'sale_date', now(),
    'tax_rate_snapshot', v_tax_rate,
    'currency_symbol_snapshot', (SELECT s.currency_symbol FROM public.settings s WHERE s.store_id = public.get_my_store_id()),
    'customer_name_snapshot', (SELECT c.name FROM public.customers c WHERE c.id = p_customer_id),
    'customer_phone_snapshot', (SELECT c.phone FROM public.customers c WHERE c.id = p_customer_id),
    'customer_address_snapshot', (SELECT c.address FROM public.customers c WHERE c.id = p_customer_id)$replacement$;
  v_match_position := position(v_target IN v_function_definition);
  IF v_match_position = 0
    OR position(v_target IN substring(v_function_definition FROM v_match_position + length(v_target))) > 0 THEN
    RAISE EXCEPTION 'Expected one sale date in complete_pos_sale_internal result';
  END IF;

  EXECUTE replace(v_function_definition, v_target, v_replacement);
END;
$$;
