CREATE INDEX IF NOT EXISTS idx_purchase_items_product_purchase
  ON purchase_items(product_id, purchase_id);

CREATE OR REPLACE VIEW purchase_expense_report
WITH (security_invoker = true)
AS
SELECT
  p.id,
  'purchase'::text AS transaction_type,
  p.purchase_date AS transaction_date,
  p.po_number AS reference_no,
  s.name AS party_name,
  s.phone AS party_phone,
  NULL::text AS category_name,
  COALESCE(p.payment_method, 'other')::text AS payment_method,
  p.total AS amount,
  p.status,
  p.created_at,
  p.supplier_id,
  NULL::uuid AS category_id
FROM purchases p
LEFT JOIN suppliers s ON s.id = p.supplier_id
UNION ALL
SELECT
  e.id,
  'expense'::text AS transaction_type,
  e.date::timestamp AT TIME ZONE 'UTC' AS transaction_date,
  COALESCE(NULLIF(e.description, ''), e.id::text) AS reference_no,
  NULL::text AS party_name,
  NULL::text AS party_phone,
  ec.name AS category_name,
  'other'::text AS payment_method,
  e.amount,
  'completed'::text AS status,
  e.created_at,
  NULL::uuid AS supplier_id,
  e.category_id
FROM expenses e
LEFT JOIN expense_categories ec ON ec.id = e.category_id;

DROP FUNCTION IF EXISTS get_purchase_expense_report_summary(
  timestamptz, timestamptz, text, text, uuid, uuid, text
);

CREATE FUNCTION get_purchase_expense_report_summary(
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
  FROM purchase_expense_report r
  WHERE (p_from IS NULL OR r.transaction_date >= p_from)
    AND (p_to IS NULL OR r.transaction_date <= p_to)
    AND (p_type = 'all' OR r.transaction_type = p_type)
    AND (p_payment = 'all' OR r.payment_method = p_payment)
    AND (p_supplier IS NULL OR r.supplier_id = p_supplier)
    AND (p_category IS NULL OR r.category_id = p_category)
    AND (p_status = 'all' OR r.status = p_status)
    AND (p_min_amount IS NULL OR r.amount >= p_min_amount)
    AND (p_max_amount IS NULL OR r.amount <= p_max_amount)
    AND (p_purchase_ids IS NULL OR (
      r.transaction_type = 'purchase' AND r.id = ANY(p_purchase_ids)
    ))
    AND (
      p_search IS NULL OR p_search = '' OR
      r.party_name ILIKE '%' || p_search || '%' OR
      r.party_phone ILIKE '%' || p_search || '%' OR
      r.reference_no ILIKE '%' || p_search || '%' OR
      r.category_name ILIKE '%' || p_search || '%'
    );
$$;

GRANT EXECUTE ON FUNCTION get_purchase_expense_report_summary(
  timestamptz, timestamptz, text, text, uuid, uuid, text,
  text, numeric, numeric, uuid[]
) TO anon, authenticated;
