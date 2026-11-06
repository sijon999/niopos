-- Invoice-linked collection records and transaction-safe financial updates.
ALTER TABLE public.customer_payments
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE INDEX IF NOT EXISTS customer_payments_sale_idx
  ON public.customer_payments (store_id, sale_id, payment_date DESC)
  WHERE sale_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_payments_store_idempotency_uidx
  ON public.customer_payments (store_id, idempotency_key)
  WHERE store_id IS NOT NULL AND idempotency_key IS NOT NULL;

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
    COALESCE(SUM(COALESCE(sr.due_adjustment, sr.total))
      FILTER (WHERE sr.status = 'completed'), 0)
  INTO v_total_return, v_total_due_adjustment
  FROM public.sale_returns AS sr
  WHERE sr.customer_id = p_customer_id
    AND sr.store_id = v_store_id;

  v_total_paid := v_total_paid + COALESCE((
    SELECT SUM(cp.amount)
    FROM public.customer_payments AS cp
    WHERE cp.customer_id = p_customer_id
      AND cp.store_id = v_store_id
      AND cp.sale_id IS NULL
  ), 0);

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
        AND cp.sale_id IS NULL
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

CREATE OR REPLACE FUNCTION public.collect_customer_invoice_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date,
  p_reference_number text,
  p_note text,
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
  v_payment public.customer_payments%ROWTYPE;
  v_due_adjustments numeric;
  v_remaining_due numeric;
BEGIN
  v_store_id := public.get_my_store_id();
  IF v_user_id IS NULL OR v_store_id IS NULL
    OR NOT public.has_store_permission('sales') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'payment_permission_denied';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0
    OR p_payment_method NOT IN ('cash', 'card', 'mobile', 'bank')
    OR p_payment_date IS NULL OR p_idempotency_key IS NULL
    OR length(COALESCE(p_reference_number, '')) > 120
    OR length(COALESCE(p_note, '')) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_invalid_request';
  END IF;

  SELECT s.*
  INTO v_sale
  FROM public.sales AS s
  WHERE s.id = p_sale_id
    AND s.store_id = v_store_id
    AND s.customer_id IS NOT NULL
    AND s.status = 'completed'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'payment_invoice_not_found';
  END IF;

  SELECT cp.*
  INTO v_payment
  FROM public.customer_payments AS cp
  WHERE cp.store_id = v_store_id
    AND cp.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_payment.sale_id IS DISTINCT FROM p_sale_id
      OR v_payment.customer_id IS DISTINCT FROM v_sale.customer_id
      OR v_payment.amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_duplicate_request';
    END IF;
    RETURN jsonb_build_object(
      'id', v_payment.id,
      'sale_id', v_payment.sale_id,
      'amount', v_payment.amount,
      'remaining_due', GREATEST(COALESCE(v_sale.due_amount, 0), 0)
    );
  END IF;

  SELECT COALESCE(SUM(COALESCE(sr.due_adjustment, sr.total)), 0)
  INTO v_due_adjustments
  FROM public.sale_returns AS sr
  WHERE sr.original_sale_id = v_sale.id
    AND sr.store_id = v_store_id
    AND sr.status = 'completed';

  v_remaining_due := GREATEST(COALESCE(v_sale.due_amount, 0) - v_due_adjustments, 0);
  IF p_amount > v_remaining_due THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_exceeds_remaining_due';
  END IF;

  INSERT INTO public.customer_payments (
    customer_id, sale_id, amount, payment_date, payment_method,
    reference_number, note, store_id, idempotency_key
  ) VALUES (
    v_sale.customer_id, v_sale.id, p_amount, p_payment_date::timestamptz,
    p_payment_method, NULLIF(btrim(p_reference_number), ''),
    NULLIF(btrim(p_note), ''), v_store_id, p_idempotency_key
  )
  RETURNING * INTO v_payment;

  UPDATE public.sales
  SET paid = LEAST(COALESCE(total, 0), COALESCE(paid, 0) + p_amount),
      due_amount = GREATEST(COALESCE(due_amount, 0) - p_amount, 0),
      payment_status = CASE
        WHEN GREATEST(COALESCE(due_amount, 0) - p_amount - v_due_adjustments, 0) = 0
          THEN 'paid'
        ELSE 'partial'
      END
  WHERE id = v_sale.id
    AND store_id = v_store_id;

  PERFORM public.refresh_customer_financials(v_sale.customer_id);

  RETURN jsonb_build_object(
    'id', v_payment.id,
    'sale_id', v_sale.id,
    'amount', v_payment.amount,
    'remaining_due', GREATEST(v_remaining_due - p_amount, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.collect_customer_invoice_payment(
  uuid, numeric, text, date, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collect_customer_invoice_payment(
  uuid, numeric, text, date, text, text, uuid
) TO authenticated;

DO $migration$
DECLARE
  v_definition text;
  v_restricted text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.complete_sale_return(uuid,jsonb,text,uuid)'::regprocedure
  );
  v_restricted := regexp_replace(
    v_definition,
    'IF p_refund_method IS NULL OR p_refund_method NOT IN[[:space:]]*\([^)]*\)',
    'IF p_refund_method IS DISTINCT FROM ''cash''',
    'g'
  );
  IF v_restricted = v_definition
    OR position('IF p_refund_method IS DISTINCT FROM ''cash''' IN v_restricted) = 0 THEN
    RAISE EXCEPTION 'Unable to enforce the cash-only sales return policy';
  END IF;
  EXECUTE v_restricted;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
