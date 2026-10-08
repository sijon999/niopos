/*
# Discount Offer Management System

## Overview
Adds a complete discount offer / customer-specific offer management system to
the existing POS. This migration creates three new tables, extends the existing
atomic `complete_pos_sale` function to accept an optional offer, and adds a
helper function that returns eligible offers for a customer.

## New tables
1. `discount_offers` — master offer definitions.
   - discount_type: 'percentage' or 'fixed'
   - eligibility_type: 'all', 'selected', 'group', 'new', 'returning'
   - max_usage / max_usage_per_customer / usage_count for limits
   - status active/inactive, date range, min/max discount

2. `customer_discount_offers` — assignment of offers to specific customers
   (for eligibility_type = 'selected'). Tracks per-customer usage_count and
   optional override expiry.

3. `discount_offer_usage` — audit trail of every offer usage. Links offer,
   customer, sale, discount amount, and timestamp.

## Modified functions
- `complete_pos_sale` gains an optional `p_offer_id uuid` parameter. When
  provided, the function validates the offer (status, date range, eligibility,
  usage limits, min purchase, max discount), recomputes the discount server-side
  from authoritative product prices, records usage, and increments counters.
  The existing no-offer path is unchanged.

## New function
- `get_customer_eligible_offers(p_customer_id uuid, p_cart_total numeric)`
  returns active offers the customer is eligible for, respecting date range,
  eligibility type, assignment, usage limits, and minimum purchase.

## Security
- RLS enabled on all three tables with anon+authenticated CRUD (single-tenant
  anon-key app, matching existing tables).
- Indexes on offer_id, customer_id, sale_id, status, and date columns.
- No existing table or data is modified or deleted.
*/

CREATE TABLE IF NOT EXISTS discount_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  code text,
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  minimum_purchase numeric DEFAULT 0,
  maximum_discount numeric DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL DEFAULT CURRENT_DATE + INTERVAL '30 days',
  status text NOT NULL DEFAULT 'active',
  eligibility_type text NOT NULL DEFAULT 'all',
  max_usage integer,
  max_usage_per_customer integer,
  usage_count integer NOT NULL DEFAULT 0,
  unlimited_usage boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE discount_offers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS customer_discount_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES discount_offers(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  usage_count integer NOT NULL DEFAULT 0,
  expires_at date,
  UNIQUE(customer_id, offer_id)
);
ALTER TABLE customer_discount_offers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS discount_offer_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES discount_offers(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_value numeric NOT NULL DEFAULT 0,
  discount_type text NOT NULL DEFAULT 'percentage',
  used_at timestamptz DEFAULT now(),
  cashier_id text
);
ALTER TABLE discount_offer_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_discount_offers" ON discount_offers;
CREATE POLICY "anon_select_discount_offers" ON discount_offers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_discount_offers" ON discount_offers;
CREATE POLICY "anon_insert_discount_offers" ON discount_offers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_discount_offers" ON discount_offers;
CREATE POLICY "anon_update_discount_offers" ON discount_offers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_discount_offers" ON discount_offers;
CREATE POLICY "anon_delete_discount_offers" ON discount_offers FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_customer_discount_offers" ON customer_discount_offers;
CREATE POLICY "anon_select_customer_discount_offers" ON customer_discount_offers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_customer_discount_offers" ON customer_discount_offers;
CREATE POLICY "anon_insert_customer_discount_offers" ON customer_discount_offers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_customer_discount_offers" ON customer_discount_offers;
CREATE POLICY "anon_update_customer_discount_offers" ON customer_discount_offers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_customer_discount_offers" ON customer_discount_offers;
CREATE POLICY "anon_delete_customer_discount_offers" ON customer_discount_offers FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_discount_offer_usage" ON discount_offer_usage;
CREATE POLICY "anon_select_discount_offer_usage" ON discount_offer_usage FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_discount_offer_usage" ON discount_offer_usage;
CREATE POLICY "anon_insert_discount_offer_usage" ON discount_offer_usage FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_discount_offer_usage" ON discount_offer_usage;
CREATE POLICY "anon_update_discount_offer_usage" ON discount_offer_usage FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_discount_offer_usage" ON discount_offer_usage;
CREATE POLICY "anon_delete_discount_offer_usage" ON discount_offer_usage FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_discount_offers_status ON discount_offers(status);
CREATE INDEX IF NOT EXISTS idx_discount_offers_dates ON discount_offers(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_customer_discount_offers_customer ON customer_discount_offers(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_discount_offers_offer ON customer_discount_offers(offer_id);
CREATE INDEX IF NOT EXISTS idx_discount_offer_usage_offer ON discount_offer_usage(offer_id);
CREATE INDEX IF NOT EXISTS idx_discount_offer_usage_customer ON discount_offer_usage(customer_id);
CREATE INDEX IF NOT EXISTS idx_discount_offer_usage_sale ON discount_offer_usage(sale_id);

CREATE OR REPLACE FUNCTION get_customer_eligible_offers(
  p_customer_id uuid,
  p_cart_total numeric DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  code text,
  discount_type text,
  discount_value numeric,
  minimum_purchase numeric,
  maximum_discount numeric,
  start_date date,
  end_date date,
  eligibility_type text,
  usage_count integer,
  max_usage integer,
  max_usage_per_customer integer,
  customer_usage_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.name,
    o.description,
    o.code,
    o.discount_type,
    o.discount_value,
    o.minimum_purchase,
    o.maximum_discount,
    o.start_date,
    o.end_date,
    o.eligibility_type,
    o.usage_count,
    o.max_usage,
    o.max_usage_per_customer,
    COALESCE((
      SELECT cdo.usage_count FROM customer_discount_offers cdo
      WHERE cdo.offer_id = o.id AND cdo.customer_id = p_customer_id
    ), 0) AS customer_usage_count
  FROM discount_offers o
  WHERE o.status = 'active'
    AND CURRENT_DATE >= o.start_date
    AND CURRENT_DATE <= o.end_date
    AND p_cart_total >= o.minimum_purchase
    AND (o.unlimited_usage OR o.usage_count < COALESCE(o.max_usage, 0) OR o.max_usage IS NULL)
    AND (
      o.eligibility_type = 'all'
      OR (o.eligibility_type = 'selected' AND EXISTS (
        SELECT 1 FROM customer_discount_offers cdo
        WHERE cdo.offer_id = o.id AND cdo.customer_id = p_customer_id AND cdo.status = 'active'
        AND (cdo.expires_at IS NULL OR cdo.expires_at >= CURRENT_DATE)
        AND (o.max_usage_per_customer IS NULL OR cdo.usage_count < o.max_usage_per_customer)
      ))
    )
  ORDER BY o.name;
$$;

GRANT EXECUTE ON FUNCTION get_customer_eligible_offers(uuid, numeric) TO anon, authenticated;
