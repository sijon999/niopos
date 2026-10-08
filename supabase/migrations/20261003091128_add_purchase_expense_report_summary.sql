/*
# Add server-side Purchase & Expense report summary

## Purpose
Adds a read-only aggregate function for the Purchase & Expense report so
summary cards are calculated across the complete filtered result set, not only
the current pagination page.

## Inputs
- Optional inclusive date boundaries.
- Transaction type, payment method, supplier, category, and partial search.

## Outputs
- Total purchase amount.
- Total expense amount.
- Total outflow.
- Matching transaction count.

## Security
The function runs as invoker and reads through the existing reporting view,
which uses the source tables' existing RLS behavior. It is granted to anon and
authenticated because this is a single-tenant app using the anon-key client.
No records are changed.
*/

CREATE OR REPLACE FUNCTION get_purchase_expense_report_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_type text DEFAULT 'all',
  p_payment text DEFAULT 'all',
  p_supplier uuid DEFAULT NULL,
  p_category uuid DEFAULT NULL,
  p_search text DEFAULT NULL
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
  FROM purchase_expense_report r
  WHERE (p_from IS NULL OR r.transaction_date >= p_from)
    AND (p_to IS NULL OR r.transaction_date <= p_to)
    AND (p_type = 'all' OR r.transaction_type = p_type)
    AND (p_payment = 'all' OR r.payment_method = p_payment)
    AND (p_supplier IS NULL OR r.supplier_id = p_supplier)
    AND (p_category IS NULL OR r.category_id = p_category)
    AND (
      p_search IS NULL OR p_search = '' OR
      r.party_name ILIKE '%' || p_search || '%' OR
      r.party_phone ILIKE '%' || p_search || '%' OR
      r.reference_no ILIKE '%' || p_search || '%' OR
      r.category_name ILIKE '%' || p_search || '%'
    );
$$;

GRANT EXECUTE ON FUNCTION get_purchase_expense_report_summary(timestamptz, timestamptz, text, text, uuid, uuid, text) TO anon, authenticated;
