/*
# Fix RLS policies on stock_reconciliations and stock_adjustments

## Problem
The stock_reconciliations and stock_adjustments tables were created with
RLS policies scoped to `TO authenticated` only. However, this application
uses the anon key from the browser (custom auth via localStorage, not
Supabase Auth sessions). The anon role has column grants but no matching
RLS policies, so RLS blocks all reads and writes for the frontend client.

## Fix
Drop the authenticated-only policies and recreate them with
`TO anon, authenticated` to match every other table in the application.

## Tables affected
- stock_reconciliations
- stock_adjustments

## Security
No change in security posture — the app is single-tenant with shared data,
same as all other tables (products, sales, stock_movements, etc.).
*/

-- Fix stock_reconciliations policies
DROP POLICY IF EXISTS "select_reconciliations" ON stock_reconciliations;
CREATE POLICY "select_reconciliations" ON stock_reconciliations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_reconciliations" ON stock_reconciliations;
CREATE POLICY "insert_reconciliations" ON stock_reconciliations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_reconciliations" ON stock_reconciliations;
CREATE POLICY "update_reconciliations" ON stock_reconciliations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_reconciliations" ON stock_reconciliations;
CREATE POLICY "delete_reconciliations" ON stock_reconciliations FOR DELETE
  TO anon, authenticated USING (true);

-- Fix stock_adjustments policies
DROP POLICY IF EXISTS "select_adjustments" ON stock_adjustments;
CREATE POLICY "select_adjustments" ON stock_adjustments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_adjustments" ON stock_adjustments;
CREATE POLICY "insert_adjustments" ON stock_adjustments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_adjustments" ON stock_adjustments;
CREATE POLICY "update_adjustments" ON stock_adjustments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_adjustments" ON stock_adjustments;
CREATE POLICY "delete_adjustments" ON stock_adjustments FOR DELETE
  TO anon, authenticated USING (true);
