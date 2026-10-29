/*
# Add POS/ERP Features - Comprehensive Schema Update

## Summary
Adds columns and tables needed for the full POS/ERP system per the requirements document.

## 1. Products - New Columns
- `online_sale` (boolean, default true): Controls whether product appears on e-commerce website
- `damage_stock` (numeric, default 0): Tracks damaged inventory separately from regular stock

## 2. Customers - New Columns
- `alt_phone` (text): Alternative phone number
- `previous_due` (numeric, default 0): Previous outstanding balance
- `due_limit` (numeric, default 0): Credit limit for the customer
- `father_name` (text): Father's name
- `referral_note` (text): Referral information
- `nid_number` (text): National ID number
- `date_of_birth` (date): Date of birth
- `note` (text): General notes
- `image_url` (text): Profile image
- `total_buy` (numeric, default 0): Total purchase amount
- `total_paid` (numeric, default 0): Total paid amount
- `total_due` (numeric, default 0): Total outstanding balance
- `total_return` (numeric, default 0): Total return amount

## 3. Suppliers - New Columns
- `alt_phone` (text): Alternative phone number
- `company_name` (text): Company name
- `bank_account` (text): Primary bank account details
- `alt_bank_account` (text): Alternative bank account details
- `previous_due` (numeric, default 0): Previous outstanding balance
- `father_name` (text): Father's name
- `referral_note` (text): Referral information
- `nid_number` (text): National ID number
- `date_of_birth` (date): Date of birth
- `note` (text): General notes
- `image_url` (text): Profile image
- `total_buy` (numeric, default 0): Total purchase amount from supplier
- `total_paid` (numeric, default 0): Total paid to supplier
- `total_due` (numeric, default 0): Total outstanding to supplier
- `total_return` (numeric, default 0): Total return amount

## 4. Sales - New Columns
- `branch` (text, default 'main'): Branch identifier
- `payment_status` (text, default 'paid'): paid or due
- `due_amount` (numeric, default 0): Outstanding amount for this sale
- `salesman` (text): Sales person name

## 5. Purchases - New Columns
- `payment_status` (text, default 'paid'): paid or due
- `due_amount` (numeric, default 0): Outstanding amount for this purchase

## 6. New Table: sale_returns
- Tracks returned sales/invoices
- `id`, `invoice_number`, `original_sale_id`, `customer_id`, `return_date`, `reason`, `total`, `status`

## 7. New Table: sale_return_items
- Items within a sale return
- `id`, `return_id`, `product_id`, `product_name`, `quantity`, `price`, `total`

## 8. New Table: purchase_returns
- Tracks returned purchases
- `id`, `po_number`, `original_purchase_id`, `supplier_id`, `return_date`, `reason`, `total`, `status`

## 9. New Table: purchase_return_items
- Items within a purchase return
- `id`, `return_id`, `product_id`, `product_name`, `quantity`, `cost_price`, `total`

## 10. New Table: customer_payments
- Tracks payments made by customers toward their dues
- `id`, `customer_id`, `amount`, `payment_date`, `payment_method`, `note`

## 11. New Table: supplier_payments
- Tracks payments made to suppliers toward their dues
- `id`, `supplier_id`, `amount`, `payment_date`, `payment_method`, `note`

## 12. New Table: bank_accounts
- Bank account management
- `id`, `bank_name`, `branch`, `account_number`, `account_name`, `balance`, `status`

## 13. New Table: bank_transactions
- Bank transaction records
- `id`, `account_id`, `type` (deposit/withdraw/transfer), `amount`, `description`, `transaction_date`

## 14. New Table: cash_transactions
- Cash counter transactions
- `id`, `type` (in/out), `amount`, `description`, `transaction_date`, `counter_name`

## 15. New Table: held_orders
- Held/parked orders in POS
- `id`, `order_data` (jsonb), `customer_name`, `hold_time`, `status`

## 16. New Table: customer_groups
- Customer group management
- `id`, `name`, `description`, `discount_percent`, `created_at`

## 17. New Table: users
- User management for the system
- `id`, `name`, `email`, `phone`, `role`, `password_hash`, `status`, `created_at`

## 18. New Table: roles
- Role management
- `id`, `name`, `permissions` (jsonb), `description`, `created_at`

## Security
- RLS enabled on all new tables with anon+authenticated access (single-tenant app)
*/

-- 1. Products: add online_sale and damage_stock
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'online_sale') THEN
    ALTER TABLE products ADD COLUMN online_sale boolean DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'damage_stock') THEN
    ALTER TABLE products ADD COLUMN damage_stock numeric DEFAULT 0;
  END IF;
END $$;

-- 2. Customers: add new columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'alt_phone') THEN
    ALTER TABLE customers ADD COLUMN alt_phone text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'previous_due') THEN
    ALTER TABLE customers ADD COLUMN previous_due numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'due_limit') THEN
    ALTER TABLE customers ADD COLUMN due_limit numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'father_name') THEN
    ALTER TABLE customers ADD COLUMN father_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'referral_note') THEN
    ALTER TABLE customers ADD COLUMN referral_note text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'nid_number') THEN
    ALTER TABLE customers ADD COLUMN nid_number text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'date_of_birth') THEN
    ALTER TABLE customers ADD COLUMN date_of_birth date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'note') THEN
    ALTER TABLE customers ADD COLUMN note text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'image_url') THEN
    ALTER TABLE customers ADD COLUMN image_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'total_buy') THEN
    ALTER TABLE customers ADD COLUMN total_buy numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'total_paid') THEN
    ALTER TABLE customers ADD COLUMN total_paid numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'total_due') THEN
    ALTER TABLE customers ADD COLUMN total_due numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'total_return') THEN
    ALTER TABLE customers ADD COLUMN total_return numeric DEFAULT 0;
  END IF;
END $$;

-- 3. Suppliers: add new columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'alt_phone') THEN
    ALTER TABLE suppliers ADD COLUMN alt_phone text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'company_name') THEN
    ALTER TABLE suppliers ADD COLUMN company_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'bank_account') THEN
    ALTER TABLE suppliers ADD COLUMN bank_account text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'alt_bank_account') THEN
    ALTER TABLE suppliers ADD COLUMN alt_bank_account text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'previous_due') THEN
    ALTER TABLE suppliers ADD COLUMN previous_due numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'father_name') THEN
    ALTER TABLE suppliers ADD COLUMN father_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'referral_note') THEN
    ALTER TABLE suppliers ADD COLUMN referral_note text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'nid_number') THEN
    ALTER TABLE suppliers ADD COLUMN nid_number text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'date_of_birth') THEN
    ALTER TABLE suppliers ADD COLUMN date_of_birth date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'note') THEN
    ALTER TABLE suppliers ADD COLUMN note text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'image_url') THEN
    ALTER TABLE suppliers ADD COLUMN image_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'total_buy') THEN
    ALTER TABLE suppliers ADD COLUMN total_buy numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'total_paid') THEN
    ALTER TABLE suppliers ADD COLUMN total_paid numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'total_due') THEN
    ALTER TABLE suppliers ADD COLUMN total_due numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'total_return') THEN
    ALTER TABLE suppliers ADD COLUMN total_return numeric DEFAULT 0;
  END IF;
END $$;

-- 4. Sales: add new columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'branch') THEN
    ALTER TABLE sales ADD COLUMN branch text DEFAULT 'main';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'payment_status') THEN
    ALTER TABLE sales ADD COLUMN payment_status text DEFAULT 'paid';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'due_amount') THEN
    ALTER TABLE sales ADD COLUMN due_amount numeric DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'salesman') THEN
    ALTER TABLE sales ADD COLUMN salesman text;
  END IF;
END $$;

-- 5. Purchases: add new columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchases' AND column_name = 'payment_status') THEN
    ALTER TABLE purchases ADD COLUMN payment_status text DEFAULT 'paid';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchases' AND column_name = 'due_amount') THEN
    ALTER TABLE purchases ADD COLUMN due_amount numeric DEFAULT 0;
  END IF;
END $$;

-- 6. sale_returns
CREATE TABLE IF NOT EXISTS sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  original_sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  return_date timestamptz DEFAULT now(),
  reason text,
  total numeric DEFAULT 0,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;

-- 7. sale_return_items
CREATE TABLE IF NOT EXISTS sale_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid REFERENCES sale_returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  quantity numeric DEFAULT 1,
  price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sale_return_items ENABLE ROW LEVEL SECURITY;

-- 8. purchase_returns
CREATE TABLE IF NOT EXISTS purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL,
  original_purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  return_date timestamptz DEFAULT now(),
  reason text,
  total numeric DEFAULT 0,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;

-- 9. purchase_return_items
CREATE TABLE IF NOT EXISTS purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  quantity numeric DEFAULT 1,
  cost_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_return_items ENABLE ROW LEVEL SECURITY;

-- 10. customer_payments
CREATE TABLE IF NOT EXISTS customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  amount numeric DEFAULT 0,
  payment_date timestamptz DEFAULT now(),
  payment_method text DEFAULT 'cash',
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;

-- 11. supplier_payments
CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  amount numeric DEFAULT 0,
  payment_date timestamptz DEFAULT now(),
  payment_method text DEFAULT 'cash',
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

-- 12. bank_accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  branch text,
  account_number text,
  account_name text,
  balance numeric DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

-- 13. bank_transactions
CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES bank_accounts(id) ON DELETE CASCADE,
  type text DEFAULT 'deposit',
  amount numeric DEFAULT 0,
  description text,
  transaction_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

-- 14. cash_transactions
CREATE TABLE IF NOT EXISTS cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text DEFAULT 'in',
  amount numeric DEFAULT 0,
  description text,
  transaction_date timestamptz DEFAULT now(),
  counter_name text DEFAULT 'main',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

-- 15. held_orders
CREATE TABLE IF NOT EXISTS held_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_data jsonb DEFAULT '{}',
  customer_name text,
  hold_time timestamptz DEFAULT now(),
  status text DEFAULT 'held',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE held_orders ENABLE ROW LEVEL SECURITY;

-- 16. customer_groups
CREATE TABLE IF NOT EXISTS customer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  discount_percent numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customer_groups ENABLE ROW LEVEL SECURITY;

-- 17. users (system users, not auth.users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  role text DEFAULT 'cashier',
  password_hash text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 18. roles
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  permissions jsonb DEFAULT '{}',
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for all new tables (single-tenant, anon+authenticated)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'sale_returns', 'sale_return_items', 'purchase_returns', 'purchase_return_items',
    'customer_payments', 'supplier_payments', 'bank_accounts', 'bank_transactions',
    'cash_transactions', 'held_orders', 'customer_groups', 'users', 'roles'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_select_%s" ON %s;', tbl, tbl);
    EXECUTE format('CREATE POLICY "anon_select_%s" ON %s FOR SELECT TO anon, authenticated USING (true);', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON %s;', tbl, tbl);
    EXECUTE format('CREATE POLICY "anon_insert_%s" ON %s FOR INSERT TO anon, authenticated WITH CHECK (true);', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON %s;', tbl, tbl);
    EXECUTE format('CREATE POLICY "anon_update_%s" ON %s FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%s" ON %s;', tbl, tbl);
    EXECUTE format('CREATE POLICY "anon_delete_%s" ON %s FOR DELETE TO anon, authenticated USING (true);', tbl, tbl);
  END LOOP;
END $$;

-- Add customer_group_id to customers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'group_id') THEN
    ALTER TABLE customers ADD COLUMN group_id uuid REFERENCES customer_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_sale_returns_customer ON sale_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_held_orders_status ON held_orders(status);
CREATE INDEX IF NOT EXISTS idx_products_online_sale ON products(online_sale);
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status);
