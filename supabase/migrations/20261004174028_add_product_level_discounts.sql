/*
# Product-Level Discounts & Customer Discount History

## Summary
Adds per-item discount support to the POS cart system and a permanent
customer discount history record.  The existing bill-level manual discount
is preserved but the new per-item discounts are the primary discount mechanism.

## 1. sale_items — new columns
- discount_type  text  ( 'percentage' | 'fixed' , default 'percentage' )
- discount_value numeric ( default 0 )
- discount_amount numeric ( default 0 — computed amount for the line )
- unit_price numeric ( default 0 — original unit price before discount )
- final_unit_price numeric ( default 0 — price after discount per unit )

## 2. New table: customer_discount_history
Permanent, per-product discount record linked to customer + sale + sale_item.
- id, customer_id, sale_id, sale_item_id, product_id, product_name
- original_price, quantity, discount_type, discount_value, discount_amount,
  final_amount, cashier, created_at
- Indexes on customer_id, sale_id, product_id

## 3. Updated function: complete_pos_sale
Cart items now optionally carry:
  discount_type, discount_value
The function validates each item's discount (0-100 %, fixed ≤ line subtotal),
computes discount_amount per line, stores it in sale_items, and writes
customer_discount_history rows when a customer is selected.

## 4. New function: get_customer_discount_summary
Returns aggregate stats for a customer:
  total_purchases, total_discount, discounted_orders, discounted_products

## 5. New function: get_customer_discount_history
Returns paginated, filterable per-product discount rows for a customer.
Filters: date_from, date_to, product_search, sale_id, discount_type, cashier

## Security
- RLS enabled on customer_discount_history with anon+authenticated CRUD
  (single-tenant shared data, matching all other tables).
- complete_pos_sale remains SECURITY DEFINER, search_path public.
*/

-- 1. Add discount columns to sale_items
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_unit_price numeric DEFAULT 0;

-- 2. Create customer_discount_history table
CREATE TABLE IF NOT EXISTS customer_discount_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES sale_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  original_price numeric DEFAULT 0,
  quantity numeric DEFAULT 1,
  discount_type text DEFAULT 'percentage',
  discount_value numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  final_amount numeric DEFAULT 0,
  cashier text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_discount_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cdh_customer ON customer_discount_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_cdh_sale ON customer_discount_history(sale_id);
CREATE INDEX IF NOT EXISTS idx_cdh_product ON customer_discount_history(product_id);
CREATE INDEX IF NOT EXISTS idx_cdh_created ON customer_discount_history(created_at);

-- RLS policies for customer_discount_history (single-tenant shared data)
DROP POLICY IF EXISTS "anon_select_customer_discount_history" ON customer_discount_history;
CREATE POLICY "anon_select_customer_discount_history"
  ON customer_discount_history FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_customer_discount_history" ON customer_discount_history;
CREATE POLICY "anon_insert_customer_discount_history"
  ON customer_discount_history FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_customer_discount_history" ON customer_discount_history;
CREATE POLICY "anon_update_customer_discount_history"
  ON customer_discount_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_customer_discount_history" ON customer_discount_history;
CREATE POLICY "anon_delete_customer_discount_history"
  ON customer_discount_history FOR DELETE TO anon, authenticated USING (true);

-- 3. Updated complete_pos_sale with per-item discount support
CREATE OR REPLACE FUNCTION complete_pos_sale(
  p_cart jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_discount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_paid_amount numeric DEFAULT 0,
  p_offer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 0;
  v_line_subtotal numeric := 0;
  v_line_discount numeric := 0;
  v_item_discount_type text;
  v_item_discount_value numeric;
  v_total_item_discounts numeric := 0;
  v_discount numeric := COALESCE(p_discount, 0);
  v_offer_discount numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_change numeric := 0;
  v_item jsonb;
  v_product products%ROWTYPE;
  v_quantity numeric;
  v_price numeric;
  v_line_total numeric;
  v_final_unit_price numeric;
  v_sale_item_id uuid;
  v_offer discount_offers%ROWTYPE;
  v_customer_usage_count integer;
  v_offer_discount_raw numeric;
BEGIN
  IF p_cart IS NULL OR jsonb_typeof(p_cart) <> 'array' OR jsonb_array_length(p_cart) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF p_payment_method NOT IN ('cash', 'card', 'mobile', 'bank', 'due') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  -- First pass: validate products, compute line discounts, accumulate subtotal
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cart)
  LOOP
    v_quantity := (v_item->>'quantity')::numeric;
    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 100000 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND OR v_product.status <> 'active' OR v_product.is_deleted THEN
      RAISE EXCEPTION 'Product unavailable';
    END IF;
    IF v_product.stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock';
    END IF;

    v_price := COALESCE(v_product.discount_price, v_product.selling_price, 0);
    v_line_subtotal := v_price * v_quantity;

    -- Per-item discount
    v_item_discount_type := COALESCE(v_item->>'discount_type', 'percentage');
    v_item_discount_value := COALESCE((v_item->>'discount_value')::numeric, 0);

    IF v_item_discount_type = 'percentage' THEN
      IF v_item_discount_value < 0 OR v_item_discount_value > 100 THEN
        RAISE EXCEPTION 'Invalid discount percentage';
      END IF;
      v_line_discount := v_line_subtotal * v_item_discount_value / 100.0;
    ELSIF v_item_discount_type = 'fixed' THEN
      v_line_discount := v_item_discount_value * v_quantity;
      IF v_line_discount > v_line_subtotal THEN
        RAISE EXCEPTION 'Discount cannot exceed the product amount';
      END IF;
    ELSE
      v_item_discount_type := 'percentage';
      v_line_discount := 0;
    END IF;

    v_line_discount := ROUND(v_line_discount, 2);
    v_total_item_discounts := v_total_item_discounts + v_line_discount;
    v_subtotal := v_subtotal + v_line_subtotal;
  END LOOP;

  IF v_discount < 0 OR v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Invalid discount';
  END IF;

  -- Offer discount (applied after item discounts + manual discount)
  v_offer_discount := 0;
  IF p_offer_id IS NOT NULL THEN
    SELECT * INTO v_offer FROM discount_offers WHERE id = p_offer_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Offer not found';
    END IF;
    IF v_offer.status <> 'active' THEN
      RAISE EXCEPTION 'This offer is inactive';
    END IF;
    IF CURRENT_DATE < v_offer.start_date OR CURRENT_DATE > v_offer.end_date THEN
      RAISE EXCEPTION 'This offer has expired or is not yet active';
    END IF;

    IF v_offer.eligibility_type = 'selected' THEN
      IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'This offer is not available for walk-in customers';
      END IF;
      SELECT COALESCE(SUM(cdo.usage_count), 0) INTO v_customer_usage_count
      FROM customer_discount_offers cdo
      WHERE cdo.offer_id = p_offer_id AND cdo.customer_id = p_customer_id AND cdo.status = 'active'
        AND (cdo.expires_at IS NULL OR cdo.expires_at >= CURRENT_DATE);
      IF v_customer_usage_count IS NULL OR NOT EXISTS (
        SELECT 1 FROM customer_discount_offers cdo
        WHERE cdo.offer_id = p_offer_id AND cdo.customer_id = p_customer_id AND cdo.status = 'active'
          AND (cdo.expires_at IS NULL OR cdo.expires_at >= CURRENT_DATE)
      ) THEN
        RAISE EXCEPTION 'This offer is not available for this customer';
      END IF;
      IF v_offer.max_usage_per_customer IS NOT NULL AND v_customer_usage_count >= v_offer.max_usage_per_customer THEN
        RAISE EXCEPTION 'This offer has reached its per-customer usage limit';
      END IF;
    END IF;

    IF NOT v_offer.unlimited_usage AND v_offer.max_usage IS NOT NULL AND v_offer.usage_count >= v_offer.max_usage THEN
      RAISE EXCEPTION 'This offer has reached its usage limit';
    END IF;

    IF (v_subtotal - v_total_item_discounts - v_discount) < v_offer.minimum_purchase THEN
      RAISE EXCEPTION 'Minimum purchase of % required', v_offer.minimum_purchase;
    END IF;

    IF v_offer.discount_type = 'percentage' THEN
      v_offer_discount_raw := (v_subtotal - v_total_item_discounts - v_discount) * (v_offer.discount_value / 100.0);
      IF v_offer.maximum_discount > 0 AND v_offer_discount_raw > v_offer.maximum_discount THEN
        v_offer_discount_raw := v_offer.maximum_discount;
      END IF;
    ELSE
      v_offer_discount_raw := v_offer.discount_value;
      IF v_offer.maximum_discount > 0 AND v_offer_discount_raw > v_offer.maximum_discount THEN
        v_offer_discount_raw := v_offer.maximum_discount;
      END IF;
    END IF;
    v_offer_discount := LEAST(v_offer_discount_raw, v_subtotal - v_total_item_discounts - v_discount);
    IF v_offer_discount < 0 THEN v_offer_discount := 0; END IF;
  END IF;

  v_tax := ROUND((v_subtotal - v_total_item_discounts - v_discount - v_offer_discount) * 0.05, 2);
  v_total := ROUND(v_subtotal - v_total_item_discounts - v_discount - v_offer_discount + v_tax, 2);
  v_paid := CASE WHEN p_payment_method = 'due' THEN GREATEST(0, COALESCE(p_paid_amount, 0)) ELSE v_total END;
  v_due := GREATEST(0, v_total - v_paid);
  v_change := CASE WHEN p_payment_method = 'cash' THEN GREATEST(0, v_paid - v_total) ELSE 0 END;

  IF p_payment_method = 'due' AND v_paid > v_total THEN
    v_paid := v_total;
    v_due := 0;
  END IF;

  v_invoice_number := 'INV-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  INSERT INTO sales (
    invoice_number, customer_id, subtotal, discount, tax, total, paid, change,
    due_amount, payment_method, payment_status, status, branch
  ) VALUES (
    v_invoice_number, p_customer_id, v_subtotal, v_total_item_discounts + v_discount + v_offer_discount, v_tax, v_total,
    v_paid, v_change, v_due, p_payment_method,
    CASE WHEN v_due > 0 THEN 'due' ELSE 'paid' END,
    'completed', 'main'
  ) RETURNING id INTO v_sale_id;

  -- Second pass: insert sale_items with discount details, decrement stock, record history
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cart)
  LOOP
    v_quantity := (v_item->>'quantity')::numeric;
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    v_price := COALESCE(v_product.discount_price, v_product.selling_price, 0);
    v_line_subtotal := v_price * v_quantity;

    v_item_discount_type := COALESCE(v_item->>'discount_type', 'percentage');
    v_item_discount_value := COALESCE((v_item->>'discount_value')::numeric, 0);

    IF v_item_discount_type = 'percentage' THEN
      v_line_discount := ROUND(v_line_subtotal * v_item_discount_value / 100.0, 2);
    ELSIF v_item_discount_type = 'fixed' THEN
      v_line_discount := ROUND(v_item_discount_value * v_quantity, 2);
    ELSE
      v_line_discount := 0;
    END IF;

    v_final_unit_price := ROUND((v_line_subtotal - v_line_discount) / v_quantity, 2);
    v_line_total := ROUND(v_line_subtotal - v_line_discount, 2);

    INSERT INTO sale_items (
      sale_id, product_id, product_name, quantity, price, discount, total,
      discount_type, discount_value, discount_amount, unit_price, final_unit_price
    ) VALUES (
      v_sale_id, v_product.id, v_product.name, v_quantity, v_price, v_line_discount, v_line_total,
      v_item_discount_type, v_item_discount_value, v_line_discount, v_price, v_final_unit_price
    ) RETURNING id INTO v_sale_item_id;

    UPDATE products SET stock = stock - v_quantity, updated_at = now() WHERE id = v_product.id;

    INSERT INTO stock_movements (product_id, type, quantity, reference, note)
    VALUES (v_product.id, 'out', v_quantity, v_invoice_number, 'POS sale');

    -- Save discount history only when there's a customer and a discount was applied
    IF p_customer_id IS NOT NULL AND v_line_discount > 0 THEN
      INSERT INTO customer_discount_history (
        customer_id, sale_id, sale_item_id, product_id, product_name,
        original_price, quantity, discount_type, discount_value,
        discount_amount, final_amount, cashier
      ) VALUES (
        p_customer_id, v_sale_id, v_sale_item_id, v_product.id, v_product.name,
        v_price, v_quantity, v_item_discount_type, v_item_discount_value,
        v_line_discount, v_line_total, NULL
      );
    END IF;
  END LOOP;

  IF p_offer_id IS NOT NULL AND v_offer_discount > 0 THEN
    INSERT INTO discount_offer_usage (offer_id, customer_id, sale_id, discount_amount, discount_value, discount_type, used_at)
    VALUES (p_offer_id, p_customer_id, v_sale_id, v_offer_discount, v_offer.discount_value, v_offer.discount_type, now());

    UPDATE discount_offers SET usage_count = usage_count + 1, updated_at = now() WHERE id = p_offer_id;

    IF v_offer.eligibility_type = 'selected' AND p_customer_id IS NOT NULL THEN
      UPDATE customer_discount_offers
      SET usage_count = usage_count + 1
      WHERE offer_id = p_offer_id AND customer_id = p_customer_id;
    END IF;
  END IF;

  PERFORM refresh_customer_financials(p_customer_id);

  RETURN jsonb_build_object(
    'id', v_sale_id,
    'invoice_number', v_invoice_number,
    'customer_id', p_customer_id,
    'subtotal', v_subtotal,
    'item_discounts', v_total_item_discounts,
    'discount', v_total_item_discounts + v_discount + v_offer_discount,
    'manual_discount', v_discount,
    'offer_discount', v_offer_discount,
    'offer_id', p_offer_id,
    'tax', v_tax,
    'total', v_total,
    'paid', v_paid,
    'change', v_change,
    'due_amount', v_due,
    'payment_method', p_payment_method,
    'payment_status', CASE WHEN v_due > 0 THEN 'due' ELSE 'paid' END,
    'status', 'completed',
    'sale_date', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid) TO anon, authenticated;

-- 4. Customer discount summary function
CREATE OR REPLACE FUNCTION get_customer_discount_summary(
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_purchases numeric := 0;
  v_total_discount numeric := 0;
  v_discounted_orders integer := 0;
  v_discounted_products integer := 0;
BEGIN
  SELECT COALESCE(SUM(s.total), 0) INTO v_total_purchases
  FROM sales s
  WHERE s.customer_id = p_customer_id AND s.status = 'completed';

  SELECT COALESCE(SUM(cdh.discount_amount), 0) INTO v_total_discount
  FROM customer_discount_history cdh
  WHERE cdh.customer_id = p_customer_id;

  SELECT COUNT(DISTINCT cdh.sale_id) INTO v_discounted_orders
  FROM customer_discount_history cdh
  WHERE cdh.customer_id = p_customer_id;

  SELECT COUNT(*) INTO v_discounted_products
  FROM customer_discount_history cdh
  WHERE cdh.customer_id = p_customer_id;

  RETURN jsonb_build_object(
    'total_purchases', v_total_purchases,
    'total_discount', v_total_discount,
    'discounted_orders', v_discounted_orders,
    'discounted_products', v_discounted_products
  );
END;
$$;

REVOKE ALL ON FUNCTION get_customer_discount_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_customer_discount_summary(uuid) TO anon, authenticated;

-- 5. Customer discount history function (filterable)
CREATE OR REPLACE FUNCTION get_customer_discount_history(
  p_customer_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_product_search text DEFAULT NULL,
  p_sale_id uuid DEFAULT NULL,
  p_discount_type text DEFAULT NULL,
  p_cashier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', cdh.id,
      'sale_id', cdh.sale_id,
      'invoice_number', s.invoice_number,
      'product_id', cdh.product_id,
      'product_name', cdh.product_name,
      'original_price', cdh.original_price,
      'quantity', cdh.quantity,
      'discount_type', cdh.discount_type,
      'discount_value', cdh.discount_value,
      'discount_amount', cdh.discount_amount,
      'final_amount', cdh.final_amount,
      'cashier', cdh.cashier,
      'created_at', cdh.created_at
    ) ORDER BY cdh.created_at DESC)
    FROM customer_discount_history cdh
    LEFT JOIN sales s ON s.id = cdh.sale_id
    WHERE cdh.customer_id = p_customer_id
      AND (p_date_from IS NULL OR cdh.created_at >= p_date_from)
      AND (p_date_to IS NULL OR cdh.created_at < p_date_to + interval '1 day')
      AND (p_product_search IS NULL OR cdh.product_name ILIKE '%' || p_product_search || '%')
      AND (p_sale_id IS NULL OR cdh.sale_id = p_sale_id)
      AND (p_discount_type IS NULL OR cdh.discount_type = p_discount_type)
      AND (p_cashier IS NULL OR cdh.cashier ILIKE '%' || p_cashier || '%')
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION get_customer_discount_history(uuid, date, date, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_customer_discount_history(uuid, date, date, text, uuid, text, text) TO anon, authenticated;
