/*
# Purchase & Sales Management Enhancements

## 1. purchases table — new columns
- paid_amount numeric (default 0)
- due_amount numeric (default 0)
- payment_method text (default 'cash')
- notes text (nullable)
- branch text (default 'main')
- discount numeric (default 0)

## 2. sales table — new columns
- cashier text (nullable)
- branch text (default 'main')

## 3. New function: complete_purchase_order
Atomic purchase creation with auto stock increase, supplier due, cost price update.

## 4. New function: cancel_purchase_order
Reverses a received purchase: decreases stock, reverses supplier balance.

## 5. New function: cancel_sale
Reverses a completed sale: restores stock, reverses customer financials.
*/

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS branch text DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS cashier text,
  ADD COLUMN IF NOT EXISTS branch text DEFAULT 'main';

-- 3. complete_purchase_order
CREATE OR REPLACE FUNCTION complete_purchase_order(
  p_supplier_id uuid DEFAULT NULL,
  p_cart jsonb DEFAULT '[]'::jsonb,
  p_tax_rate numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_paid_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT NULL,
  p_branch text DEFAULT 'main'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id uuid;
  v_po_number text;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_item jsonb;
  v_product products%ROWTYPE;
  v_quantity numeric;
  v_cost numeric;
  v_line_total numeric;
BEGIN
  IF p_cart IS NULL OR jsonb_typeof(p_cart) <> 'array' OR jsonb_array_length(p_cart) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF p_payment_method NOT IN ('cash', 'card', 'mobile', 'bank', 'due') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cart)
  LOOP
    v_quantity := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'cost_price')::numeric;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;
    IF v_cost IS NULL OR v_cost < 0 THEN
      RAISE EXCEPTION 'Invalid cost price';
    END IF;
    v_subtotal := v_subtotal + (v_quantity * v_cost);
  END LOOP;

  v_tax := ROUND(v_subtotal * (COALESCE(p_tax_rate, 0) / 100.0), 2);
  v_total := ROUND(v_subtotal + v_tax - COALESCE(p_discount, 0), 2);
  v_paid := CASE WHEN p_payment_method = 'due' THEN COALESCE(p_paid_amount, 0) ELSE v_total END;
  v_due := GREATEST(0, v_total - v_paid);

  v_po_number := 'PO-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  INSERT INTO purchases (
    po_number, supplier_id, subtotal, tax, discount, total, paid_amount, due_amount,
    payment_method, notes, branch, status, payment_status
  ) VALUES (
    v_po_number, p_supplier_id, v_subtotal, v_tax, COALESCE(p_discount, 0), v_total, v_paid, v_due,
    p_payment_method, p_notes, p_branch, 'received',
    CASE WHEN v_due > 0 THEN 'due' ELSE 'paid' END
  ) RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cart)
  LOOP
    v_quantity := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'cost_price')::numeric;
    v_line_total := v_quantity * v_cost;

    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found';
    END IF;

    INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, cost_price, total)
    VALUES (v_purchase_id, v_product.id, v_product.name, v_quantity, v_cost, v_line_total);

    UPDATE products
      SET stock = stock + v_quantity,
          cost_price = v_cost,
          updated_at = now()
    WHERE id = v_product.id;

    INSERT INTO stock_movements (product_id, type, quantity, reference, note)
    VALUES (v_product.id, 'in', v_quantity, v_po_number, 'Purchase received');
  END LOOP;

  IF p_supplier_id IS NOT NULL THEN
    UPDATE suppliers
      SET total_buy = total_buy + v_total,
          total_due = total_due + v_due,
          total_paid = total_paid + v_paid
    WHERE id = p_supplier_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_purchase_id,
    'po_number', v_po_number,
    'subtotal', v_subtotal,
    'tax', v_tax,
    'discount', COALESCE(p_discount, 0),
    'total', v_total,
    'paid_amount', v_paid,
    'due_amount', v_due,
    'status', 'received'
  );
END;
$$;

REVOKE ALL ON FUNCTION complete_purchase_order(uuid, jsonb, numeric, numeric, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_purchase_order(uuid, jsonb, numeric, numeric, numeric, text, text, text) TO anon, authenticated;

-- 4. cancel_purchase_order
CREATE OR REPLACE FUNCTION cancel_purchase_order(
  p_purchase_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase purchases%ROWTYPE;
  v_item purchase_items%ROWTYPE;
BEGIN
  IF p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'Purchase ID is required';
  END IF;

  SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;
  IF v_purchase.status = 'cancelled' THEN
    RAISE EXCEPTION 'Purchase already cancelled';
  END IF;

  FOR v_item IN SELECT * FROM purchase_items WHERE purchase_id = p_purchase_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      UPDATE products SET stock = GREATEST(0, stock - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id;

      INSERT INTO stock_movements (product_id, type, quantity, reference, note)
      VALUES (v_item.product_id, 'out', v_item.quantity, v_purchase.po_number, 'Purchase cancelled');
    END IF;
  END LOOP;

  IF v_purchase.supplier_id IS NOT NULL THEN
    UPDATE suppliers
      SET total_buy = GREATEST(0, total_buy - v_purchase.total),
          total_due = GREATEST(0, total_due - v_purchase.due_amount),
          total_paid = GREATEST(0, total_paid - v_purchase.paid_amount)
    WHERE id = v_purchase.supplier_id;
  END IF;

  UPDATE purchases SET status = 'cancelled' WHERE id = p_purchase_id;

  RETURN jsonb_build_object('id', p_purchase_id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION cancel_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_purchase_order(uuid) TO anon, authenticated;

-- 5. cancel_sale
CREATE OR REPLACE FUNCTION cancel_sale(
  p_sale_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_item sale_items%ROWTYPE;
BEGIN
  IF p_sale_id IS NULL THEN
    RAISE EXCEPTION 'Sale ID is required';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;
  IF v_sale.status = 'cancelled' THEN
    RAISE EXCEPTION 'Sale already cancelled';
  END IF;

  FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      UPDATE products SET stock = stock + v_item.quantity, updated_at = now()
      WHERE id = v_item.product_id;

      INSERT INTO stock_movements (product_id, type, quantity, reference, note)
      VALUES (v_item.product_id, 'in', v_item.quantity, v_sale.invoice_number, 'Sale cancelled');
    END IF;
  END LOOP;

  IF v_sale.customer_id IS NOT NULL THEN
    UPDATE customers
      SET total_buy = GREATEST(0, total_buy - v_sale.total),
          total_paid = GREATEST(0, total_paid - v_sale.paid),
          total_due = GREATEST(0, total_due - v_sale.due_amount)
    WHERE id = v_sale.customer_id;
  END IF;

  UPDATE sales SET status = 'cancelled' WHERE id = p_sale_id;

  RETURN jsonb_build_object('id', p_sale_id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION cancel_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_sale(uuid) TO anon, authenticated;
