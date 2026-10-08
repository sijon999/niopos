/*
# Repair customer-sales relationships and make POS checkout atomic

## Problem
Customer rows were linked to sales through `sales.customer_id`, but the
cached customer totals (`total_buy`, `total_paid`, `total_due`) were not
reliably updated. POS checkout also wrote the sale, line items, stock, and
customer totals through separate browser requests, so a partial failure could
leave inconsistent business data.

## Database changes
1. Add `refresh_customer_financials(uuid)` to derive customer totals from
   linked completed sales, customer payments, and sale returns.
2. Add triggers so customer totals stay synchronized after sales, payments,
   and returns are inserted, updated, or deleted.
3. Recalculate totals for all existing customers without deleting data.
4. Add `complete_pos_sale(jsonb, uuid, numeric, text, numeric)` which performs
   a validated POS checkout in one database transaction. It verifies stock,
   reads authoritative product prices, creates the sale and sale items,
   reduces stock, creates stock movement records, and refreshes the linked
   customer's totals.

## Integrity rules
- Only completed sales count toward customer purchase totals.
- `total_buy` is the sum of completed linked sales minus completed linked sale returns.
- `total_paid` is the amount paid on linked completed sales plus customer payments.
- `total_due` is previous due plus linked sale due amounts minus customer payments
  and completed sale returns, never below zero.
- Product prices and available stock are read inside the database function;
  browser-supplied totals and prices are not trusted.
- No verification or unrelated inventory behavior is changed.

## Security
- The app is a single-tenant custom-auth app that uses the anon key, so the
  checkout function is executable by `anon` and `authenticated`, matching the
  existing application architecture.
- The function uses a fixed public search path and validates all input before
  writing data.
*/

CREATE OR REPLACE FUNCTION refresh_customer_financials(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_buy numeric;
  v_total_paid numeric;
  v_total_due numeric;
  v_total_return numeric;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(s.total) FILTER (WHERE s.status = 'completed'), 0),
    COALESCE(SUM(s.paid) FILTER (WHERE s.status = 'completed'), 0),
    COALESCE(SUM(s.due_amount) FILTER (WHERE s.status = 'completed'), 0)
  INTO v_total_buy, v_total_paid, v_total_due
  FROM sales s
  WHERE s.customer_id = p_customer_id;

  SELECT COALESCE(SUM(sr.total) FILTER (WHERE sr.status = 'completed'), 0)
  INTO v_total_return
  FROM sale_returns sr
  WHERE sr.customer_id = p_customer_id;

  v_total_paid := v_total_paid + COALESCE((
    SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customer_id = p_customer_id
  ), 0);

  v_total_due := GREATEST(
    0,
    COALESCE((SELECT previous_due FROM customers WHERE id = p_customer_id), 0)
    + v_total_due
    - COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customer_id = p_customer_id), 0)
    - v_total_return
  );

  UPDATE customers
  SET total_buy = GREATEST(0, v_total_buy - v_total_return),
      total_paid = GREATEST(0, v_total_paid),
      total_due = v_total_due,
      total_return = GREATEST(0, v_total_return)
  WHERE id = p_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_customer_financials_from_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM refresh_customer_financials(NEW.customer_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM refresh_customer_financials(OLD.customer_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sales_refresh_customer_financials ON sales;
CREATE TRIGGER sales_refresh_customer_financials
AFTER INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION refresh_customer_financials_from_sales();

DROP TRIGGER IF EXISTS customer_payments_refresh_financials ON customer_payments;
CREATE TRIGGER customer_payments_refresh_financials
AFTER INSERT OR UPDATE OR DELETE ON customer_payments
FOR EACH ROW EXECUTE FUNCTION refresh_customer_financials_from_sales();

DROP TRIGGER IF EXISTS sale_returns_refresh_customer_financials ON sale_returns;
CREATE TRIGGER sale_returns_refresh_customer_financials
AFTER INSERT OR UPDATE OR DELETE ON sale_returns
FOR EACH ROW EXECUTE FUNCTION refresh_customer_financials_from_sales();

DO $$
DECLARE
  v_customer_id uuid;
BEGIN
  FOR v_customer_id IN SELECT id FROM customers LOOP
    PERFORM refresh_customer_financials(v_customer_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION complete_pos_sale(
  p_cart jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_discount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_paid_amount numeric DEFAULT 0
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
  v_discount numeric := COALESCE(p_discount, 0);
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
    v_line_total := v_price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  IF v_discount < 0 OR v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Invalid discount';
  END IF;

  v_tax := ROUND((v_subtotal - v_discount) * 0.05, 2);
  v_total := ROUND(v_subtotal - v_discount + v_tax, 2);
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
    v_invoice_number, p_customer_id, v_subtotal, v_discount, v_tax, v_total,
    v_paid, v_change, v_due, p_payment_method,
    CASE WHEN v_due > 0 THEN 'due' ELSE 'paid' END,
    'completed', 'main'
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cart)
  LOOP
    v_quantity := (v_item->>'quantity')::numeric;
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    v_price := COALESCE(v_product.discount_price, v_product.selling_price, 0);
    v_line_total := v_price * v_quantity;

    INSERT INTO sale_items (sale_id, product_id, product_name, quantity, price, discount, total)
    VALUES (v_sale_id, v_product.id, v_product.name, v_quantity, v_price, 0, v_line_total);

    UPDATE products SET stock = stock - v_quantity, updated_at = now() WHERE id = v_product.id;

    INSERT INTO stock_movements (product_id, type, quantity, reference, note)
    VALUES (v_product.id, 'out', v_quantity, v_invoice_number, 'POS sale');
  END LOOP;

  PERFORM refresh_customer_financials(p_customer_id);

  RETURN jsonb_build_object(
    'id', v_sale_id,
    'invoice_number', v_invoice_number,
    'customer_id', p_customer_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
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

REVOKE ALL ON FUNCTION refresh_customer_financials(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION refresh_customer_financials_from_sales() FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_pos_sale(jsonb, uuid, numeric, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_pos_sale(jsonb, uuid, numeric, text, numeric) TO anon, authenticated;
