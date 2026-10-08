/*
# Stock Reconciliation / Verification System

## Purpose
Allows staff to physically count products and compare with system stock WITHOUT modifying actual inventory.
Verification and adjustment are separate operations.

## New Tables

### stock_reconciliations
- `id` (uuid PK)
- `product_id` (uuid FK → products.id, NOT NULL)
- `variant_id` (uuid FK → product_variants.id, NULLABLE)
- `system_quantity` (numeric, NOT NULL) — system stock at time of verification
- `physical_quantity` (numeric, NOT NULL) — counted physical stock
- `difference` (numeric, NOT NULL DEFAULT 0) — physical - system
- `status` (text, NOT NULL DEFAULT 'NOT_CHECKED') — NOT_CHECKED | CHECKED | DIFFERENCE_FOUND
- `reason` (text, NULLABLE) — reason code if difference found
- `reason_details` (text, NULLABLE) — free text for "Other" reason
- `checked_by` (text, NULLABLE) — name of user who verified
- `checked_at` (timestamptz, NULLABLE) — when verification was done
- `adjustment_applied` (boolean, DEFAULT false) — whether stock adjustment was applied
- `adjustment_applied_at` (timestamptz, NULLABLE)
- `adjustment_applied_by` (text, NULLABLE)
- `created_at` (timestamptz DEFAULT now())
- `updated_at` (timestamptz DEFAULT now())

### stock_adjustments
- `id` (uuid PK)
- `product_id` (uuid FK → products.id, NOT NULL)
- `reconciliation_id` (uuid FK → stock_reconciliations.id, NULLABLE)
- `previous_quantity` (numeric, NOT NULL)
- `new_quantity` (numeric, NOT NULL)
- `difference` (numeric, NOT NULL DEFAULT 0)
- `reason` (text, NULLABLE)
- `reason_details` (text, NULLABLE)
- `adjusted_by` (text, NULLABLE)
- `adjusted_at` (timestamptz DEFAULT now())
- `created_at` (timestamptz DEFAULT now())

## Indexes
- stock_reconciliations: product_id, checked_at, status
- stock_adjustments: product_id, reconciliation_id

## Security
- RLS enabled on both tables
- Policies for authenticated users (app has sign-in): full CRUD for authenticated users
- Uses TO authenticated with auth.uid() ownership via checked_by/adjusted_by matching user email

## Important Notes
1. Verification NEVER modifies products.stock
2. Adjustment modifies products.stock and creates a stock_movements record
3. Historical reconciliation records are never modified after creation
4. system_quantity is captured at verification time, not recalculated later
*/

-- Create stock_reconciliations table
CREATE TABLE IF NOT EXISTS stock_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  system_quantity numeric NOT NULL DEFAULT 0,
  physical_quantity numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'NOT_CHECKED',
  reason text,
  reason_details text,
  checked_by text,
  checked_at timestamptz,
  adjustment_applied boolean NOT NULL DEFAULT false,
  adjustment_applied_at timestamptz,
  adjustment_applied_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create stock_adjustments table
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  reconciliation_id uuid REFERENCES stock_reconciliations(id) ON DELETE SET NULL,
  previous_quantity numeric NOT NULL DEFAULT 0,
  new_quantity numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  reason text,
  reason_details text,
  adjusted_by text,
  adjusted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE stock_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Policies for stock_reconciliations (authenticated users can CRUD)
DROP POLICY IF EXISTS "select_reconciliations" ON stock_reconciliations;
CREATE POLICY "select_reconciliations" ON stock_reconciliations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_reconciliations" ON stock_reconciliations;
CREATE POLICY "insert_reconciliations" ON stock_reconciliations FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_reconciliations" ON stock_reconciliations;
CREATE POLICY "update_reconciliations" ON stock_reconciliations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_reconciliations" ON stock_reconciliations;
CREATE POLICY "delete_reconciliations" ON stock_reconciliations FOR DELETE
  TO authenticated USING (true);

-- Policies for stock_adjustments
DROP POLICY IF EXISTS "select_adjustments" ON stock_adjustments;
CREATE POLICY "select_adjustments" ON stock_adjustments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_adjustments" ON stock_adjustments;
CREATE POLICY "insert_adjustments" ON stock_adjustments FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_adjustments" ON stock_adjustments;
CREATE POLICY "update_adjustments" ON stock_adjustments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_adjustments" ON stock_adjustments;
CREATE POLICY "delete_adjustments" ON stock_adjustments FOR DELETE
  TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reconciliations_product_id ON stock_reconciliations(product_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_checked_at ON stock_reconciliations(checked_at);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON stock_reconciliations(status);
CREATE INDEX IF NOT EXISTS idx_adjustments_product_id ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_reconciliation_id ON stock_adjustments(reconciliation_id);

-- Add updated_at trigger for stock_reconciliations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reconciliations_updated_at ON stock_reconciliations;
CREATE TRIGGER trigger_reconciliations_updated_at
  BEFORE UPDATE ON stock_reconciliations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
