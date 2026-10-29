/*
# Add server-side Purchase & Expense report view

## Overview
Creates a read-only unified reporting view over the existing `purchases` and
`expenses` tables. It does not merge, copy, or replace the underlying business
records.

## View fields
- `id`: source record identifier
- `transaction_type`: `purchase` or `expense`
- `transaction_date`: normalized timestamp used for inclusive date filtering
- `reference_no`: purchase order number or expense reference/description
- `party_name`: supplier name for purchases
- `party_phone`: supplier phone for purchases
- `category_name`: expense category for expenses
- `payment_method`: normalized existing payment-method value, or `other` where
  the source entity has no payment-method column
- `amount`: transaction total
- `status`: source record status
- `created_at`: source creation timestamp

## Performance
Adds date, supplier, category, and status indexes to the existing tables for
common report filters. No new table or duplicate business record is created.

## Security
The view uses invoker security so the existing RLS policies on the source
Purchase, Expense, Supplier, and Expense Category tables remain effective.
The app is single-tenant and already exposes these tables to anon and
authenticated clients.
*/

CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_date ON purchases(supplier_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_status_date ON purchases(status, purchase_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category_date ON expenses(category_id, date);

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
  'other'::text AS payment_method,
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
