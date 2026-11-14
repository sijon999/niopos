ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS previous_stock numeric,
  ADD COLUMN IF NOT EXISTS new_stock numeric,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS purchase_price numeric,
  ADD COLUMN IF NOT EXISTS performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.purchase_return_items
  ADD COLUMN IF NOT EXISTS purchase_item_id uuid
    REFERENCES public.purchase_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_movements_store_product_created_idx
  ON public.stock_movements (store_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_return_items_purchase_item_idx
  ON public.purchase_return_items (purchase_item_id);

DROP POLICY IF EXISTS role_permission_select ON public.products;
CREATE POLICY role_permission_select
  ON public.products AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('products'))
    OR (SELECT public.has_store_permission('pos'))
    OR (SELECT public.has_store_permission('inventory'))
    OR (SELECT public.has_store_permission('purchases'))
  );

DROP POLICY IF EXISTS role_permission_select ON public.categories;
CREATE POLICY role_permission_select
  ON public.categories AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('products'))
    OR (SELECT public.has_store_permission('pos'))
    OR (SELECT public.has_store_permission('inventory'))
    OR (SELECT public.has_store_permission('purchases'))
  );

DROP POLICY IF EXISTS role_permission_select ON public.brands;
CREATE POLICY role_permission_select
  ON public.brands AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('products'))
    OR (SELECT public.has_store_permission('pos'))
    OR (SELECT public.has_store_permission('inventory'))
    OR (SELECT public.has_store_permission('purchases'))
  );

DROP POLICY IF EXISTS role_permission_update ON public.products;
CREATE POLICY role_permission_update
  ON public.products AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('products'))
    OR (SELECT public.has_store_permission('pos'))
    OR (SELECT public.has_store_permission('inventory'))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('products'))
    OR (SELECT public.has_store_permission('pos'))
    OR (SELECT public.has_store_permission('inventory'))
  );

CREATE POLICY inventory_products_read
  ON public.products FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('inventory'))
  );

CREATE POLICY inventory_products_update
  ON public.products FOR UPDATE TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('inventory'))
  )
  WITH CHECK (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('inventory'))
  );

CREATE POLICY purchase_products_read
  ON public.products FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('purchases'))
  );

CREATE POLICY purchase_categories_read
  ON public.categories FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('purchases'))
  );

CREATE POLICY purchase_brands_read
  ON public.brands FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('purchases'))
  );

CREATE POLICY pos_categories_read
  ON public.categories FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('pos'))
  );

CREATE POLICY pos_brands_read
  ON public.brands FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('pos'))
  );

CREATE POLICY inventory_categories_read
  ON public.categories FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('inventory'))
  );

CREATE POLICY inventory_brands_read
  ON public.brands FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('inventory'))
  );

DROP POLICY IF EXISTS role_permission_select ON public.settings;
CREATE POLICY role_permission_select
  ON public.settings AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('settings'))
    OR (SELECT public.has_store_permission('inventory'))
    OR (SELECT public.has_store_permission('pos'))
    OR (SELECT public.has_store_permission('sales'))
  );

CREATE POLICY inventory_settings_read
  ON public.settings FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('inventory'))
  );

CREATE POLICY pos_settings_read
  ON public.settings FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('pos'))
  );

CREATE POLICY inventory_stock_movements_read
  ON public.stock_movements FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('inventory'))
      OR (SELECT public.has_store_permission('pos'))
    )
  );

DROP POLICY IF EXISTS role_permission_select ON public.stock_movements;
CREATE POLICY role_permission_select
  ON public.stock_movements AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('inventory'))
    OR (SELECT public.has_store_permission('pos'))
  );

CREATE POLICY inventory_stock_movements_insert
  ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('inventory'))
      OR (SELECT public.has_store_permission('pos'))
    )
  );

DROP POLICY IF EXISTS role_permission_insert ON public.stock_movements;
CREATE POLICY role_permission_insert
  ON public.stock_movements AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('inventory'))
    OR (SELECT public.has_store_permission('pos'))
  );

CREATE POLICY inventory_stock_adjustments_read
  ON public.stock_adjustments FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('inventory'))
  );

CREATE POLICY inventory_reconciliations_read
  ON public.stock_reconciliations FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('inventory'))
  );

CREATE POLICY inventory_reconciliations_insert
  ON public.stock_reconciliations FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('inventory'))
  );

CREATE POLICY inventory_purchases_read
  ON public.purchases FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('purchases'))
  );

CREATE POLICY inventory_purchase_items_read
  ON public.purchase_items FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('purchases'))
  );

CREATE POLICY inventory_purchase_returns_read
  ON public.purchase_returns FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('purchases'))
  );

CREATE POLICY inventory_purchase_return_items_read
  ON public.purchase_return_items FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('purchases'))
  );

REVOKE UPDATE, DELETE ON TABLE public.stock_movements, public.stock_adjustments
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_stock_movement_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_current_stock numeric;
  v_cost_price numeric;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.stock, 0), COALESCE(p.cost_price, 0)
  INTO v_current_stock, v_cost_price
  FROM public.products AS p
  WHERE p.id = NEW.product_id
    AND p.store_id = NEW.store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock movement product must belong to the same store';
  END IF;

  IF NEW.previous_stock IS NULL AND NEW.new_stock IS NULL THEN
    IF NEW.type IN ('in', 'opening') THEN
      NEW.new_stock := v_current_stock;
      NEW.previous_stock := v_current_stock - NEW.quantity;
    ELSIF NEW.type = 'out' THEN
      NEW.new_stock := v_current_stock;
      NEW.previous_stock := v_current_stock + NEW.quantity;
    END IF;
  END IF;

  NEW.purchase_price := COALESCE(NEW.purchase_price, v_cost_price);
  NEW.performed_by := COALESCE(NEW.performed_by, auth.uid());
  NEW.reason := COALESCE(
    NEW.reason,
    CASE
      WHEN NEW.type = 'opening' THEN 'Opening Stock'
      WHEN NEW.type = 'in' THEN 'New Stock Received'
      WHEN NEW.type = 'out' THEN 'Stock Decrease'
      ELSE 'Stock Adjustment'
    END
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_stock_movement_snapshot()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS stock_movement_snapshot_before_insert
  ON public.stock_movements;
CREATE TRIGGER stock_movement_snapshot_before_insert
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_stock_movement_snapshot();

CREATE OR REPLACE FUNCTION public.record_product_opening_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF COALESCE(NEW.stock, 0) > 0 THEN
    INSERT INTO public.stock_movements (
      product_id, type, quantity, reference, note, previous_stock, new_stock,
      reason, purchase_price, performed_by, store_id
    ) VALUES (
      NEW.id, 'opening', NEW.stock, 'Opening Stock', 'Initial product stock',
      0, NEW.stock, 'Opening Stock', COALESCE(NEW.cost_price, 0),
      auth.uid(), NEW.store_id
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_product_opening_stock()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS products_record_opening_stock
  ON public.products;
CREATE TRIGGER products_record_opening_stock
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.record_product_opening_stock();

CREATE OR REPLACE FUNCTION public.enforce_pos_product_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.has_store_permission('products') THEN
    RETURN NEW;
  END IF;

  IF public.has_store_permission('purchases')
    AND (to_jsonb(NEW) - 'stock' - 'cost_price' - 'updated_at')
      IS NOT DISTINCT FROM (to_jsonb(OLD) - 'stock' - 'cost_price' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  IF (public.has_store_permission('pos')
      OR public.has_store_permission('inventory'))
    AND (to_jsonb(NEW) - 'stock' - 'updated_at')
      IS NOT DISTINCT FROM (to_jsonb(OLD) - 'stock' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Product-management permission is required for product changes'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_product_id uuid,
  p_direction text,
  p_quantity numeric,
  p_reason text,
  p_note text DEFAULT NULL,
  p_purchase_price numeric DEFAULT NULL
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
  v_product public.products%ROWTYPE;
  v_previous_stock numeric;
  v_new_stock numeric;
  v_cost_price numeric;
  v_allowed_reasons text[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF public.has_store_permission('inventory') IS DISTINCT FROM true
    AND NOT (
      p_direction = 'in'
      AND p_reason = 'Opening Stock'
      AND public.has_store_permission('products') IS TRUE
    ) THEN
    RAISE EXCEPTION 'Inventory permission is required';
  END IF;
  IF p_direction IS NULL OR p_direction NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Stock direction must be in or out';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  v_allowed_reasons := CASE
    WHEN p_direction = 'in' THEN ARRAY[
      'Opening Stock', 'New Stock Received', 'Purchase Return',
      'Manual Adjustment', 'Other'
    ]
    ELSE ARRAY[
      'Damaged Product', 'Expired Product', 'Lost / Missing',
      'Internal Use', 'Manual Adjustment', 'Other'
    ]
  END;
  IF p_reason IS NULL OR NOT (p_reason = ANY(v_allowed_reasons)) THEN
    RAISE EXCEPTION 'Select a valid stock adjustment reason';
  END IF;
  IF p_purchase_price IS NOT NULL AND (
    p_direction <> 'in' OR p_purchase_price < 0
  ) THEN
    RAISE EXCEPTION 'A non-negative purchase price can only be set for stock increases';
  END IF;
  IF p_purchase_price IS NOT NULL
    AND public.has_store_permission('products') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Product-management permission is required to change purchase price';
  END IF;

  v_store_id := public.get_my_store_id();
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  SELECT p.*
  INTO v_product
  FROM public.products AS p
  WHERE p.id = p_product_id
    AND p.store_id = v_store_id
    AND NOT COALESCE(p.is_deleted, false)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found in the current store';
  END IF;
  IF COALESCE(v_product.unit, '') !~*
    '^(kg|g|gram|grams|liter|litre|l|ml|meter|metre|m|cm|mm)$'
    AND p_quantity <> pg_catalog.trunc(p_quantity) THEN
    RAISE EXCEPTION 'This product unit only accepts whole quantities';
  END IF;

  v_previous_stock := COALESCE(v_product.stock, 0);
  IF p_direction = 'out' AND p_quantity > v_previous_stock THEN
    RAISE EXCEPTION 'Stock decrease exceeds the available quantity';
  END IF;
  v_new_stock := CASE
    WHEN p_direction = 'in' THEN v_previous_stock + p_quantity
    ELSE v_previous_stock - p_quantity
  END;
  v_cost_price := COALESCE(p_purchase_price, v_product.cost_price, 0);

  UPDATE public.products
  SET stock = v_new_stock,
      cost_price = CASE
        WHEN p_purchase_price IS NULL THEN cost_price
        ELSE p_purchase_price
      END,
      updated_at = pg_catalog.now()
  WHERE id = p_product_id
    AND store_id = v_store_id;

  INSERT INTO public.stock_movements (
    product_id, type, quantity, reference, note, previous_stock, new_stock,
    reason, purchase_price, performed_by, store_id
  ) VALUES (
    p_product_id, p_direction, p_quantity, 'Manual Stock Adjustment',
    NULLIF(pg_catalog.btrim(p_note), ''), v_previous_stock, v_new_stock,
    p_reason, v_cost_price, v_user_id, v_store_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'product_id', p_product_id,
    'direction', p_direction,
    'previous_stock', v_previous_stock,
    'new_stock', v_new_stock,
    'purchase_price', v_cost_price
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_inventory_stock(
  uuid, text, numeric, text, text, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(
  uuid, text, numeric, text, text, numeric
) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_stock_reconciliation_adjustment(
  p_reconciliation_id uuid,
  p_expected_current_stock numeric,
  p_adjusted_by text
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
  v_recon public.stock_reconciliations%ROWTYPE;
  v_current_stock numeric;
  v_new_stock numeric;
  v_difference numeric;
  v_unit text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL
    OR public.has_store_permission('inventory') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An authenticated user with inventory permission is required';
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

  SELECT p.stock, p.unit
  INTO v_current_stock, v_unit
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
  IF COALESCE(v_unit, '') !~*
    '^(kg|g|gram|grams|liter|litre|l|ml|meter|metre|m|cm|mm)$'
    AND v_new_stock <> pg_catalog.trunc(v_new_stock) THEN
    RAISE EXCEPTION 'This product unit only accepts whole quantities';
  END IF;
  v_difference := v_new_stock - v_current_stock;

  UPDATE public.products
  SET stock = v_new_stock, updated_at = pg_catalog.now()
  WHERE id = v_recon.product_id
    AND store_id = v_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product stock update failed';
  END IF;

  INSERT INTO public.stock_movements (
    product_id, type, quantity, reference, note, previous_stock, new_stock,
    reason, purchase_price, performed_by, store_id
  ) VALUES (
    v_recon.product_id,
    CASE WHEN v_difference >= 0 THEN 'in' ELSE 'out' END,
    pg_catalog.abs(v_difference),
    'Stock Reconciliation: ' || v_recon.id::text,
    v_recon.reason_details,
    v_current_stock,
    v_new_stock,
    COALESCE(v_recon.reason, 'Manual Adjustment'),
    (SELECT COALESCE(p.cost_price, 0) FROM public.products AS p
     WHERE p.id = v_recon.product_id AND p.store_id = v_store_id),
    v_user_id,
    v_store_id
  );

  INSERT INTO public.stock_adjustments (
    product_id, reconciliation_id, previous_quantity, new_quantity,
    difference, reason, reason_details, adjusted_by, store_id
  ) VALUES (
    v_recon.product_id, v_recon.id, v_current_stock, v_new_stock,
    v_difference, v_recon.reason, v_recon.reason_details,
    COALESCE(NULLIF(p_adjusted_by, ''), v_user_id::text), v_store_id
  );

  UPDATE public.stock_reconciliations
  SET adjustment_applied = true,
      adjustment_applied_at = pg_catalog.now(),
      adjustment_applied_by = COALESCE(NULLIF(p_adjusted_by, ''), v_user_id::text)
  WHERE id = v_recon.id
    AND store_id = v_store_id
    AND adjustment_applied = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation adjustment state changed';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'reconciliation_id', v_recon.id,
    'previous_quantity', v_current_stock,
    'new_quantity', v_new_stock,
    'difference', v_difference
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stock_reconciliation_adjustment(
  uuid, numeric, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_stock_reconciliation_adjustment(
  uuid, numeric, text
) TO authenticated;

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

  RETURN pg_catalog.jsonb_build_object(
    'id', v_return_id,
    'purchase_id', v_purchase.id,
    'total', v_return_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_purchase_return(
  uuid, jsonb, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_purchase_return(
  uuid, jsonb, text, text
) TO authenticated;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY['stock_movements'];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Required publication supabase_realtime does not exist';
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END;
$$;
