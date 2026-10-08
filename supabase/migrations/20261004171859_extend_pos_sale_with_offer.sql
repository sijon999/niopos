/*
# Extend complete_pos_sale with optional offer support

## Changes
- Recreates `complete_pos_sale` to accept an optional `p_offer_id uuid`.
- When an offer is provided:
  1. Validates offer is active, within date range, and usage limits not exceeded.
  2. Checks customer eligibility based on eligibility_type.
  3. Computes offer discount from authoritative subtotal (after line-level
     discounts), capped by maximum_discount and minimum_purchase.
  4. Applies offer discount before tax calculation: grand_total = subtotal -
     manual_discount - offer_discount + tax.
  5. Records usage in discount_offer_usage and increments counters.
- The existing no-offer path (p_offer_id = NULL) is fully preserved.

## Security
- SECURITY DEFINER with fixed search_path public.
- Re-granted to anon + authenticated (single-tenant anon-key app).
*/

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

    IF (v_subtotal - v_discount) < v_offer.minimum_purchase THEN
      RAISE EXCEPTION 'Minimum purchase of % required', v_offer.minimum_purchase;
    END IF;

    IF v_offer.discount_type = 'percentage' THEN
      v_offer_discount_raw := (v_subtotal - v_discount) * (v_offer.discount_value / 100.0);
      IF v_offer.maximum_discount > 0 AND v_offer_discount_raw > v_offer.maximum_discount THEN
        v_offer_discount_raw := v_offer.maximum_discount;
      END IF;
    ELSE
      v_offer_discount_raw := v_offer.discount_value;
      IF v_offer.maximum_discount > 0 AND v_offer_discount_raw > v_offer.maximum_discount THEN
        v_offer_discount_raw := v_offer.maximum_discount;
      END IF;
    END IF;
    v_offer_discount := LEAST(v_offer_discount_raw, v_subtotal - v_discount);
    IF v_offer_discount < 0 THEN v_offer_discount := 0; END IF;
  END IF;

  v_tax := ROUND((v_subtotal - v_discount - v_offer_discount) * 0.05, 2);
  v_total := ROUND(v_subtotal - v_discount - v_offer_discount + v_tax, 2);
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
    v_invoice_number, p_customer_id, v_subtotal, v_discount + v_offer_discount, v_tax, v_total,
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
    'discount', v_discount + v_offer_discount,
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
