CREATE OR REPLACE FUNCTION public.apply_stock_reconciliation_adjustment(
  p_reconciliation_id uuid,
  p_expected_current_stock numeric,
  p_adjusted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_store_id uuid;
  v_recon public.stock_reconciliations%ROWTYPE;
  v_current_stock numeric;
  v_new_stock numeric;
  v_difference numeric;
BEGIN
  IF public.has_store_permission('inventory') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Inventory permission is required';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  SELECT *
  INTO v_recon
  FROM public.stock_reconciliations
  WHERE id = p_reconciliation_id
    AND store_id = v_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation not found';
  END IF;
  IF v_recon.adjustment_applied THEN
    RAISE EXCEPTION 'Reconciliation adjustment already applied';
  END IF;
  IF v_recon.status IS DISTINCT FROM 'DIFFERENCE_FOUND' THEN
    RAISE EXCEPTION 'Only reconciliations with differences can be adjusted';
  END IF;

  SELECT p.stock
  INTO v_current_stock
  FROM public.products AS p
  WHERE p.id = v_recon.product_id
    AND p.store_id = v_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF v_current_stock IS DISTINCT FROM p_expected_current_stock THEN
    RAISE EXCEPTION 'Stock changed; reload and confirm the adjustment again';
  END IF;

  v_new_stock := v_recon.physical_quantity;
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'Physical quantity cannot be negative';
  END IF;
  v_difference := v_new_stock - v_current_stock;

  UPDATE public.products
  SET stock = v_new_stock, updated_at = now()
  WHERE id = v_recon.product_id
    AND store_id = v_store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product stock update failed';
  END IF;

  INSERT INTO public.stock_movements
    (product_id, type, quantity, reference, note, store_id)
  VALUES
    (v_recon.product_id, 'adjustment', abs(v_difference),
     'Reconciliation: ' || v_recon.id::text,
     'Stock adjustment from reconciliation. Reason: '
       || COALESCE(v_recon.reason, 'N/A'),
     v_store_id);

  INSERT INTO public.stock_adjustments
    (product_id, reconciliation_id, previous_quantity, new_quantity,
     difference, reason, reason_details, adjusted_by, store_id)
  VALUES
    (v_recon.product_id, v_recon.id, v_current_stock, v_new_stock,
     v_difference, v_recon.reason, v_recon.reason_details,
     p_adjusted_by, v_store_id);

  UPDATE public.stock_reconciliations
  SET adjustment_applied = true,
      adjustment_applied_at = now(),
      adjustment_applied_by = p_adjusted_by
  WHERE id = v_recon.id
    AND store_id = v_store_id
    AND adjustment_applied = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation adjustment state changed';
  END IF;

  RETURN jsonb_build_object(
    'reconciliation_id', v_recon.id,
    'previous_quantity', v_current_stock,
    'new_quantity', v_new_stock,
    'difference', v_difference
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.apply_stock_reconciliation_adjustment(uuid, numeric, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.apply_stock_reconciliation_adjustment(uuid, numeric, text)
  TO authenticated;

DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_old := $old$
  IF p_cart IS NULL OR pg_catalog.jsonb_typeof(p_cart) <> 'array'
    OR pg_catalog.jsonb_array_length(p_cart) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;
$old$;
  v_new := $new$
  IF p_cart IS NULL OR pg_catalog.jsonb_typeof(p_cart) <> 'array'
    OR pg_catalog.jsonb_array_length(p_cart) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  PERFORM p.id
  FROM public.products AS p
  WHERE p.store_id = v_store_id
    AND p.id IN (
      SELECT (item.value ->> 'product_id')::uuid
      FROM pg_catalog.jsonb_array_elements(p_cart) AS item(value)
    )
  ORDER BY p.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (item.value ->> 'product_id')::uuid AS product_id,
             SUM((item.value ->> 'quantity')::numeric) AS requested_quantity
      FROM pg_catalog.jsonb_array_elements(p_cart) AS item(value)
      GROUP BY 1
    ) AS requested
    JOIN public.products AS p
      ON p.id = requested.product_id
     AND p.store_id = v_store_id
    WHERE COALESCE(p.stock, 0) < requested.requested_quantity
  ) THEN
    RAISE EXCEPTION 'Insufficient stock for one or more products';
  END IF;
$new$;

  SELECT pg_get_functiondef(
    'public.complete_pos_sale(jsonb, uuid, numeric, text, numeric)'::regprocedure
  ) INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  IF length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
    RAISE EXCEPTION 'Expected exactly one POS cart validation block';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  SELECT pg_get_functiondef(
    'public.complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid)'::regprocedure
  ) INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  IF length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
    RAISE EXCEPTION 'Expected exactly one offer POS cart validation block';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_old := $old$
  FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
$old$;
  v_new := $new$
  IF EXISTS (
    SELECT 1
    FROM public.sale_returns AS sr
    WHERE sr.original_sale_id = v_sale.id
      AND sr.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel a sale with completed returns';
  END IF;

  FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
$new$;

  SELECT pg_get_functiondef('public.cancel_sale(uuid)'::regprocedure)
  INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  IF length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
    RAISE EXCEPTION 'Expected exactly one sale cancellation stock loop';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_old := $old$
      UPDATE products SET stock = GREATEST(0, stock - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id;
$old$;
  v_new := $new$
      UPDATE products
      SET stock = stock - v_item.quantity, updated_at = now()
      WHERE id = v_item.product_id
        AND store_id = v_purchase.store_id
        AND stock >= v_item.quantity;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot cancel purchase: insufficient stock';
      END IF;
$new$;

  SELECT pg_get_functiondef('public.cancel_purchase_order(uuid)'::regprocedure)
  INTO v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  IF length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
    RAISE EXCEPTION 'Expected exactly one purchase cancellation stock update';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
