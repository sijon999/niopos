CREATE TABLE public.store_memberships (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'cashier' CHECK (role = 'cashier'),
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  permissions text[] NOT NULL DEFAULT ARRAY['pos']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id),
  UNIQUE (user_id)
);

CREATE INDEX store_memberships_store_status_idx
  ON public.store_memberships (store_id, status);

CREATE TABLE public.store_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'cashier' CHECK (role = 'cashier'),
  permissions text[] NOT NULL DEFAULT ARRAY['pos']::text[],
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX store_invitations_active_email_idx
  ON public.store_invitations (store_id, lower(email))
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX store_invitations_store_expiry_idx
  ON public.store_invitations (store_id, expires_at);

ALTER TABLE public.store_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.store_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_invitations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.store_memberships, public.store_invitations
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_store_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.stores AS s
      ON s.id = p.store_id
     AND s.owner_id = p.id
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'store_owner')
      AND p.status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_store_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
  v_store_count integer;
BEGIN
  SELECT count(*), (pg_catalog.array_agg(store_access.store_id))[1]
  INTO v_store_count, v_store_id
  FROM (
    SELECT s.id AS store_id
    FROM public.profiles AS p
    JOIN public.stores AS s
      ON s.id = p.store_id
     AND s.owner_id = p.id
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'store_owner')
      AND p.status = 'approved'

    UNION

    SELECT sm.store_id
    FROM public.store_memberships AS sm
    JOIN public.profiles AS p ON p.id = sm.user_id
    WHERE sm.user_id = (SELECT auth.uid())
      AND sm.status = 'approved'
      AND sm.role = 'cashier'
      AND p.role = 'cashier'
      AND p.status = 'approved'
  ) AS store_access;

  IF v_store_count > 1 THEN
    RAISE EXCEPTION 'This account is linked to multiple stores'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_store_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_store_permission(requested_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT CASE
    WHEN requested_permission IS NULL OR requested_permission = '' THEN false
    WHEN (SELECT public.is_store_owner()) THEN true
    WHEN requested_permission <> 'pos' THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.store_memberships AS sm
      JOIN public.profiles AS p ON p.id = sm.user_id
      WHERE sm.store_id = (SELECT public.get_my_store_id())
        AND sm.user_id = (SELECT auth.uid())
        AND sm.role = 'cashier'
        AND sm.status = 'approved'
        AND 'pos' = ANY (sm.permissions)
        AND p.role = 'cashier'
        AND p.status = 'approved'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'super_admin'
        AND p.status = 'approved'
    ) THEN ARRAY['*']::text[]
    WHEN (SELECT public.is_store_owner()) THEN ARRAY['*']::text[]
    WHEN (SELECT public.has_store_permission('pos')) THEN ARRAY['pos']::text[]
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_store_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    IF NEW.store_id IS NULL THEN
      RAISE EXCEPTION 'A store_id is required for trusted backend writes'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_store_id := (SELECT public.get_my_store_id());
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'An approved store account is required'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.store_id IS DISTINCT FROM v_store_id THEN
    RAISE EXCEPTION 'A record cannot be changed outside the current store'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.store_id IS NOT NULL AND NEW.store_id <> v_store_id THEN
    RAISE EXCEPTION 'A record cannot be assigned to another store'
      USING ERRCODE = '42501';
  END IF;

  NEW.store_id := v_store_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_full_name text;
  v_profile_email text;
  v_profile_role text;
  v_profile_store_id uuid;
  v_store_id uuid;
  v_store_count integer;
  v_invitation public.store_invitations%ROWTYPE;
  v_invitation_token uuid;
BEGIN
  IF NEW.email IS NULL OR NULLIF(pg_catalog.btrim(NEW.email), '') IS NULL THEN
    RAISE EXCEPTION 'A valid email is required to create an account';
  END IF;

  v_full_name := COALESCE(
    NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'name'), ''),
    NULLIF(pg_catalog.split_part(NEW.email, '@', 1), ''),
    'New User'
  );

  IF NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'employee_invite_token'), '') IS NOT NULL THEN
    BEGIN
      v_invitation_token := (NEW.raw_user_meta_data ->> 'employee_invite_token')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Employee invitation is invalid';
    END;

    UPDATE public.store_invitations AS invitation
    SET consumed_at = now()
    WHERE invitation.token = v_invitation_token
      AND pg_catalog.lower(invitation.email) = pg_catalog.lower(NEW.email)
      AND EXISTS (
        SELECT 1
        FROM public.stores AS s
        JOIN public.profiles AS owner ON owner.id = s.owner_id
        WHERE s.id = invitation.store_id
          AND owner.store_id = s.id
          AND owner.role IN ('admin', 'store_owner')
          AND owner.status = 'approved'
      )
      AND invitation.consumed_at IS NULL
      AND invitation.revoked_at IS NULL
      AND invitation.expires_at > now()
    RETURNING invitation.* INTO v_invitation;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Employee invitation is invalid, expired, or already used';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, phone, role, status)
    VALUES (
      NEW.id,
      NEW.email,
      v_full_name,
      NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'phone'), ''),
      'cashier',
      'approved'
    );

    INSERT INTO public.store_memberships (store_id, user_id, role, status, permissions)
    VALUES (
      v_invitation.store_id,
      NEW.id,
      'cashier',
      'approved',
      ARRAY['pos']::text[]
    );

    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.id::text, 0));

  INSERT INTO public.profiles (id, email, full_name, phone, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'phone'), ''),
    'admin',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT p.email, p.role, p.store_id
  INTO v_profile_email, v_profile_role, v_profile_store_id
  FROM public.profiles AS p
  WHERE p.id = NEW.id
  FOR UPDATE;

  IF NOT FOUND
    OR pg_catalog.lower(v_profile_email) <> pg_catalog.lower(NEW.email)
    OR v_profile_role NOT IN ('admin', 'store_owner') THEN
    RAISE EXCEPTION 'An incompatible profile exists for this Auth user';
  END IF;

  SELECT count(*), (pg_catalog.array_agg(s.id))[1]
  INTO v_store_count, v_store_id
  FROM public.stores AS s
  WHERE s.owner_id = NEW.id;

  IF v_store_count > 1 THEN
    RAISE EXCEPTION 'This account owns multiple stores; resolve ownership before signup can continue';
  ELSIF v_store_count = 0 THEN
    IF v_profile_store_id IS NOT NULL THEN
      RAISE EXCEPTION 'The profile references a store it does not own';
    END IF;

    INSERT INTO public.stores (owner_id, store_name, store_phone, store_address)
    VALUES (
      NEW.id,
      COALESCE(
        NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'store_name'), ''),
        v_full_name || '''s Store'
      ),
      NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'store_phone'), ''),
      NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'store_address'), '')
    )
    RETURNING id INTO v_store_id;
  ELSIF v_profile_store_id IS NOT NULL AND v_profile_store_id <> v_store_id THEN
    RAISE EXCEPTION 'The profile is linked to a different store than its owner record';
  END IF;

  UPDATE public.profiles AS p
  SET store_id = v_store_id
  WHERE p.id = NEW.id
    AND p.store_id IS DISTINCT FROM v_store_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_team_members()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  role text,
  status text,
  permissions text[],
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT p.id, p.email, p.full_name, sm.role, sm.status, sm.permissions, sm.created_at
  FROM public.store_memberships AS sm
  JOIN public.profiles AS p ON p.id = sm.user_id
  WHERE sm.store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.is_store_owner())
  ORDER BY sm.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_store_invitations()
RETURNS TABLE (
  invitation_id uuid,
  email text,
  role text,
  permissions text[],
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT i.id, i.email, i.role, i.permissions, i.created_at, i.expires_at
  FROM public.store_invitations AS i
  WHERE i.store_id = (SELECT public.get_my_store_id())
    AND i.consumed_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND (SELECT public.is_store_owner())
  ORDER BY i.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.create_store_invitation(
  target_email text,
  target_role text DEFAULT 'cashier',
  target_permissions text[] DEFAULT ARRAY['pos']::text[]
)
RETURNS TABLE (
  invitation_id uuid,
  invitation_token uuid,
  invitation_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  IF NOT (SELECT public.is_store_owner()) THEN
    RAISE EXCEPTION 'Only the approved store owner can invite cashiers'
      USING ERRCODE = '42501';
  END IF;

  IF target_email IS NULL
    OR pg_catalog.length(pg_catalog.btrim(target_email)) = 0
    OR pg_catalog.strpos(pg_catalog.btrim(target_email), '@') < 2 THEN
    RAISE EXCEPTION 'A valid employee email is required';
  END IF;

  IF target_role IS DISTINCT FROM 'cashier'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.unnest(
        COALESCE(target_permissions, ARRAY[]::text[])
      ) AS requested(permission)
      WHERE requested.permission <> 'pos'
    ) THEN
    RAISE EXCEPTION 'Employee accounts may only receive POS sales access';
  END IF;

  v_store_id := (SELECT public.get_my_store_id());

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE pg_catalog.lower(p.email) = pg_catalog.lower(pg_catalog.btrim(target_email))
  ) THEN
    RAISE EXCEPTION 'This email already has an account';
  END IF;

  UPDATE public.store_invitations AS i
  SET revoked_at = now()
  WHERE i.store_id = v_store_id
    AND pg_catalog.lower(i.email) = pg_catalog.lower(pg_catalog.btrim(target_email))
    AND i.consumed_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at <= now();

  IF EXISTS (
    SELECT 1
    FROM public.store_invitations AS i
    WHERE i.store_id = v_store_id
      AND pg_catalog.lower(i.email) = pg_catalog.lower(pg_catalog.btrim(target_email))
      AND i.consumed_at IS NULL
      AND i.revoked_at IS NULL
      AND i.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'An active invitation already exists for this email';
  END IF;

  RETURN QUERY
  INSERT INTO public.store_invitations (
    store_id, email, role, permissions, created_by
  )
  VALUES (
    v_store_id,
    pg_catalog.lower(pg_catalog.btrim(target_email)),
    'cashier',
    ARRAY['pos']::text[],
    (SELECT auth.uid())
  )
  RETURNING id, token, expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_store_member(
  target_user_id uuid,
  target_status text,
  target_role text DEFAULT 'cashier',
  target_permissions text[] DEFAULT ARRAY['pos']::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  IF NOT (SELECT public.is_store_owner()) THEN
    RAISE EXCEPTION 'Only the approved store owner can manage team accounts'
      USING ERRCODE = '42501';
  END IF;

  IF target_status IS NULL OR target_status NOT IN ('approved', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported membership status';
  END IF;

  IF target_role IS DISTINCT FROM 'cashier'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.unnest(
        COALESCE(target_permissions, ARRAY[]::text[])
      ) AS requested(permission)
      WHERE requested.permission <> 'pos'
    ) THEN
    RAISE EXCEPTION 'Employee accounts may only receive POS sales access';
  END IF;

  v_store_id := (SELECT public.get_my_store_id());

  UPDATE public.store_memberships AS sm
  SET role = 'cashier',
      status = target_status,
      permissions = ARRAY['pos']::text[],
      updated_at = now()
  WHERE sm.store_id = v_store_id
    AND sm.user_id = target_user_id
    AND sm.role = 'cashier';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store membership was not found';
  END IF;

  UPDATE public.profiles AS p
  SET role = 'cashier',
      status = target_status
  WHERE p.id = target_user_id
    AND p.role = 'cashier';
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_store_invitation(target_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF NOT (SELECT public.is_store_owner()) THEN
    RAISE EXCEPTION 'Only the approved store owner can revoke invitations'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.store_invitations
  SET revoked_at = now()
  WHERE id = target_invitation_id
    AND store_id = (SELECT public.get_my_store_id())
    AND consumed_at IS NULL
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active invitation was not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_store_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_store_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_store_permission(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_store_team_members() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_store_invitations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_store_invitation(text, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manage_store_member(uuid, text, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_store_invitation(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_store_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_team_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_invitation(text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_store_member(uuid, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_store_invitation(uuid) TO authenticated;

DO $$
DECLARE
  v_table text;
  v_policy record;
  v_tables text[] := ARRAY[
    'audit_logs', 'bank_accounts', 'bank_transactions', 'barcode_history',
    'brands', 'cash_transactions', 'categories', 'customer_discount_history',
    'customer_discount_offers', 'customer_groups', 'customer_payments',
    'customers', 'discount_offer_usage', 'discount_offers', 'employees',
    'expense_categories', 'expenses', 'held_orders', 'product_variants',
    'products', 'purchase_items', 'purchase_return_items', 'purchase_returns',
    'purchases', 'roles', 'sale_items', 'sale_return_items', 'sale_returns',
    'sales', 'settings', 'stock_adjustments', 'stock_movements',
    'stock_reconciliations', 'supplier_payments', 'suppliers', 'units'
  ];
  v_pos_read_tables text[] := ARRAY[
    'brands', 'categories', 'customer_discount_offers', 'customers',
    'discount_offers', 'held_orders', 'products'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(pg_catalog.format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'Expected business table public.% is missing', v_table;
    END IF;

    FOR v_policy IN
      SELECT policyname
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
    LOOP
      EXECUTE pg_catalog.format(
        'DROP POLICY %I ON public.%I',
        v_policy.policyname,
        v_table
      );
    END LOOP;

    EXECUTE pg_catalog.format(
      'CREATE POLICY store_owner_access ON public.%I FOR ALL TO authenticated '
      'USING ((SELECT public.is_store_owner()) AND store_id = (SELECT public.get_my_store_id())) '
      'WITH CHECK ((SELECT public.is_store_owner()) AND store_id = (SELECT public.get_my_store_id()))',
      v_table
    );

    IF v_table = ANY (v_pos_read_tables) THEN
      EXECUTE pg_catalog.format(
        'CREATE POLICY cashier_pos_read ON public.%I FOR SELECT TO authenticated '
        'USING (store_id = (SELECT public.get_my_store_id()) AND (SELECT public.has_store_permission(''pos'')))',
        v_table
      );
    END IF;
  END LOOP;
END;
$$;

CREATE POLICY cashier_customer_insert
  ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('pos'))
  );

CREATE POLICY cashier_held_orders_manage
  ON public.held_orders
  FOR ALL TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('pos'))
  )
  WITH CHECK (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('pos'))
  );

ALTER FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid)
  RENAME TO complete_pos_sale_internal;
ALTER FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric)
  RENAME TO complete_pos_sale_internal;

CREATE FUNCTION public.complete_pos_sale(
  p_cart jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_discount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_paid_amount numeric DEFAULT 0,
  p_offer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
  v_item jsonb;
  v_product_id uuid;
BEGIN
  IF NOT (SELECT public.has_store_permission('pos')) THEN
    RAISE EXCEPTION 'POS sales permission is required'
      USING ERRCODE = '42501';
  END IF;

  v_store_id := (SELECT public.get_my_store_id());
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'An approved store account is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_cart IS NULL OR pg_catalog.jsonb_typeof(p_cart) <> 'array'
    OR pg_catalog.jsonb_array_length(p_cart) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = p_customer_id AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Customer is not available in this store'
      USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_cart)
  LOOP
    v_product_id := (v_item ->> 'product_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id
        AND store_id = v_store_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Product is not available in this store'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF p_offer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.discount_offers
    WHERE id = p_offer_id AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Offer is not available in this store'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.complete_pos_sale_internal(
    p_cart, p_customer_id, p_discount, p_payment_method, p_paid_amount, p_offer_id
  );
END;
$$;

CREATE FUNCTION public.complete_pos_sale(
  p_cart jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_discount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_paid_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
  v_item jsonb;
  v_product_id uuid;
BEGIN
  IF NOT (SELECT public.has_store_permission('pos')) THEN
    RAISE EXCEPTION 'POS sales permission is required'
      USING ERRCODE = '42501';
  END IF;

  v_store_id := (SELECT public.get_my_store_id());
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'An approved store account is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_cart IS NULL OR pg_catalog.jsonb_typeof(p_cart) <> 'array'
    OR pg_catalog.jsonb_array_length(p_cart) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = p_customer_id AND store_id = v_store_id
  ) THEN
    RAISE EXCEPTION 'Customer is not available in this store'
      USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_cart)
  LOOP
    v_product_id := (v_item ->> 'product_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id
        AND store_id = v_store_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Product is not available in this store'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN public.complete_pos_sale_internal(
    p_cart, p_customer_id, p_discount, p_payment_method, p_paid_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pos_sale_internal(jsonb, uuid, numeric, text, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_pos_sale_internal(jsonb, uuid, numeric, text, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pos_sale(jsonb, uuid, numeric, text, numeric, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
