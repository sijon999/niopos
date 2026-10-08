/*
# Grocery POS & Inventory Management System - Core Schema

## Overview
Creates the complete database schema for a grocery store POS and inventory management system.
This is a single-tenant demo app (no auth required) so all tables use anon+authenticated policies.

## New Tables
1. **categories** - Product categories with optional parent for sub-categories
2. **brands** - Product brands
3. **suppliers** - Supplier companies
4. **products** - Grocery products with full POS/inventory fields
5. **customers** - Customer records with reward points and wallet
6. **employees** - Employee records
7. **sales** - Sales transactions (orders)
8. **sale_items** - Line items per sale
9. **purchases** - Purchase orders from suppliers
10. **purchase_items** - Line items per purchase
11. **expenses** - Business expenses
12. **expense_categories** - Expense categories
13. **stock_movements** - Stock in/out/transfer/adjustment history
14. **settings** - Store configuration (single row store info)

## Security
- RLS enabled on all tables.
- All tables allow anon+authenticated CRUD (single-tenant shared data app).
*/

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  description text,
  image_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Brands
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  logo_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  city text,
  country text,
  balance numeric DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text UNIQUE,
  barcode text,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  description text,
  cost_price numeric DEFAULT 0,
  selling_price numeric DEFAULT 0,
  discount_price numeric,
  unit text DEFAULT 'pcs',
  tax_rate numeric DEFAULT 0,
  stock numeric DEFAULT 0,
  min_stock numeric DEFAULT 5,
  image_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  reward_points integer DEFAULT 0,
  wallet_balance numeric DEFAULT 0,
  membership text DEFAULT 'regular',
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  role text DEFAULT 'cashier',
  salary numeric DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Expense Categories
CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  description text,
  amount numeric NOT NULL,
  date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  subtotal numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  total numeric DEFAULT 0,
  paid numeric DEFAULT 0,
  change numeric DEFAULT 0,
  payment_method text DEFAULT 'cash',
  status text DEFAULT 'completed',
  sale_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  quantity numeric DEFAULT 1,
  price numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  subtotal numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  total numeric DEFAULT 0,
  status text DEFAULT 'pending',
  purchase_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Purchase Items
CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid REFERENCES purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  quantity numeric DEFAULT 1,
  cost_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

-- Stock Movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  type text NOT NULL,
  quantity numeric NOT NULL,
  reference text,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- Settings (store info)
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text DEFAULT 'FreshMart Grocery',
  store_email text DEFAULT 'info@freshmart.com',
  store_phone text DEFAULT '+1 555-0100',
  store_address text DEFAULT '123 Main Street, Springfield',
  currency text DEFAULT 'USD',
  currency_symbol text DEFAULT '$',
  tax_rate numeric DEFAULT 5,
  logo_url text,
  receipt_footer text DEFAULT 'Thank you for shopping with us!',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_product ON stock_movements(product_id);

-- Policies: anon+authenticated CRUD for all tables (single-tenant shared data)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('categories','brands','suppliers','products','customers','employees','expense_categories','expenses','sales','sale_items','purchases','purchase_items','stock_movements','settings')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'anon_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true);', 'anon_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'anon_insert_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', 'anon_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'anon_update_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', 'anon_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'anon_delete_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO anon, authenticated USING (true);', 'anon_delete_' || t, t);
  END LOOP;
END $$;