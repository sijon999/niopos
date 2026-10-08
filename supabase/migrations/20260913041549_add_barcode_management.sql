-- Add barcode_format column to products
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'barcode_format') THEN
    ALTER TABLE products ADD COLUMN barcode_format text DEFAULT 'CODE128';
  END IF;
END $$;

-- Add unique constraint on barcode (nullable allows multiple nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique ON products (barcode) WHERE barcode IS NOT NULL;

-- Barcode history table
CREATE TABLE IF NOT EXISTS barcode_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  barcode text NOT NULL,
  barcode_format text DEFAULT 'CODE128',
  quantity_printed integer DEFAULT 1,
  branch text DEFAULT 'main',
  generated_by text,
  generated_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE barcode_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for barcode_history (single-tenant, anon+authenticated)
DROP POLICY IF EXISTS "anon_select_barcode_history" ON barcode_history;
CREATE POLICY "anon_select_barcode_history" ON barcode_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_barcode_history" ON barcode_history;
CREATE POLICY "anon_insert_barcode_history" ON barcode_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_barcode_history" ON barcode_history;
CREATE POLICY "anon_update_barcode_history" ON barcode_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_barcode_history" ON barcode_history;
CREATE POLICY "anon_delete_barcode_history" ON barcode_history FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_barcode_history_product ON barcode_history(product_id);
CREATE INDEX IF NOT EXISTS idx_barcode_history_barcode ON barcode_history(barcode);
CREATE INDEX IF NOT EXISTS idx_barcode_history_date ON barcode_history(generated_date);
