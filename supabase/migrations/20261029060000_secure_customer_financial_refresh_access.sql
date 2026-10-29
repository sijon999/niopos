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

  SELECT COALESCE(SUM(sr.total) FILTER (WHERE sr.status = 'completed'), 0)
  INTO v_total_return
  FROM public.sale_returns AS sr
  WHERE sr.customer_id = p_customer_id
    AND sr.store_id = v_store_id;

  v_total_paid := v_total_paid + COALESCE((
    SELECT SUM(cp.amount)
    FROM public.customer_payments AS cp
    WHERE cp.customer_id = p_customer_id
      AND cp.store_id = v_store_id
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
    ), 0)
    - v_total_return
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

NOTIFY pgrst, 'reload schema';
