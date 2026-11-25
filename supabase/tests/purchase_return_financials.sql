-- Run only against an isolated Supabase database after all migrations.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(18);

CREATE TEMP TABLE purchase_return_test_fixture (
  owner_id uuid NOT NULL,
  store_id uuid,
  supplier_id uuid NOT NULL,
  product_id uuid NOT NULL,
  purchase_id uuid NOT NULL,
  purchase_item_id uuid NOT NULL,
  first_result jsonb,
  second_result jsonb
);

INSERT INTO purchase_return_test_fixture (
  owner_id, supplier_id, product_id, purchase_id, purchase_item_id
)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
SELECT owner_id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  owner_id::text || '@purchase-return.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Purchase Return Test","store_name":"Purchase Return Test"}'::jsonb,
  now(),
  now()
FROM purchase_return_test_fixture;

UPDATE public.profiles
SET role = 'store_owner', status = 'approved'
WHERE id = (SELECT owner_id FROM purchase_return_test_fixture);

UPDATE purchase_return_test_fixture AS fixture
SET store_id = (
  SELECT profile.store_id
  FROM public.profiles AS profile
  WHERE profile.id = fixture.owner_id
);

INSERT INTO public.suppliers (
  id, store_id, name, total_buy, total_paid, total_due
)
SELECT supplier_id, store_id, 'Purchase Return Test Supplier', 100, 40, 60
FROM purchase_return_test_fixture;

INSERT INTO public.products (
  id, store_id, name, unit, cost_price, selling_price, stock, status
)
SELECT product_id, store_id, 'Purchase Return Test Product', 'pcs', 10, 15, 10, 'active'
FROM purchase_return_test_fixture;

INSERT INTO public.purchases (
  id, store_id, po_number, supplier_id, subtotal, tax, discount, total,
  paid_amount, due_amount, payment_method, status, payment_status, purchase_date
)
SELECT purchase_id, store_id, 'PURCHASE-RETURN-' || left(purchase_id::text, 8),
  supplier_id, 100, 0, 0, 100, 40, 60, 'due', 'received', 'partial', now()
FROM purchase_return_test_fixture;

INSERT INTO public.purchase_items (
  id, store_id, purchase_id, product_id, product_name, quantity, cost_price, total
)
SELECT purchase_item_id, store_id, purchase_id, product_id,
  'Purchase Return Test Product', 10, 10, 100
FROM purchase_return_test_fixture;

GRANT SELECT, UPDATE ON purchase_return_test_fixture TO authenticated;
SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT owner_id::text FROM purchase_return_test_fixture),
  true
);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (SELECT owner_id::text FROM purchase_return_test_fixture),
    'role', 'authenticated'
  )::text,
  true
);

UPDATE purchase_return_test_fixture
SET first_result = public.complete_purchase_return(
  purchase_id,
  jsonb_build_array(jsonb_build_object('purchase_item_id', purchase_item_id, 'quantity', 4)),
  'Supplier quality issue',
  NULL
);

SELECT is(
  (SELECT (first_result->>'due_adjustment')::numeric FROM purchase_return_test_fixture),
  40::numeric,
  'return value first reduces the invoice due'
);
SELECT is(
  (SELECT (first_result->>'supplier_credit')::numeric FROM purchase_return_test_fixture),
  0::numeric,
  'a return within the due does not create supplier credit'
);
SELECT is(
  (SELECT stock FROM public.products WHERE id = fixture.product_id),
  6::numeric,
  'returned products are deducted from inventory'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT due_amount FROM public.purchases WHERE id = fixture.purchase_id),
  20::numeric,
  'purchase invoice due is reduced by the return'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT payment_status FROM public.purchases WHERE id = fixture.purchase_id),
  'partial',
  'an invoice with remaining due stays partially due'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT total_buy FROM public.suppliers WHERE id = fixture.supplier_id),
  60::numeric,
  'supplier net purchase total is reduced by the return'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT total_due FROM public.suppliers WHERE id = fixture.supplier_id),
  20::numeric,
  'supplier outstanding due is reduced by the return'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT total_paid FROM public.suppliers WHERE id = fixture.supplier_id),
  40::numeric,
  'supplier paid total remains actual amounts paid'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT count(*)::integer FROM public.purchase_returns WHERE original_purchase_id = fixture.purchase_id),
  1,
  'completed return is recorded against the original purchase'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT count(*)::integer FROM public.purchase_return_items AS item
   JOIN public.purchase_returns AS returned ON returned.id = item.return_id
   WHERE returned.original_purchase_id = fixture.purchase_id
     AND item.quantity = 4),
  1,
  'returned item quantity is recorded'
)
FROM purchase_return_test_fixture AS fixture;

UPDATE purchase_return_test_fixture
SET second_result = public.complete_purchase_return(
  purchase_id,
  jsonb_build_array(jsonb_build_object('purchase_item_id', purchase_item_id, 'quantity', 4)),
  'Supplier quality issue',
  NULL
);

SELECT is(
  (SELECT (second_result->>'due_adjustment')::numeric FROM purchase_return_test_fixture),
  20::numeric,
  'a later return only applies the remaining invoice due'
);
SELECT is(
  (SELECT (second_result->>'supplier_credit')::numeric FROM purchase_return_test_fixture),
  20::numeric,
  'return value above the remaining due becomes supplier credit'
);
SELECT is(
  (SELECT due_amount FROM public.purchases WHERE id = fixture.purchase_id),
  0::numeric,
  'invoice due cannot fall below zero'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT total_due FROM public.suppliers WHERE id = fixture.supplier_id),
  0::numeric,
  'supplier due cannot fall below zero'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT total_buy FROM public.suppliers WHERE id = fixture.supplier_id),
  20::numeric,
  'all returned value is removed from supplier purchase totals'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT total_paid FROM public.suppliers WHERE id = fixture.supplier_id),
  40::numeric,
  'excess return credit does not rewrite actual paid totals'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT stock FROM public.products WHERE id = fixture.product_id),
  2::numeric,
  'a second partial return deducts its quantity from inventory'
)
FROM purchase_return_test_fixture AS fixture;
SELECT is(
  (SELECT count(*)::integer FROM public.purchase_returns WHERE original_purchase_id = fixture.purchase_id),
  2,
  'both completed partial returns appear in purchase return history'
)
FROM purchase_return_test_fixture AS fixture;

SELECT * FROM finish();
ROLLBACK;
