DROP FUNCTION IF EXISTS public.get_purchase_expense_report_summary(
  timestamptz, timestamptz, text, text, uuid, uuid, text
);

CREATE FUNCTION public.get_purchase_expense_report_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_type text DEFAULT 'all',
  p_payment text DEFAULT 'all',
  p_supplier uuid DEFAULT NULL,
  p_category uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_min_amount numeric DEFAULT NULL,
  p_max_amount numeric DEFAULT NULL,
  p_purchase_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  total_purchase numeric,
  total_expense numeric,
  total_outflow numeric,
  transaction_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(r.amount) FILTER (WHERE r.transaction_type = 'purchase'), 0),
    COALESCE(SUM(r.amount) FILTER (WHERE r.transaction_type = 'expense'), 0),
    COALESCE(SUM(r.amount), 0),
    COUNT(*)
  FROM public.purchase_expense_report r
  WHERE (p_from IS NULL OR r.transaction_date >= p_from)
    AND (p_to IS NULL OR r.transaction_date <= p_to)
    AND (p_type = 'all' OR r.transaction_type = p_type)
    AND (p_payment = 'all' OR r.payment_method = p_payment)
    AND (p_supplier IS NULL OR r.supplier_id = p_supplier)
    AND (p_category IS NULL OR r.category_id = p_category)
    AND (p_status = 'all' OR r.status = p_status)
    AND (p_min_amount IS NULL OR r.amount >= p_min_amount)
    AND (p_max_amount IS NULL OR r.amount <= p_max_amount)
    AND (
      p_purchase_ids IS NULL
      OR (r.transaction_type = 'purchase' AND r.id = ANY(p_purchase_ids))
    )
    AND (
      p_search IS NULL OR p_search = '' OR
      r.party_name ILIKE '%' || p_search || '%' OR
      r.party_phone ILIKE '%' || p_search || '%' OR
      r.reference_no ILIKE '%' || p_search || '%' OR
      r.category_name ILIKE '%' || p_search || '%'
    );
$$;

REVOKE ALL ON FUNCTION public.get_purchase_expense_report_summary(
  timestamptz, timestamptz, text, text, uuid, uuid, text,
  text, numeric, numeric, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_expense_report_summary(
  timestamptz, timestamptz, text, text, uuid, uuid, text,
  text, numeric, numeric, uuid[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';
