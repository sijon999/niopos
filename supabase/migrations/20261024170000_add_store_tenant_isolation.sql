DO $$
DECLARE
  v_owner_id constant uuid := '134a6c47-e059-431e-9beb-3b9e5e12c918';
  v_owner_status text;
  v_store_count integer;
BEGIN
  SELECT status
  INTO v_owner_status
  FROM public.profiles
  WHERE id = v_owner_id
    AND role = 'store_owner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant backfill owner % must exist as a store_owner profile before this migration', v_owner_id;
  END IF;

  SELECT COUNT(*)
  INTO v_store_count
  FROM public.stores
  WHERE owner_id = v_owner_id;

  IF v_store_count > 1 THEN
    RAISE EXCEPTION 'Tenant backfill owner % has multiple stores; choose the correct destination before migrating', v_owner_id;
  ELSIF v_store_count = 0 THEN
    INSERT INTO public.stores (owner_id, name, email, status)
    SELECT
      id,
      COALESCE(NULLIF(BTRIM(full_name), ''), 'NioPOS') || ' Store',
      email,
      v_owner_status
    FROM public.profiles
    WHERE id = v_owner_id;
  END IF;
END;
$$;

CREATE TABLE public.store_memberships (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager', 'cashier')),
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id)
);

CREATE INDEX store_memberships_user_status_idx
  ON public.store_memberships (user_id, status);

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'super_admin'
      AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_store_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id uuid;
  v_store_count integer;
BEGIN
  IF (SELECT public.is_super_admin()) THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), (array_agg(store_access.store_id))[1]
  INTO v_store_count, v_store_id
  FROM (
    SELECT s.id AS store_id
    FROM public.stores AS s
    JOIN public.profiles AS p ON p.id = s.owner_id
    WHERE s.owner_id = (SELECT auth.uid())
      AND s.status = 'approved'
      AND p.role = 'store_owner'
      AND p.status = 'approved'

    UNION

    SELECT sm.store_id
    FROM public.store_memberships AS sm
    JOIN public.stores AS s ON s.id = sm.store_id
    JOIN public.profiles AS p ON p.id = sm.user_id
    WHERE sm.user_id = (SELECT auth.uid())
      AND sm.status = 'approved'
      AND s.status = 'approved'
      AND p.role = sm.role
      AND p.status = 'approved'
      AND p.role IN ('manager', 'cashier')
  ) AS store_access;

  IF v_store_count > 1 THEN
    RAISE EXCEPTION 'This account is assigned to multiple stores; select a store context before continuing'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_store_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_store_access(target_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1
      FROM public.stores AS s
      JOIN public.profiles AS p ON p.id = s.owner_id
      WHERE s.id = target_store_id
        AND s.owner_id = (SELECT auth.uid())
        AND p.role = 'store_owner'
        AND s.status = 'approved'
        AND p.status = 'approved'
    )
    OR EXISTS (
      SELECT 1
      FROM public.store_memberships AS sm
      JOIN public.stores AS s ON s.id = sm.store_id
      JOIN public.profiles AS p ON p.id = sm.user_id
      WHERE sm.store_id = target_store_id
        AND sm.user_id = (SELECT auth.uid())
        AND sm.status = 'approved'
        AND s.status = 'approved'
        AND p.role = sm.role
        AND p.status = 'approved'
    );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_store_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_store_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_tenant_store_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  IF (SELECT public.is_super_admin()) THEN
    IF NEW.store_id IS NULL THEN
      RAISE EXCEPTION 'A store_id is required for Super Admin writes';
    END IF;
    RETURN NEW;
  END IF;

  v_store_id := (SELECT public.get_my_store_id());
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'An approved store membership is required';
  END IF;

  IF NEW.store_id IS NOT NULL AND NEW.store_id <> v_store_id THEN
    RAISE EXCEPTION 'A record cannot be assigned to another store'
      USING ERRCODE = '42501';
  END IF;

  NEW.store_id := v_store_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_store_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_store_membership_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_store_membership_updated_at() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'categories', 'brands', 'suppliers', 'products', 'customers', 'employees',
    'expense_categories', 'expenses', 'sales', 'sale_items', 'purchases',
    'purchase_items', 'stock_movements', 'settings', 'sale_returns',
    'sale_return_items', 'purchase_returns', 'purchase_return_items',
    'customer_payments', 'supplier_payments', 'bank_accounts',
    'bank_transactions', 'cash_transactions', 'held_orders', 'customer_groups',
    'users', 'roles', 'barcode_history', 'units', 'product_variants',
    'stock_reconciliations', 'stock_adjustments', 'discount_offers',
    'customer_discount_offers', 'discount_offer_usage',
    'customer_discount_history'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'Expected business table public.% is missing', v_table;
    END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT',
      v_table
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_owner_id constant uuid := '134a6c47-e059-431e-9beb-3b9e5e12c918';
  v_store_id uuid;
  v_table text;
  v_tables text[] := ARRAY[
    'categories', 'brands', 'suppliers', 'products', 'customers', 'employees',
    'expense_categories', 'expenses', 'sales', 'sale_items', 'purchases',
    'purchase_items', 'stock_movements', 'settings', 'sale_returns',
    'sale_return_items', 'purchase_returns', 'purchase_return_items',
    'customer_payments', 'supplier_payments', 'bank_accounts',
    'bank_transactions', 'cash_transactions', 'held_orders', 'customer_groups',
    'users', 'roles', 'barcode_history', 'units', 'product_variants',
    'stock_reconciliations', 'stock_adjustments', 'discount_offers',
    'customer_discount_offers', 'discount_offer_usage',
    'customer_discount_history'
  ];
BEGIN
  SELECT id INTO v_store_id
  FROM public.stores
  WHERE owner_id = v_owner_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No default store exists for backfill owner %', v_owner_id;
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'UPDATE public.%I SET store_id = $1 WHERE store_id IS DISTINCT FROM $1',
      v_table
    ) USING v_store_id;

    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN store_id SET NOT NULL',
      v_table
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (store_id)',
      'idx_' || v_table || '_store_id',
      v_table
    );

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (id, store_id)',
      'idx_tenant_' || v_table || '_id_store',
      v_table
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_fk record;
  v_constraint_name text;
BEGIN
  FOR v_fk IN
    SELECT *
    FROM (VALUES
      ('categories', 'parent_id', 'categories', 'SET NULL (parent_id)'),
      ('products', 'brand_id', 'brands', 'SET NULL (brand_id)'),
      ('products', 'category_id', 'categories', 'SET NULL (category_id)'),
      ('expenses', 'category_id', 'expense_categories', 'SET NULL (category_id)'),
      ('customers', 'group_id', 'customer_groups', 'SET NULL (group_id)'),
      ('sales', 'customer_id', 'customers', 'SET NULL (customer_id)'),
      ('sales', 'employee_id', 'employees', 'SET NULL (employee_id)'),
      ('sale_items', 'sale_id', 'sales', 'CASCADE'),
      ('sale_items', 'product_id', 'products', 'SET NULL (product_id)'),
      ('purchases', 'supplier_id', 'suppliers', 'SET NULL (supplier_id)'),
      ('purchase_items', 'purchase_id', 'purchases', 'CASCADE'),
      ('purchase_items', 'product_id', 'products', 'SET NULL (product_id)'),
      ('stock_movements', 'product_id', 'products', 'CASCADE'),
      ('sale_returns', 'original_sale_id', 'sales', 'SET NULL (original_sale_id)'),
      ('sale_returns', 'customer_id', 'customers', 'SET NULL (customer_id)'),
      ('sale_return_items', 'return_id', 'sale_returns', 'CASCADE'),
      ('sale_return_items', 'product_id', 'products', 'SET NULL (product_id)'),
      ('purchase_returns', 'original_purchase_id', 'purchases', 'SET NULL (original_purchase_id)'),
      ('purchase_returns', 'supplier_id', 'suppliers', 'SET NULL (supplier_id)'),
      ('purchase_return_items', 'return_id', 'purchase_returns', 'CASCADE'),
      ('purchase_return_items', 'product_id', 'products', 'SET NULL (product_id)'),
      ('customer_payments', 'customer_id', 'customers', 'CASCADE'),
      ('supplier_payments', 'supplier_id', 'suppliers', 'CASCADE'),
      ('bank_transactions', 'account_id', 'bank_accounts', 'CASCADE'),
      ('product_variants', 'product_id', 'products', 'CASCADE'),
      ('barcode_history', 'product_id', 'products', 'SET NULL (product_id)'),
      ('stock_reconciliations', 'product_id', 'products', 'CASCADE'),
      ('stock_reconciliations', 'variant_id', 'product_variants', 'SET NULL (variant_id)'),
      ('stock_adjustments', 'product_id', 'products', 'CASCADE'),
      ('stock_adjustments', 'reconciliation_id', 'stock_reconciliations', 'SET NULL (reconciliation_id)'),
      ('customer_discount_offers', 'customer_id', 'customers', 'CASCADE'),
      ('customer_discount_offers', 'offer_id', 'discount_offers', 'CASCADE'),
      ('discount_offer_usage', 'offer_id', 'discount_offers', 'CASCADE'),
      ('discount_offer_usage', 'customer_id', 'customers', 'SET NULL (customer_id)'),
      ('discount_offer_usage', 'sale_id', 'sales', 'SET NULL (sale_id)'),
      ('customer_discount_history', 'customer_id', 'customers', 'SET NULL (customer_id)'),
      ('customer_discount_history', 'sale_id', 'sales', 'CASCADE'),
      ('customer_discount_history', 'sale_item_id', 'sale_items', 'SET NULL (sale_item_id)'),
      ('customer_discount_history', 'product_id', 'products', 'SET NULL (product_id)')
    ) AS relationships(child_table, child_column, parent_table, on_delete)
  LOOP
    v_constraint_name := 'tenant_fk_' || v_fk.child_table || '_' || v_fk.child_column;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = v_constraint_name
        AND conrelid = format('public.%I', v_fk.child_table)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I, store_id) REFERENCES public.%I (id, store_id) ON DELETE %s',
        v_fk.child_table,
        v_constraint_name,
        v_fk.child_column,
        v_fk.parent_table,
        v_fk.on_delete
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_table text;
  v_policy record;
  v_tables text[] := ARRAY[
    'categories', 'brands', 'suppliers', 'products', 'customers', 'employees',
    'expense_categories', 'expenses', 'sales', 'sale_items', 'purchases',
    'purchase_items', 'stock_movements', 'settings', 'sale_returns',
    'sale_return_items', 'purchase_returns', 'purchase_return_items',
    'customer_payments', 'supplier_payments', 'bank_accounts',
    'bank_transactions', 'cash_transactions', 'held_orders', 'customer_groups',
    'users', 'roles', 'barcode_history', 'units', 'product_variants',
    'stock_reconciliations', 'stock_adjustments', 'discount_offers',
    'customer_discount_offers', 'discount_offer_usage',
    'customer_discount_history'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_table);

    FOR v_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'categories', 'brands', 'suppliers', 'products', 'customers', 'employees',
    'expense_categories', 'expenses', 'sales', 'sale_items', 'purchases',
    'purchase_items', 'stock_movements', 'settings', 'sale_returns',
    'sale_return_items', 'purchase_returns', 'purchase_return_items',
    'customer_payments', 'supplier_payments', 'bank_accounts',
    'bank_transactions', 'cash_transactions', 'held_orders', 'customer_groups',
    'users', 'roles', 'barcode_history', 'units', 'product_variants',
    'stock_reconciliations', 'stock_adjustments', 'discount_offers',
    'customer_discount_offers', 'discount_offer_usage',
    'customer_discount_history'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'CREATE POLICY tenant_select ON public.%I FOR SELECT TO authenticated USING ((SELECT public.is_super_admin()) OR store_id = (SELECT public.get_my_store_id()))',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY tenant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_super_admin()) OR store_id = (SELECT public.get_my_store_id()))',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY tenant_update ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.is_super_admin()) OR store_id = (SELECT public.get_my_store_id())) WITH CHECK ((SELECT public.is_super_admin()) OR store_id = (SELECT public.get_my_store_id()))',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY tenant_delete ON public.%I FOR DELETE TO authenticated USING ((SELECT public.is_super_admin()) OR store_id = (SELECT public.get_my_store_id()))',
      v_table
    );

    EXECUTE format(
      'CREATE TRIGGER set_tenant_store_id BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_store_id()',
      v_table
    );
  END LOOP;
END;
$$;

ALTER TABLE public.store_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_memberships FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_memberships TO authenticated;

CREATE POLICY memberships_select_own_store
  ON public.store_memberships
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR user_id = (SELECT auth.uid())
    OR store_id = (SELECT public.get_my_store_id())
  );

CREATE POLICY memberships_insert_super_admin
  ON public.store_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()));

CREATE POLICY memberships_update_super_admin
  ON public.store_memberships
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

CREATE POLICY memberships_delete_super_admin
  ON public.store_memberships
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_super_admin()));

CREATE TRIGGER store_memberships_set_updated_at
  BEFORE UPDATE ON public.store_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_store_membership_updated_at();

DROP POLICY IF EXISTS anon_select_product_images ON storage.objects;
DROP POLICY IF EXISTS anon_insert_product_images ON storage.objects;
DROP POLICY IF EXISTS anon_update_product_images ON storage.objects;
DROP POLICY IF EXISTS anon_delete_product_images ON storage.objects;

CREATE POLICY tenant_select_product_images
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      (SELECT public.is_super_admin())
      OR (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
    )
  );

CREATE POLICY tenant_insert_product_images
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      (SELECT public.is_super_admin())
      OR (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
    )
  );

CREATE POLICY tenant_update_product_images
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      (SELECT public.is_super_admin())
      OR (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      (SELECT public.is_super_admin())
      OR (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
    )
  );

CREATE POLICY tenant_delete_product_images
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      (SELECT public.is_super_admin())
      OR (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
    )
  );

DROP POLICY IF EXISTS stores_select_owner_or_super_admin ON public.stores;
CREATE POLICY stores_select_tenant_members
  ON public.stores
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT public.has_store_access(id)));

DROP POLICY IF EXISTS stores_insert_own_pending_store ON public.stores;
CREATE POLICY stores_insert_own_pending_store
  ON public.stores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role = 'store_owner'
        AND status IN ('pending', 'approved')
    )
  );

CREATE OR REPLACE FUNCTION public.refresh_customer_financials(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id uuid;
  v_total_buy numeric;
  v_total_paid numeric;
  v_total_due numeric;
  v_total_return numeric;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;

  SELECT store_id
  INTO v_store_id
  FROM public.customers
  WHERE id = p_customer_id;

  IF v_store_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_super_admin() AND v_store_id <> public.get_my_store_id() THEN
    RAISE EXCEPTION 'Customer is outside the current store'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(SUM(s.total) FILTER (WHERE s.status = 'completed'), 0),
    COALESCE(SUM(s.paid) FILTER (WHERE s.status = 'completed'), 0),
    COALESCE(SUM(s.due_amount) FILTER (WHERE s.status = 'completed'), 0)
  INTO v_total_buy, v_total_paid, v_total_due
  FROM public.sales AS s
  WHERE s.customer_id = p_customer_id
    AND s.store_id = v_store_id;

  SELECT COALESCE(SUM(sr.total) FILTER (WHERE sr.status = 'completed'), 0)
  INTO v_total_return
  FROM public.sale_returns AS sr
  WHERE sr.customer_id = p_customer_id
    AND sr.store_id = v_store_id;

  v_total_paid := v_total_paid + COALESCE((
    SELECT SUM(cp.amount)
    FROM public.customer_payments AS cp
    WHERE cp.customer_id = p_customer_id
      AND cp.store_id = v_store_id
  ), 0);

  v_total_due := GREATEST(
    0,
    COALESCE((
      SELECT c.previous_due
      FROM public.customers AS c
      WHERE c.id = p_customer_id
        AND c.store_id = v_store_id
    ), 0)
    + v_total_due
    - COALESCE((
      SELECT SUM(cp.amount)
      FROM public.customer_payments AS cp
      WHERE cp.customer_id = p_customer_id
        AND cp.store_id = v_store_id
    ), 0)
    - v_total_return
  );

  UPDATE public.customers
  SET total_buy = GREATEST(0, v_total_buy - v_total_return),
      total_paid = GREATEST(0, v_total_paid),
      total_due = v_total_due,
      total_return = GREATEST(0, v_total_return)
  WHERE id = p_customer_id
    AND store_id = v_store_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_customer_financials_from_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.refresh_customer_financials(NEW.customer_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.refresh_customer_financials(OLD.customer_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_customer_financials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_customer_financials(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.refresh_customer_financials_from_sales() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric) SECURITY INVOKER;
ALTER FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid) SECURITY INVOKER;
ALTER FUNCTION public.complete_purchase_order(uuid, jsonb, numeric, numeric, numeric, text, text, text) SECURITY INVOKER;
ALTER FUNCTION public.cancel_purchase_order(uuid) SECURITY INVOKER;
ALTER FUNCTION public.cancel_sale(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_customer_discount_summary(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_customer_discount_history(uuid, date, date, text, uuid, text, text) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_purchase_order(uuid, jsonb, numeric, numeric, numeric, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_purchase_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_sale(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_eligible_offers(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_discount_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_discount_history(uuid, date, date, text, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_purchase_expense_report_summary(timestamptz, timestamptz, text, text, uuid, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_purchase_order(uuid, jsonb, numeric, numeric, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sale(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_eligible_offers(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_discount_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_discount_history(uuid, date, date, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_expense_report_summary(timestamptz, timestamptz, text, text, uuid, uuid, text) TO authenticated;
