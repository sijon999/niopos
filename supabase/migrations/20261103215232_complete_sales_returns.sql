-- Sales return transaction, history, and reporting schema.
ALTER TABLE public.sale_returns
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_method text,
  ADD COLUMN IF NOT EXISTS refund_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_adjustment numeric,
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_by_name text,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

ALTER TABLE public.sale_return_items
  ADD COLUMN IF NOT EXISTS original_sale_item_id uuid REFERENCES public.sale_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'good',
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS purchase_price numeric,
  ADD COLUMN IF NOT EXISTS profit_reversal numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_returns_refund_method_check'
  ) THEN
    ALTER TABLE public.sale_returns
      ADD CONSTRAINT sale_returns_refund_method_check
      CHECK (refund_method IS NULL OR refund_method IN (
        'cash', 'card', 'mobile', 'bank', 'store_credit', 'due_adjustment'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_returns_amounts_check'
  ) THEN
    ALTER TABLE public.sale_returns
      ADD CONSTRAINT sale_returns_amounts_check
      CHECK (subtotal >= 0 AND discount >= 0 AND tax >= 0
        AND total >= 0 AND refund_amount >= 0
        AND (due_adjustment IS NULL OR due_adjustment >= 0));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_return_items_condition_check'
  ) THEN
    ALTER TABLE public.sale_return_items
      ADD CONSTRAINT sale_return_items_condition_check
      CHECK (condition IN ('good', 'damaged'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_return_items_amounts_check'
  ) THEN
    ALTER TABLE public.sale_return_items
      ADD CONSTRAINT sale_return_items_amounts_check
      CHECK (quantity > 0 AND price >= 0 AND total >= 0
        AND discount >= 0 AND tax >= 0);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS sale_returns_store_invoice_uidx
  ON public.sale_returns (store_id, invoice_number)
  WHERE store_id IS NOT NULL AND invoice_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sale_returns_store_idempotency_uidx
  ON public.sale_returns (store_id, idempotency_key)
  WHERE store_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sale_returns_store_date_idx
  ON public.sale_returns (store_id, return_date DESC);
CREATE INDEX IF NOT EXISTS sale_returns_original_sale_idx
  ON public.sale_returns (store_id, original_sale_id)
  WHERE original_sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sale_return_items_original_sale_item_idx
  ON public.sale_return_items (original_sale_item_id)
  WHERE original_sale_item_id IS NOT NULL;

DROP POLICY IF EXISTS sales_permission_read_sales ON public.sales;
CREATE POLICY sales_permission_read_sales ON public.sales
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('sales'))
      OR (SELECT public.has_store_permission('reports'))
    )
  );

DROP POLICY IF EXISTS sales_permission_read_sale_items ON public.sale_items;
CREATE POLICY sales_permission_read_sale_items ON public.sale_items
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('sales'))
      OR (SELECT public.has_store_permission('reports'))
    )
  );

DROP POLICY IF EXISTS sales_permission_read_customers ON public.customers;
CREATE POLICY sales_permission_read_customers ON public.customers
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('sales'))
      OR (SELECT public.has_store_permission('reports'))
    )
  );

DROP POLICY IF EXISTS sales_permission_read_settings ON public.settings;
CREATE POLICY sales_permission_read_settings ON public.settings
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('sales'))
  );

DROP POLICY IF EXISTS sales_permission_read_sale_returns ON public.sale_returns;
CREATE POLICY sales_permission_read_sale_returns ON public.sale_returns
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('sales'))
      OR (SELECT public.has_store_permission('reports'))
    )
  );

DROP POLICY IF EXISTS sales_permission_read_sale_return_items ON public.sale_return_items;
CREATE POLICY sales_permission_read_sale_return_items ON public.sale_return_items
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('sales'))
      OR (SELECT public.has_store_permission('reports'))
    )
  );

CREATE OR REPLACE FUNCTION public.refresh_customer_financials(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
  v_total_buy numeric;
  v_total_paid numeric;
  v_total_due numeric;
  v_total_return numeric;
  v_total_refunded numeric;
  v_total_due_adjustment numeric;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;

  SELECT c.store_id
  INTO v_store_id
  FROM public.customers AS c
  WHERE c.id = p_customer_id;

  IF v_store_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (SELECT public.is_super_admin())
    AND v_store_id IS DISTINCT FROM (SELECT public.get_my_store_id()) THEN
    RAISE EXCEPTION 'Customer is outside the current store'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(SUM(s.total) FILTER (WHERE s.status = 'completed'), 0),
    COALESCE(SUM(s.paid) FILTER (WHERE s.status = 'completed'), 0),
    COALESCE(SUM(s.due_amount) FILTER (WHERE s.status = 'completed'), 0)
  INTO v_total_buy, v_total_paid, v_total_due
  FROM public.sales AS s
  WHERE s.customer_id = p_customer_id
    AND s.store_id = v_store_id;

  SELECT
    COALESCE(SUM(sr.total) FILTER (WHERE sr.status = 'completed'), 0),
    COALESCE(SUM(sr.refund_amount) FILTER (WHERE sr.status = 'completed'), 0),
    COALESCE(SUM(COALESCE(sr.due_adjustment, sr.total))
      FILTER (WHERE sr.status = 'completed'), 0)
  INTO v_total_return, v_total_refunded, v_total_due_adjustment
  FROM public.sale_returns AS sr
  WHERE sr.customer_id = p_customer_id
    AND sr.store_id = v_store_id;

  v_total_paid := v_total_paid
    + COALESCE((
      SELECT SUM(cp.amount)
      FROM public.customer_payments AS cp
      WHERE cp.customer_id = p_customer_id
        AND cp.store_id = v_store_id
    ), 0)
    - v_total_refunded;

  v_total_due := GREATEST(
    0,
    COALESCE((
      SELECT c.previous_due
      FROM public.customers AS c
      WHERE c.id = p_customer_id
        AND c.store_id = v_store_id
    ), 0)
    + v_total_due
    - COALESCE((
      SELECT SUM(cp.amount)
      FROM public.customer_payments AS cp
      WHERE cp.customer_id = p_customer_id
        AND cp.store_id = v_store_id
    ), 0)
    - v_total_due_adjustment
  );

  UPDATE public.customers
  SET total_buy = GREATEST(0, v_total_buy - v_total_return),
      total_paid = GREATEST(0, v_total_paid),
      total_due = v_total_due,
      total_return = GREATEST(0, v_total_return)
  WHERE id = p_customer_id
    AND store_id = v_store_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_customer_financials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_customer_financials(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_sale_return(
  p_sale_id uuid,
  p_items jsonb,
  p_refund_method text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_sale public.sales%ROWTYPE;
  v_sale_item public.sale_items%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_return_id uuid;
  v_invoice_number text;
  v_item_count integer;
  v_unique_item_count integer;
  v_quantity numeric;
  v_exact_returned numeric;
  v_legacy_returned numeric;
  v_legacy_capacity_before numeric;
  v_legacy_allocated numeric;
  v_available_quantity numeric;
  v_item_discount_total numeric;
  v_item_revenue numeric;
  v_bill_discount numeric;
  v_taxable_base numeric;
  v_return_subtotal numeric := 0;
  v_return_discount numeric := 0;
  v_return_tax numeric := 0;
  v_return_total numeric := 0;
  v_previous_total numeric := 0;
  v_due_remaining numeric := 0;
  v_paid_remaining numeric := 0;
  v_remaining_total numeric := 0;
  v_rounding_adjustment numeric := 0;
  v_due_adjustment numeric := 0;
  v_refund_amount numeric := 0;
  v_line_revenue numeric;
  v_line_subtotal numeric;
  v_line_item_discount numeric;
  v_line_bill_discount numeric;
  v_line_discount numeric;
  v_line_taxable numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_unit_price numeric;
  v_purchase_price numeric;
  v_profit_reversal numeric;
  v_reason text;
  v_condition text;
  v_customer_name text;
  v_error text;
  v_existing_sale_id uuid;
BEGIN
  v_store_id := public.get_my_store_id();
  IF v_user_id IS NULL OR v_store_id IS NULL
    OR NOT public.has_store_permission('sales') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'return_permission_denied';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_invalid_request';
  END IF;

  SELECT sr.id, sr.invoice_number, sr.total, sr.refund_amount,
         sr.due_adjustment, sr.original_sale_id
  INTO v_return_id, v_invoice_number, v_return_total, v_refund_amount,
       v_due_adjustment, v_existing_sale_id
  FROM public.sale_returns AS sr
  WHERE sr.store_id = v_store_id
    AND sr.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_sale_id IS DISTINCT FROM p_sale_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_invalid_request';
    END IF;
    RETURN jsonb_build_object(
      'id', v_return_id,
      'invoice_number', v_invoice_number,
      'total', v_return_total,
      'refund_amount', v_refund_amount,
      'due_adjustment', COALESCE(v_due_adjustment, 0)
    );
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_invalid_items';
  END IF;
  IF jsonb_array_length(p_items) = 0
    OR jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_invalid_items';
  END IF;

  IF p_refund_method IS NULL OR p_refund_method NOT IN (
    'cash', 'card', 'mobile', 'bank', 'store_credit', 'due_adjustment'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_invalid_method';
  END IF;

  SELECT count(*), count(DISTINCT value->>'sale_item_id')
  INTO v_item_count, v_unique_item_count
  FROM jsonb_array_elements(p_items);
  IF v_item_count <> v_unique_item_count
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_items) AS requested(value)
      WHERE NULLIF(requested.value->>'sale_item_id', '') IS NULL
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_duplicate_items';
  END IF;

  SELECT s.*
  INTO v_sale
  FROM public.sales AS s
  WHERE s.id = p_sale_id
    AND s.store_id = v_store_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return_sale_not_found';
  END IF;
  IF v_sale.status <> 'completed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_sale_not_completed';
  END IF;

  SELECT sr.id, sr.invoice_number, sr.total, sr.refund_amount,
         sr.due_adjustment, sr.original_sale_id
  INTO v_return_id, v_invoice_number, v_return_total, v_refund_amount,
       v_due_adjustment, v_existing_sale_id
  FROM public.sale_returns AS sr
  WHERE sr.store_id = v_store_id
    AND sr.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_sale_id IS DISTINCT FROM p_sale_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_invalid_request';
    END IF;
    RETURN jsonb_build_object(
      'id', v_return_id,
      'invoice_number', v_invoice_number,
      'total', v_return_total,
      'refund_amount', v_refund_amount,
      'due_adjustment', COALESCE(v_due_adjustment, 0)
    );
  END IF;

  SELECT
    COALESCE(SUM(COALESCE(NULLIF(si.discount_amount, 0), si.discount, 0)), 0),
    COALESCE(SUM(si.total), 0)
  INTO v_item_discount_total, v_item_revenue
  FROM public.sale_items AS si
  WHERE si.sale_id = v_sale.id
    AND si.store_id = v_store_id;

  v_bill_discount := GREATEST(COALESCE(v_sale.discount, 0) - v_item_discount_total, 0);
  v_taxable_base := GREATEST(COALESCE(v_sale.subtotal, 0) - COALESCE(v_sale.discount, 0), 0);

  SELECT COALESCE(SUM(sr.total) FILTER (WHERE sr.status = 'completed'), 0),
         COALESCE(SUM(COALESCE(sr.due_adjustment, sr.total))
           FILTER (WHERE sr.status = 'completed'), 0),
         COALESCE(SUM(sr.refund_amount) FILTER (WHERE sr.status = 'completed'), 0)
  INTO v_previous_total, v_due_remaining, v_paid_remaining
  FROM public.sale_returns AS sr
  WHERE sr.original_sale_id = v_sale.id
    AND sr.store_id = v_store_id;

  v_due_remaining := GREATEST(0, COALESCE(v_sale.due_amount, 0) - v_due_remaining);
  v_paid_remaining := GREATEST(0, COALESCE(v_sale.paid, 0) - v_paid_remaining);

  FOR v_item IN
    SELECT requested.value
    FROM jsonb_array_elements(p_items) AS requested(value)
    ORDER BY requested.value->>'sale_item_id'
  LOOP
    v_quantity := NULLIF(v_item->>'quantity', '')::numeric;
    v_reason := NULLIF(btrim(v_item->>'reason'), '');
    v_condition := v_item->>'condition';

    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 100000
      OR v_reason IS NULL OR length(v_reason) > 200
      OR v_condition IS NULL OR v_condition NOT IN ('good', 'damaged') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_invalid_line';
    END IF;

    SELECT si.*
    INTO v_sale_item
    FROM public.sale_items AS si
    WHERE si.id = (v_item->>'sale_item_id')::uuid
      AND si.sale_id = v_sale.id
      AND si.store_id = v_store_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_invalid_line';
    END IF;

    SELECT COALESCE(SUM(sri.quantity) FILTER (
             WHERE sri.original_sale_item_id = v_sale_item.id
           ), 0),
           COALESCE(SUM(sri.quantity) FILTER (
             WHERE sri.original_sale_item_id IS NULL
               AND sri.product_id IS NOT DISTINCT FROM v_sale_item.product_id
           ), 0)
    INTO v_exact_returned, v_legacy_returned
    FROM public.sale_return_items AS sri
    JOIN public.sale_returns AS sr ON sr.id = sri.return_id
    WHERE sr.original_sale_id = v_sale.id
      AND sr.store_id = v_store_id
      AND sr.status = 'completed';

    SELECT COALESCE(SUM(
      GREATEST(
        si.quantity - COALESCE(exact_returns.quantity, 0),
        0
      )
    ), 0)
    INTO v_legacy_capacity_before
    FROM public.sale_items AS si
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(sri.quantity), 0) AS quantity
      FROM public.sale_return_items AS sri
      JOIN public.sale_returns AS sr ON sr.id = sri.return_id
      WHERE sri.original_sale_item_id = si.id
        AND sr.original_sale_id = v_sale.id
        AND sr.store_id = v_store_id
        AND sr.status = 'completed'
    ) AS exact_returns ON true
    WHERE si.sale_id = v_sale.id
      AND si.store_id = v_store_id
      AND si.product_id IS NOT DISTINCT FROM v_sale_item.product_id
      AND si.id < v_sale_item.id;

    v_legacy_allocated := LEAST(
      GREATEST(v_legacy_returned - v_legacy_capacity_before, 0),
      GREATEST(v_sale_item.quantity - v_exact_returned, 0)
    );
    v_available_quantity := GREATEST(
      v_sale_item.quantity - v_exact_returned - v_legacy_allocated,
      0
    );

    IF v_quantity > v_available_quantity THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_quantity_exceeded';
    END IF;

    IF v_sale_item.product_id IS NOT NULL THEN
      SELECT p.*
      INTO v_product
      FROM public.products AS p
      WHERE p.id = v_sale_item.product_id
        AND p.store_id = v_store_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_product_store_mismatch';
      END IF;
    END IF;

    v_unit_price := COALESCE(
      NULLIF(v_sale_item.unit_price, 0),
      v_sale_item.price,
      0
    );
    v_line_subtotal := v_unit_price * v_quantity;
    v_line_revenue := COALESCE(v_sale_item.total, 0)
      * v_quantity / NULLIF(v_sale_item.quantity, 0);
    v_line_item_discount := COALESCE(
      NULLIF(v_sale_item.discount_amount, 0),
      v_sale_item.discount,
      0
    ) * v_quantity / NULLIF(v_sale_item.quantity, 0);
    v_line_bill_discount := CASE
      WHEN v_item_revenue > 0
        THEN v_bill_discount * v_line_revenue / v_item_revenue
      ELSE 0
    END;
    v_line_discount := v_line_item_discount + v_line_bill_discount;
    v_line_taxable := GREATEST(v_line_revenue - v_line_bill_discount, 0);
    v_line_tax := CASE
      WHEN v_taxable_base > 0
        THEN COALESCE(v_sale.tax, 0) * v_line_taxable / v_taxable_base
      ELSE 0
    END;
    v_line_total := GREATEST(v_line_taxable + v_line_tax, 0);
    v_purchase_price := COALESCE(v_sale_item.purchase_price, 0);
      v_profit_reversal := COALESCE(v_sale_item.profit, 0) * v_quantity
        / NULLIF(v_sale_item.quantity, 0);

    v_return_subtotal := v_return_subtotal + v_line_subtotal;
    v_return_discount := v_return_discount + v_line_discount;
    v_return_tax := v_return_tax + v_line_tax;
    v_return_total := v_return_total + v_line_total;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'sale_item_id', v_sale_item.id,
      'product_id', v_sale_item.product_id,
      'product_name', v_sale_item.product_name,
      'quantity', v_quantity,
      'price', v_unit_price,
      'discount', v_line_discount,
      'tax', v_line_tax,
      'total', v_line_total,
      'condition', v_condition,
      'reason', v_reason,
      'purchase_price', v_purchase_price,
      'profit_reversal', v_profit_reversal
    ));
  END LOOP;

  v_return_subtotal := ROUND(v_return_subtotal, 2);
  v_return_discount := ROUND(v_return_discount, 2);
  v_return_tax := ROUND(v_return_tax, 2);
  v_return_total := ROUND(v_return_total, 2);
  v_remaining_total := ROUND(GREATEST(v_sale.total - v_previous_total, 0), 2);

  IF v_return_total <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_amount_exceeded';
  END IF;
  IF v_return_total > v_remaining_total THEN
    v_rounding_adjustment := v_return_total - v_remaining_total;
    v_return_total := v_remaining_total;
    v_return_tax := GREATEST(v_return_tax - v_rounding_adjustment, 0);
    v_line := v_lines -> (jsonb_array_length(v_lines) - 1);
    v_lines := jsonb_set(
      v_lines,
      ARRAY[(jsonb_array_length(v_lines) - 1)::text, 'total'],
      to_jsonb(GREATEST((v_line->>'total')::numeric - v_rounding_adjustment, 0)),
      false
    );
    v_lines := jsonb_set(
      v_lines,
      ARRAY[(jsonb_array_length(v_lines) - 1)::text, 'tax'],
      to_jsonb(GREATEST((v_line->>'tax')::numeric - v_rounding_adjustment, 0)),
      false
    );
  END IF;

  IF p_refund_method = 'due_adjustment' THEN
    IF v_return_total > v_due_remaining THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_due_exceeded';
    END IF;
    v_due_adjustment := v_return_total;
  ELSE
    v_due_adjustment := LEAST(v_return_total, v_due_remaining);
    v_refund_amount := v_return_total - v_due_adjustment;
    IF v_refund_amount > v_paid_remaining THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_unpaid_refund';
    END IF;
  END IF;

  IF p_refund_method = 'store_credit' THEN
    IF v_sale.customer_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_store_credit_customer';
    END IF;
    UPDATE public.customers
    SET wallet_balance = COALESCE(wallet_balance, 0) + v_refund_amount
    WHERE id = v_sale.customer_id
      AND store_id = v_store_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_customer_store_mismatch';
    END IF;
  END IF;

  v_invoice_number := 'RET-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS')
    || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  SELECT p.full_name
  INTO v_customer_name
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  INSERT INTO public.sale_returns (
    invoice_number, original_sale_id, customer_id, return_date, reason,
    subtotal, discount, tax, total, status, store_id, refund_method,
    refund_amount, due_adjustment, processed_by, processed_by_name,
    idempotency_key
  ) VALUES (
    v_invoice_number, v_sale.id, v_sale.customer_id, now(),
    (SELECT string_agg(DISTINCT value->>'reason', ', ')
     FROM jsonb_array_elements(v_lines)),
    v_return_subtotal, v_return_discount, v_return_tax, v_return_total,
    'completed', v_store_id, p_refund_method, v_refund_amount,
    v_due_adjustment, v_user_id, v_customer_name, p_idempotency_key
  )
  RETURNING id INTO v_return_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    INSERT INTO public.sale_return_items (
      return_id, product_id, product_name, quantity, price, total,
      original_sale_item_id, discount, tax, condition, reason,
      purchase_price, profit_reversal, store_id
    ) VALUES (
      v_return_id, NULLIF(v_line->>'product_id', '')::uuid,
      v_line->>'product_name', (v_line->>'quantity')::numeric,
      (v_line->>'price')::numeric, (v_line->>'total')::numeric,
      (v_line->>'sale_item_id')::uuid, (v_line->>'discount')::numeric,
      (v_line->>'tax')::numeric, v_line->>'condition', v_line->>'reason',
      (v_line->>'purchase_price')::numeric,
      (v_line->>'profit_reversal')::numeric, v_store_id
    );

    IF v_line->>'product_id' IS NOT NULL THEN
      IF v_line->>'condition' = 'good' THEN
        UPDATE public.products
        SET stock = stock + (v_line->>'quantity')::numeric,
            updated_at = now()
        WHERE id = (v_line->>'product_id')::uuid
          AND store_id = v_store_id;
        v_error := 'return_stock_update_failed';
      ELSE
        UPDATE public.products
        SET damage_stock = COALESCE(damage_stock, 0)
              + (v_line->>'quantity')::numeric,
            updated_at = now()
        WHERE id = (v_line->>'product_id')::uuid
          AND store_id = v_store_id;
        v_error := 'return_damaged_stock_update_failed';
      END IF;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_error;
      END IF;

      INSERT INTO public.stock_movements (
        product_id, type, quantity, reference, note, store_id
      ) VALUES (
        (v_line->>'product_id')::uuid,
        CASE WHEN v_line->>'condition' = 'good' THEN 'in' ELSE 'damaged_in' END,
        (v_line->>'quantity')::numeric,
        v_invoice_number,
        'Sales return ' || v_invoice_number,
        v_store_id
      );
    END IF;
  END LOOP;

  IF v_sale.customer_id IS NOT NULL THEN
    PERFORM public.refresh_customer_financials(v_sale.customer_id);
  END IF;

  RETURN jsonb_build_object(
    'id', v_return_id,
    'invoice_number', v_invoice_number,
    'total', v_return_total,
    'refund_amount', v_refund_amount,
    'due_adjustment', v_due_adjustment
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_sale_return(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_sale_return(uuid, jsonb, text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_sale_return_history(
  p_search text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
  v_search text := NULLIF(btrim(p_search), '');
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  v_store_id := public.get_my_store_id();
  IF auth.uid() IS NULL OR v_store_id IS NULL
    OR NOT public.has_store_permission('sales') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'return_permission_denied';
  END IF;

  WITH filtered AS (
    SELECT sr.*
    FROM public.sale_returns AS sr
    LEFT JOIN public.sales AS s ON s.id = sr.original_sale_id
      AND s.store_id = v_store_id
    LEFT JOIN public.customers AS c ON c.id = sr.customer_id
      AND c.store_id = v_store_id
    WHERE sr.store_id = v_store_id
      AND (p_date_from IS NULL OR sr.return_date >= p_date_from)
      AND (p_date_to IS NULL OR sr.return_date <= p_date_to)
      AND (p_status IS NULL OR p_status = 'all' OR sr.status = p_status)
      AND (
        v_search IS NULL
        OR sr.invoice_number ILIKE '%' || v_search || '%'
        OR s.invoice_number ILIKE '%' || v_search || '%'
        OR COALESCE(c.name, '') ILIKE '%' || v_search || '%'
      )
  ),
  page AS (
    SELECT f.*
    FROM filtered AS f
    ORDER BY f.return_date DESC, f.id DESC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total_count', (SELECT count(*) FROM filtered),
    'rows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', page.id,
          'store_id', page.store_id,
          'invoice_number', page.invoice_number,
          'original_sale_id', page.original_sale_id,
          'original_invoice_number', s.invoice_number,
          'customer_id', page.customer_id,
          'customer_name', COALESCE(c.name, s.customer_name_snapshot, 'Walk-in'),
          'customer_phone', COALESCE(c.phone, s.customer_phone_snapshot),
          'customer_address', COALESCE(c.address, s.customer_address_snapshot),
          'return_date', page.return_date,
          'subtotal', page.subtotal,
          'discount', page.discount,
          'tax', page.tax,
          'total', page.total,
          'refund_method', page.refund_method,
          'refund_amount', page.refund_amount,
          'due_adjustment', COALESCE(page.due_adjustment, 0),
          'processed_by_name', page.processed_by_name,
          'status', page.status,
          'items', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', sri.id,
                'product_id', sri.product_id,
                'product_name', sri.product_name,
                'quantity', sri.quantity,
                'price', sri.price,
                'discount', sri.discount,
                'tax', sri.tax,
                'total', sri.total,
                'condition', sri.condition,
                'reason', sri.reason,
                'profit_reversal', sri.profit_reversal
              )
              ORDER BY sri.created_at, sri.id
            )
            FROM public.sale_return_items AS sri
            WHERE sri.return_id = page.id
              AND sri.store_id = v_store_id
          ), '[]'::jsonb)
        )
        ORDER BY page.return_date DESC, page.id DESC
      )
      FROM page
      LEFT JOIN public.sales AS s ON s.id = page.original_sale_id
        AND s.store_id = v_store_id
      LEFT JOIN public.customers AS c ON c.id = page.customer_id
        AND c.store_id = v_store_id
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sale_return_history(text, timestamptz, timestamptz, text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sale_return_history(text, timestamptz, timestamptz, text, integer, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_sales_return_report(
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_product_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_brand_ids uuid[] DEFAULT NULL,
  p_units text[] DEFAULT NULL,
  p_time_zone text DEFAULT 'UTC',
  p_payment_method text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_min_amount numeric DEFAULT NULL,
  p_max_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
  v_time_zone text := COALESCE(NULLIF(p_time_zone, ''), 'UTC');
  v_result jsonb;
BEGIN
  v_store_id := public.get_my_store_id();
  IF auth.uid() IS NULL OR v_store_id IS NULL
    OR NOT (
      public.has_store_permission('sales')
      OR public.has_store_permission('reports')
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'return_permission_denied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_time_zone) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return_invalid_timezone';
  END IF;

  WITH filtered AS (
    SELECT sr.*
    FROM public.sale_returns AS sr
    LEFT JOIN public.sales AS original_sale
      ON original_sale.id = sr.original_sale_id
      AND original_sale.store_id = v_store_id
    WHERE sr.store_id = v_store_id
      AND sr.status = 'completed'
      AND (p_date_from IS NULL OR sr.return_date >= p_date_from)
      AND (p_date_to IS NULL OR sr.return_date <= p_date_to)
      AND (p_customer_id IS NULL OR sr.customer_id = p_customer_id)
      AND (p_payment_method IS NULL OR original_sale.payment_method = p_payment_method)
      AND (p_status IS NULL OR p_status = 'all' OR original_sale.status = p_status)
      AND (p_min_amount IS NULL OR original_sale.total >= p_min_amount)
      AND (p_max_amount IS NULL OR original_sale.total <= p_max_amount)
  ),
  items AS (
    SELECT
      f.id AS return_id,
      f.return_date,
      f.customer_id,
      COALESCE(c.name, 'Walk-in') AS customer_name,
      sri.product_id,
      COALESCE(sri.product_name, 'Unknown product') AS product_name,
      sri.quantity,
      sri.total,
      sri.profit_reversal
    FROM filtered AS f
    JOIN public.sale_return_items AS sri
      ON sri.return_id = f.id AND sri.store_id = v_store_id
    LEFT JOIN public.products AS p
      ON p.id = sri.product_id AND p.store_id = v_store_id
    LEFT JOIN public.customers AS c
      ON c.id = f.customer_id AND c.store_id = v_store_id
    WHERE (COALESCE(cardinality(p_product_ids), 0) = 0
        OR sri.product_id = ANY(p_product_ids))
      AND (COALESCE(cardinality(p_category_ids), 0) = 0
        OR p.category_id = ANY(p_category_ids))
      AND (COALESCE(cardinality(p_brand_ids), 0) = 0
        OR p.brand_id = ANY(p_brand_ids))
      AND (COALESCE(cardinality(p_units), 0) = 0
        OR p.unit = ANY(p_units))
  ),
  selected_totals AS (
    SELECT
      i.return_id,
      i.return_date,
      i.customer_id,
      i.customer_name,
      f.total AS full_total,
      f.refund_amount AS full_refund,
      COALESCE(f.due_adjustment, 0) AS full_due_adjustment,
      COALESCE(SUM(i.profit_reversal), 0) AS profit_reversal,
      CASE
        WHEN COALESCE(cardinality(p_product_ids), 0) = 0
          AND COALESCE(cardinality(p_category_ids), 0) = 0
          AND COALESCE(cardinality(p_brand_ids), 0) = 0
          AND COALESCE(cardinality(p_units), 0) = 0
          THEN f.total
        ELSE LEAST(GREATEST(SUM(i.total), 0), f.total)
      END AS total_return
    FROM items AS i
    JOIN filtered AS f ON f.id = i.return_id
    GROUP BY i.return_id, i.return_date, i.customer_id, i.customer_name,
      f.total, f.refund_amount, f.due_adjustment
  ),
  selected_returns AS (
    SELECT
      selected_totals.*,
      CASE WHEN full_total > 0
        THEN LEAST(full_refund, full_refund * total_return / full_total)
        ELSE 0
      END AS total_refund,
      CASE WHEN full_total > 0
        THEN LEAST(full_due_adjustment, full_due_adjustment * total_return / full_total)
        ELSE 0
      END AS total_due_adjustment
    FROM selected_totals
  )
  SELECT jsonb_build_object(
    'currency_symbol', (
      SELECT s.currency_symbol
      FROM public.settings AS s
      WHERE s.store_id = v_store_id
      LIMIT 1
    ),
    'return_count', COALESCE((SELECT count(*) FROM selected_returns), 0),
    'total_return', COALESCE((SELECT ROUND(SUM(total_return), 2) FROM selected_returns), 0),
    'total_refund', COALESCE((SELECT ROUND(SUM(total_refund), 2) FROM selected_returns), 0),
    'total_due_adjustment', COALESCE((
      SELECT ROUND(SUM(total_due_adjustment), 2) FROM selected_returns
    ), 0),
    'profit_reversal', COALESCE((
      SELECT ROUND(SUM(profit_reversal), 2) FROM items
    ), 0),
    'daily', COALESCE((
      SELECT jsonb_agg(to_jsonb(daily) ORDER BY daily.return_day)
      FROM (
        SELECT
          to_char(date_trunc('day', f.return_date AT TIME ZONE v_time_zone), 'YYYY-MM-DD') AS return_day,
          ROUND(SUM(f.total_return), 2) AS total_return,
          ROUND(SUM(f.total_refund), 2) AS total_refund,
          ROUND(SUM(f.total_due_adjustment), 2) AS total_due_adjustment,
          ROUND(SUM(f.profit_reversal), 2) AS profit_reversal,
          COUNT(*) AS return_count
        FROM selected_returns AS f
        GROUP BY date_trunc('day', f.return_date AT TIME ZONE v_time_zone)
      ) AS daily
    ), '[]'::jsonb),
    'monthly', COALESCE((
      SELECT jsonb_agg(to_jsonb(monthly) ORDER BY monthly.return_month)
      FROM (
        SELECT
          to_char(date_trunc('month', f.return_date AT TIME ZONE v_time_zone), 'YYYY-MM') AS return_month,
          ROUND(SUM(f.total_return), 2) AS total_return,
          ROUND(SUM(f.total_refund), 2) AS total_refund,
          ROUND(SUM(f.total_due_adjustment), 2) AS total_due_adjustment,
          ROUND(SUM(f.profit_reversal), 2) AS profit_reversal,
          COUNT(*) AS return_count
        FROM selected_returns AS f
        GROUP BY date_trunc('month', f.return_date AT TIME ZONE v_time_zone)
      ) AS monthly
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(to_jsonb(products) ORDER BY products.total_return DESC)
      FROM (
        SELECT
          i.product_id,
          i.product_name,
          SUM(i.quantity) AS quantity,
          ROUND(SUM(i.total), 2) AS total_return,
          ROUND(SUM(i.profit_reversal), 2) AS profit_reversal
        FROM items AS i
        GROUP BY i.product_id, i.product_name
      ) AS products
    ), '[]'::jsonb),
    'customers', COALESCE((
      SELECT jsonb_agg(to_jsonb(customers) ORDER BY customers.total_return DESC)
      FROM (
        SELECT
          i.customer_id,
          i.customer_name,
          ROUND(SUM(i.total_return), 2) AS total_return,
          COUNT(DISTINCT i.return_id) AS return_count
        FROM selected_returns AS i
        GROUP BY i.customer_id, i.customer_name
      ) AS customers
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_return_report(
  timestamptz, timestamptz, uuid, uuid[], uuid[], uuid[], text[], text,
  text, text, numeric, numeric
)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_return_report(
  timestamptz, timestamptz, uuid, uuid[], uuid[], uuid[], text[], text,
  text, text, numeric, numeric
) TO authenticated;

NOTIFY pgrst, 'reload schema';
