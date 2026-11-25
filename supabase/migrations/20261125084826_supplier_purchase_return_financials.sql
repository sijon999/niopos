DROP POLICY IF EXISTS inventory_purchase_returns_read ON public.purchase_returns;
CREATE POLICY inventory_purchase_returns_read
  ON public.purchase_returns FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('purchases'))
      OR (SELECT public.has_store_permission('purchase_returns'))
    )
  );

DROP POLICY IF EXISTS inventory_purchase_return_items_read ON public.purchase_return_items;
CREATE POLICY inventory_purchase_return_items_read
  ON public.purchase_return_items FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('purchases'))
      OR (SELECT public.has_store_permission('purchase_returns'))
    )
  );

CREATE OR REPLACE FUNCTION public.complete_purchase_return(
  p_purchase_id uuid,
  p_lines jsonb,
  p_reason text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
  v_purchase public.purchases%ROWTYPE;
  v_line jsonb;
  v_purchase_item_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_quantity numeric;
  v_cost_price numeric;
  v_stock numeric;
  v_already_returned numeric;
  v_available_quantity numeric;
  v_product_unit text;
  v_line_total numeric;
  v_return_total numeric := 0;
  v_due_applied numeric;
  v_remaining_due numeric;
  v_return_id uuid;
  v_new_stock numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL
    OR public.has_store_permission('purchases') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An authenticated user with purchase permission is required';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array'
    OR pg_catalog.jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one purchase item is required';
  END IF;
  IF NULLIF(pg_catalog.btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A purchase return reason is required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_lines) AS line(value)
    GROUP BY (line.value->>'purchase_item_id')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A purchase item can only appear once per return';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  SELECT p.*
  INTO v_purchase
  FROM public.purchases AS p
  WHERE p.id = p_purchase_id
    AND p.store_id = v_store_id
  FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_purchase.status, '') <> 'received' THEN
    RAISE EXCEPTION 'Only a received purchase from this store can be returned';
  END IF;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines)
  LOOP
    v_purchase_item_id := (v_line->>'purchase_item_id')::uuid;
    v_quantity := (v_line->>'quantity')::numeric;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Return quantities must be greater than zero';
    END IF;

    SELECT pi.product_id, pi.product_name, pi.cost_price, p.stock, pi.quantity, p.unit
    INTO v_product_id, v_product_name, v_cost_price, v_stock, v_available_quantity, v_product_unit
    FROM public.purchase_items AS pi
    JOIN public.products AS p
      ON p.id = pi.product_id
     AND p.store_id = v_store_id
    WHERE pi.id = v_purchase_item_id
      AND pi.purchase_id = v_purchase.id
      AND pi.store_id = v_store_id
    FOR UPDATE OF pi, p;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase item not found in this store';
    END IF;
    IF COALESCE(v_product_unit, '') !~*
      '^(kg|g|gram|grams|liter|litre|l|ml|meter|metre|m|cm|mm)$'
      AND v_quantity <> pg_catalog.trunc(v_quantity) THEN
      RAISE EXCEPTION 'This product unit only accepts whole quantities';
    END IF;

    SELECT COALESCE(SUM(pri.quantity), 0)
    INTO v_already_returned
    FROM public.purchase_return_items AS pri
    JOIN public.purchase_returns AS pr ON pr.id = pri.return_id
    WHERE pri.purchase_item_id = v_purchase_item_id
      AND pr.original_purchase_id = v_purchase.id
      AND pr.store_id = v_store_id
      AND pr.status = 'completed';

    IF v_quantity > COALESCE(v_available_quantity, 0) - v_already_returned THEN
      RAISE EXCEPTION 'Return quantity exceeds the unreturned purchase quantity';
    END IF;
    IF v_quantity > COALESCE(v_stock, 0) THEN
      RAISE EXCEPTION 'Return quantity exceeds the current stock';
    END IF;

    v_line_total := v_quantity * COALESCE(v_cost_price, 0);
    v_return_total := v_return_total + v_line_total;
  END LOOP;

  v_due_applied := LEAST(v_return_total, GREATEST(COALESCE(v_purchase.due_amount, 0), 0));
  v_remaining_due := GREATEST(COALESCE(v_purchase.due_amount, 0) - v_due_applied, 0);

  INSERT INTO public.purchase_returns (
    po_number, original_purchase_id, supplier_id, reason, notes,
    total, status, store_id
  ) VALUES (
    'PR-' || v_purchase.po_number,
    v_purchase.id,
    v_purchase.supplier_id,
    p_reason,
    NULLIF(pg_catalog.btrim(p_notes), ''),
    v_return_total,
    'completed',
    v_store_id
  )
  RETURNING id INTO v_return_id;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines)
  LOOP
    v_purchase_item_id := (v_line->>'purchase_item_id')::uuid;
    v_quantity := (v_line->>'quantity')::numeric;

    SELECT pi.product_id, pi.product_name, pi.cost_price, p.stock
    INTO v_product_id, v_product_name, v_cost_price, v_stock
    FROM public.purchase_items AS pi
    JOIN public.products AS p
      ON p.id = pi.product_id
     AND p.store_id = v_store_id
    WHERE pi.id = v_purchase_item_id
      AND pi.purchase_id = v_purchase.id
      AND pi.store_id = v_store_id
    FOR UPDATE OF pi, p;
    IF NOT FOUND OR v_quantity > COALESCE(v_stock, 0) THEN
      RAISE EXCEPTION 'Stock changed while processing the return; reload and try again';
    END IF;

    v_new_stock := v_stock - v_quantity;
    UPDATE public.products
    SET stock = v_new_stock, updated_at = pg_catalog.now()
    WHERE id = v_product_id
      AND store_id = v_store_id;

    v_line_total := v_quantity * COALESCE(v_cost_price, 0);
    INSERT INTO public.purchase_return_items (
      return_id, purchase_item_id, product_id, product_name,
      quantity, cost_price, total, store_id
    ) VALUES (
      v_return_id, v_purchase_item_id, v_product_id, v_product_name,
      v_quantity, COALESCE(v_cost_price, 0), v_line_total, v_store_id
    );

    INSERT INTO public.stock_movements (
      product_id, type, quantity, reference, note, previous_stock, new_stock,
      reason, purchase_price, performed_by, store_id
    ) VALUES (
      v_product_id, 'out', v_quantity, 'Purchase Return: ' || v_return_id::text,
      NULLIF(pg_catalog.btrim(p_notes), ''), v_stock, v_new_stock,
      p_reason, COALESCE(v_cost_price, 0), v_user_id, v_store_id
    );
  END LOOP;

  UPDATE public.purchases
  SET due_amount = v_remaining_due,
      payment_status = CASE WHEN v_remaining_due = 0 THEN 'paid' ELSE 'partial' END
  WHERE id = v_purchase.id
    AND store_id = v_store_id;

  IF v_purchase.supplier_id IS NOT NULL THEN
    UPDATE public.suppliers
    SET total_buy = GREATEST(COALESCE(total_buy, 0) - v_return_total, 0),
        total_due = GREATEST(COALESCE(total_due, 0) - v_due_applied, 0)
    WHERE id = v_purchase.supplier_id
      AND store_id = v_store_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_return_id,
    'purchase_id', v_purchase.id,
    'total', v_return_total,
    'due_adjustment', v_due_applied,
    'supplier_credit', GREATEST(v_return_total - v_due_applied, 0),
    'remaining_due', v_remaining_due
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_purchase_return(
  uuid, jsonb, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_purchase_return(
  uuid, jsonb, text, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';