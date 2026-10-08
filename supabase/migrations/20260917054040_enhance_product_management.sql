/*
# Enhance Product Management Module

1. New Tables
- `units` — Unit of measurement management (Pc(s), Kg, Gram, Liter, Meter, Box, Dozen, Pack)
  - id, name, short_name, description, status, created_at
- `product_variants` — Variant support for products (size/color combinations)
  - id, product_id (FK products), variant_sku, barcode, size, color, material, weight, design
  - purchase_price, selling_price, stock_quantity, alert_limit, image_url, status, created_at

2. Modified Tables
- `products` — Added columns:
  - product_code (text, unique) — separate product code from SKU
  - product_type (text, default 'simple') — 'simple' or 'variant'
  - wholesale_price (numeric, default 0)
  - tax_type (text, default 'exclusive') — 'exclusive' or 'inclusive'
  - short_description (text, nullable)
  - product_notes (text, nullable)
  - warehouse (text, nullable)
  - rack_shelf (text, nullable)
  - is_deleted (boolean, default false) — soft delete flag

3. Security
- RLS enabled on units and product_variants
- Single-tenant: anon + authenticated CRUD on both new tables
- Existing products table policies unchanged

4. Notes
- Soft delete via is_deleted flag preserves historical sales records
- Product code uniqueness enforced via partial unique index
- Units table feeds dynamic unit dropdowns in product forms
*/

-- Units table
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text NOT NULL,
  description text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_units" ON units;
CREATE POLICY "anon_select_units" ON units FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_units" ON units;
CREATE POLICY "anon_insert_units" ON units FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_units" ON units;
CREATE POLICY "anon_update_units" ON units FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_units" ON units;
CREATE POLICY "anon_delete_units" ON units FOR DELETE TO anon, authenticated USING (true);

-- Seed default units
INSERT INTO units (name, short_name, description, status) VALUES
  ('Piece', 'Pc(s)', 'Individual piece', 'active'),
  ('Kilogram', 'Kg', 'Weight in kilograms', 'active'),
  ('Gram', 'Gram', 'Weight in grams', 'active'),
  ('Liter', 'Liter', 'Volume in liters', 'active'),
  ('Meter', 'Meter', 'Length in meters', 'active'),
  ('Box', 'Box', 'Box of items', 'active'),
  ('Dozen', 'Dozen', 'Dozen (12 pieces)', 'active'),
  ('Pack', 'Pack', 'Pack of items', 'active')
ON CONFLICT DO NOTHING;

-- Product variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  variant_sku text,
  barcode text,
  size text,
  color text,
  material text,
  weight text,
  design text,
  purchase_price numeric DEFAULT 0,
  selling_price numeric DEFAULT 0,
  stock_quantity integer DEFAULT 0,
  alert_limit integer DEFAULT 0,
  image_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_product_variants" ON product_variants;
CREATE POLICY "anon_select_product_variants" ON product_variants FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_product_variants" ON product_variants;
CREATE POLICY "anon_insert_product_variants" ON product_variants FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_product_variants" ON product_variants;
CREATE POLICY "anon_update_product_variants" ON product_variants FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_product_variants" ON product_variants;
CREATE POLICY "anon_delete_product_variants" ON product_variants FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);

-- Add columns to products
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'product_code') THEN
    ALTER TABLE products ADD COLUMN product_code text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'product_type') THEN
    ALTER TABLE products ADD COLUMN product_type text DEFAULT 'simple';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'wholesale_price') THEN
    ALTER TABLE products ADD COLUMN wholesale_price numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'tax_type') THEN
    ALTER TABLE products ADD COLUMN tax_type text DEFAULT 'exclusive';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'short_description') THEN
    ALTER TABLE products ADD COLUMN short_description text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'product_notes') THEN
    ALTER TABLE products ADD COLUMN product_notes text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'warehouse') THEN
    ALTER TABLE products ADD COLUMN warehouse text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'rack_shelf') THEN
    ALTER TABLE products ADD COLUMN rack_shelf text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_deleted') THEN
    ALTER TABLE products ADD COLUMN is_deleted boolean DEFAULT false;
  END IF;
END $$;

-- Unique index on product_code (partial, only for non-null, non-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_product_code_unique ON products (product_code) WHERE product_code IS NOT NULL AND is_deleted = false;
