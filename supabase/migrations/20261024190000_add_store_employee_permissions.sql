ALTER TABLE public.store_memberships
  ADD COLUMN permissions text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE TABLE public.store_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'cashier')),
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
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

CREATE OR REPLACE FUNCTION public.has_store_permission(requested_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN requested_permission IS NULL OR requested_permission = '' THEN false
    WHEN (SELECT public.is_super_admin()) THEN true
    WHEN (SELECT public.get_my_store_id()) IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM public.stores AS s
      JOIN public.profiles AS p ON p.id = s.owner_id
      WHERE s.id = (SELECT public.get_my_store_id())
        AND s.owner_id = (SELECT auth.uid())
        AND s.status = 'approved'
        AND p.status = 'approved'
        AND p.role = 'store_owner'
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM public.store_memberships AS sm
      JOIN public.profiles AS p ON p.id = sm.user_id
      WHERE sm.store_id = (SELECT public.get_my_store_id())
        AND sm.user_id = (SELECT auth.uid())
        AND sm.status = 'approved'
        AND p.status = 'approved'
        AND p.role = sm.role
        AND (
          (sm.role = 'cashier' AND requested_permission IN ('pos', 'customers', 'sales'))
          OR (
            sm.role = 'cashier'
            AND requested_permission = 'reports'
            AND requested_permission = ANY (sm.permissions)
          )
          OR (
            sm.role = 'manager'
            AND (
              requested_permission = ANY (ARRAY[
                'pos', 'products', 'sales', 'purchases', 'customers', 'reports', 'inventory'
              ])
              OR (
                requested_permission = 'employees'
                AND requested_permission = ANY (sm.permissions)
              )
            )
          )
        )
    ) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (SELECT public.is_super_admin()) THEN ARRAY['*']::text[]
    WHEN public.has_store_permission('settings') THEN ARRAY[
      'pos', 'products', 'sales', 'purchases', 'customers', 'reports',
      'inventory', 'employees', 'expenses', 'settings', 'billing',
      'user_management', 'financials'
    ]::text[]
    WHEN EXISTS (
      SELECT 1
      FROM public.store_memberships AS sm
      WHERE sm.store_id = (SELECT public.get_my_store_id())
        AND sm.user_id = (SELECT auth.uid())
        AND sm.role = 'cashier'
        AND sm.status = 'approved'
    ) THEN ARRAY['pos', 'customers', 'sales']::text[] || CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.store_memberships AS sm
        WHERE sm.store_id = (SELECT public.get_my_store_id())
          AND sm.user_id = (SELECT auth.uid())
          AND sm.role = 'cashier'
          AND sm.status = 'approved'
          AND 'reports' = ANY (sm.permissions)
      ) THEN ARRAY['reports']::text[]
      ELSE ARRAY[]::text[]
    END
    WHEN EXISTS (
      SELECT 1
      FROM public.store_memberships AS sm
      WHERE sm.store_id = (SELECT public.get_my_store_id())
        AND sm.user_id = (SELECT auth.uid())
        AND sm.role = 'manager'
        AND sm.status = 'approved'
    ) THEN ARRAY[
      'pos', 'products', 'sales', 'purchases', 'customers', 'reports', 'inventory'
    ]::text[] || CASE WHEN EXISTS (
      SELECT 1
      FROM public.store_memberships AS sm
      WHERE sm.store_id = (SELECT public.get_my_store_id())
        AND sm.user_id = (SELECT auth.uid())
        AND sm.role = 'manager'
        AND sm.status = 'approved'
        AND 'employees' = ANY (sm.permissions)
    ) THEN ARRAY['employees']::text[]
      ELSE ARRAY[]::text[]
    END
    ELSE ARRAY[]::text[]
  END;
$$;

REVOKE ALL ON FUNCTION public.has_store_permission(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_store_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_store_invitation(
  target_email text,
  target_role text,
  target_permissions text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE (invitation_id uuid, invitation_token uuid, invitation_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id uuid;
  v_permissions text[];
  v_is_owner boolean;
BEGIN
  IF NOT public.has_store_permission('employees') THEN
    RAISE EXCEPTION 'Employee-management permission is required'
      USING ERRCODE = '42501';
  END IF;

  IF target_email IS NULL OR length(btrim(target_email)) = 0
    OR position('@' IN btrim(target_email)) < 2 THEN
    RAISE EXCEPTION 'A valid employee email is required';
  END IF;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'An employee role is required';
  END IF;

  IF target_role NOT IN ('manager', 'cashier') THEN
    RAISE EXCEPTION 'Only manager and cashier roles can be invited';
  END IF;

  v_store_id := public.get_my_store_id();
  SELECT EXISTS (
    SELECT 1
    FROM public.stores AS s
    WHERE s.id = v_store_id
      AND s.owner_id = (SELECT auth.uid())
  ) INTO v_is_owner;

  IF target_role = 'manager' THEN
    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'Only the Store Owner can invite managers'
        USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(COALESCE(target_permissions, ARRAY[]::text[])) AS permission
      WHERE permission <> 'employees'
    ) THEN
      RAISE EXCEPTION 'One or more requested manager permissions are not allowed';
    END IF;
    v_permissions := ARRAY(
      SELECT DISTINCT permission
      FROM unnest(COALESCE(target_permissions, ARRAY[]::text[])) AS permission
      ORDER BY permission
    );
  ELSE
    IF EXISTS (
      SELECT 1
      FROM unnest(COALESCE(target_permissions, ARRAY[]::text[])) AS permission
      WHERE permission <> 'reports'
    ) THEN
      RAISE EXCEPTION 'Cashiers may only receive the optional reports permission';
    END IF;
    v_permissions := ARRAY['pos', 'customers', 'sales']::text[] || CASE
      WHEN 'reports' = ANY (COALESCE(target_permissions, ARRAY[]::text[]))
        THEN ARRAY['reports']::text[]
      ELSE ARRAY[]::text[]
    END;
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'An approved store with an active subscription is required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.store_invitations
  SET revoked_at = now()
  WHERE store_id = v_store_id
    AND lower(email) = lower(btrim(target_email))
    AND consumed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at <= now();

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.store_memberships AS sm ON sm.user_id = p.id
    WHERE lower(p.email) = lower(btrim(target_email))
      AND sm.store_id = v_store_id
      AND sm.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'This user already has an active membership in this store';
  END IF;

  RETURN QUERY
  INSERT INTO public.store_invitations (
    store_id, email, role, permissions, created_by
  )
  VALUES (
    v_store_id, lower(btrim(target_email)), target_role, v_permissions, (SELECT auth.uid())
  )
  RETURNING id, token, expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_profile_for_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation public.store_invitations%ROWTYPE;
  v_store_name text;
  v_invitation_token uuid;
BEGIN
  IF NULLIF(NEW.raw_user_meta_data ->> 'employee_invite_token', '') IS NOT NULL THEN
    BEGIN
      v_invitation_token := (NEW.raw_user_meta_data ->> 'employee_invite_token')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Employee invitation is invalid';
    END;

    UPDATE public.store_invitations
    SET consumed_at = now()
    WHERE token = v_invitation_token
      AND lower(email) = lower(NEW.email)
      AND consumed_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
    RETURNING * INTO v_invitation;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Employee invitation is invalid, expired, or already used';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, phone, role, status)
    VALUES (
      NEW.id,
      NEW.email,
      NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'phone'), ''),
      v_invitation.role,
      'approved'
    );

    INSERT INTO public.store_memberships (store_id, user_id, role, status, permissions)
    VALUES (
      v_invitation.store_id,
      NEW.id,
      v_invitation.role,
      'approved',
      v_invitation.permissions
    );

    RETURN NEW;
  END IF;

  v_store_name := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'store_name'), '');
  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'A store name is required to register an account';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'phone'), ''),
    'store_owner',
    'pending'
  );

  INSERT INTO public.stores (owner_id, name, phone, email, address, status)
  VALUES (
    NEW.id,
    v_store_name,
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'store_phone'), ''),
    NEW.email,
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'store_address'), ''),
    'pending'
  );

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
AS $$
  SELECT p.id, p.email, p.full_name, sm.role, sm.status, sm.permissions, sm.created_at
  FROM public.store_memberships AS sm
  JOIN public.profiles AS p ON p.id = sm.user_id
  WHERE sm.store_id = (SELECT public.get_my_store_id())
    AND public.has_store_permission('employees')
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
AS $$
  SELECT i.id, i.email, i.role, i.permissions, i.created_at, i.expires_at
  FROM public.store_invitations AS i
  WHERE i.store_id = (SELECT public.get_my_store_id())
    AND i.consumed_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
    AND public.has_store_permission('employees')
  ORDER BY i.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.manage_store_member(
  target_user_id uuid,
  target_status text,
  target_role text DEFAULT NULL,
  target_permissions text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id uuid;
  v_target_role text;
  v_permissions text[];
  v_is_owner boolean;
BEGIN
  IF NOT public.has_store_permission('employees') THEN
    RAISE EXCEPTION 'Employee-management permission is required'
      USING ERRCODE = '42501';
  END IF;

  IF target_status IS NULL OR target_status NOT IN ('approved', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported membership status';
  END IF;

  v_store_id := public.get_my_store_id();
  SELECT EXISTS (
    SELECT 1
    FROM public.stores AS s
    WHERE s.id = v_store_id
      AND s.owner_id = (SELECT auth.uid())
  ) INTO v_is_owner;

  SELECT role, permissions
  INTO v_target_role, v_permissions
  FROM public.store_memberships
  WHERE store_id = v_store_id
    AND user_id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store membership was not found';
  END IF;

  IF NOT v_is_owner AND (v_target_role <> 'cashier' OR target_role IS NOT NULL OR target_permissions IS NOT NULL) THEN
    RAISE EXCEPTION 'Managers may only change cashier membership status'
      USING ERRCODE = '42501';
  END IF;

  IF v_is_owner AND target_role IS NOT NULL THEN
    IF target_role NOT IN ('manager', 'cashier') THEN
      RAISE EXCEPTION 'Only manager and cashier roles can be assigned';
    END IF;
    v_target_role := target_role;
  END IF;

  IF v_is_owner AND target_permissions IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(target_permissions) AS permission
      WHERE permission <> 'employees'
    ) THEN
      RAISE EXCEPTION 'One or more requested permissions are not allowed';
    END IF;
    IF v_target_role = 'cashier' AND EXISTS (
      SELECT 1
      FROM unnest(target_permissions) AS permission
      WHERE permission <> 'reports'
    ) THEN
      RAISE EXCEPTION 'Cashiers may only receive the optional reports permission';
    END IF;
    v_permissions := CASE
      WHEN v_target_role = 'manager' THEN target_permissions
      ELSE ARRAY['pos', 'customers', 'sales']::text[] || CASE
        WHEN 'reports' = ANY (target_permissions) THEN ARRAY['reports']::text[]
        ELSE ARRAY[]::text[]
      END
    END;
  ELSIF v_target_role = 'cashier' THEN
    v_permissions := ARRAY['pos', 'customers', 'sales']::text[] || CASE
      WHEN 'reports' = ANY (COALESCE(v_permissions, ARRAY[]::text[]))
        THEN ARRAY['reports']::text[]
      ELSE ARRAY[]::text[]
    END;
  END IF;

  UPDATE public.store_memberships
  SET role = v_target_role,
      permissions = COALESCE(v_permissions, ARRAY[]::text[]),
      status = target_status
  WHERE store_id = v_store_id
    AND user_id = target_user_id;

  UPDATE public.profiles
  SET role = v_target_role,
      status = CASE WHEN target_status = 'approved' THEN 'approved' ELSE target_status END
  WHERE id = target_user_id
    AND role IN ('manager', 'cashier');
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_store_invitation(target_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_store_permission('employees') THEN
    RAISE EXCEPTION 'Employee-management permission is required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.store_invitations
  SET revoked_at = now()
  WHERE id = target_invitation_id
    AND store_id = public.get_my_store_id()
    AND consumed_at IS NULL
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active invitation was not found';
  END IF;
END;
$$;

ALTER TABLE public.store_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_memberships FORCE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.store_memberships FROM authenticated;
GRANT SELECT ON TABLE public.store_memberships TO authenticated;

DROP POLICY IF EXISTS memberships_select_own_store ON public.store_memberships;
DROP POLICY IF EXISTS memberships_insert_super_admin ON public.store_memberships;
DROP POLICY IF EXISTS memberships_update_super_admin ON public.store_memberships;
DROP POLICY IF EXISTS memberships_delete_super_admin ON public.store_memberships;

CREATE POLICY memberships_select_self_or_employee_managers
  ON public.store_memberships
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR user_id = (SELECT auth.uid())
    OR (
      store_id = (SELECT public.get_my_store_id())
      AND (SELECT public.has_store_permission('employees'))
    )
  );

ALTER TABLE public.store_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_invitations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_invitations FROM PUBLIC, anon, authenticated;

CREATE POLICY store_invitations_read_employees
  ON public.store_invitations
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      store_id = (SELECT public.get_my_store_id())
      AND (SELECT public.has_store_permission('employees'))
    )
  );

DO $$
DECLARE
  v_rule record;
  v_read_expression text;
  v_update_expression text;
BEGIN
  FOR v_rule IN
    SELECT *
    FROM (VALUES
      ('categories', 'products', 'products OR pos', 'products'),
      ('brands', 'products', 'products OR pos', 'products'),
      ('products', 'products', 'products OR pos', 'products OR pos'),
      ('units', 'inventory', 'inventory OR pos', 'inventory'),
      ('product_variants', 'inventory', 'inventory OR pos', 'inventory'),
      ('sales', 'sales', 'sales', 'sales'),
      ('sale_items', 'sales', 'sales', 'sales'),
      ('sale_returns', 'sales', 'sales', 'sales'),
      ('sale_return_items', 'sales', 'sales', 'sales'),
      ('discount_offer_usage', 'sales', 'sales', 'sales'),
      ('customer_discount_history', 'sales', 'sales', 'sales'),
      ('purchases', 'purchases', 'purchases', 'purchases'),
      ('purchase_items', 'purchases', 'purchases', 'purchases'),
      ('purchase_returns', 'purchases', 'purchases', 'purchases'),
      ('purchase_return_items', 'purchases', 'purchases', 'purchases'),
      ('supplier_payments', 'purchases', 'purchases', 'purchases'),
      ('suppliers', 'purchases', 'purchases', 'purchases'),
      ('customers', 'customers', 'customers', 'customers'),
      ('customer_groups', 'customers', 'customers', 'customers'),
      ('customer_payments', 'customers', 'customers', 'customers'),
      ('customer_discount_offers', 'customers', 'customers', 'customers'),
      ('employees', 'employees', 'employees', 'employees'),
      ('stock_movements', 'inventory', 'inventory', 'inventory OR pos'),
      ('barcode_history', 'inventory', 'inventory', 'inventory'),
      ('stock_reconciliations', 'inventory', 'inventory', 'inventory'),
      ('stock_adjustments', 'inventory', 'inventory', 'inventory'),
      ('expenses', 'expenses', 'expenses OR reports', 'expenses'),
      ('expense_categories', 'expenses', 'expenses OR reports', 'expenses'),
      ('settings', 'settings', 'settings', 'settings'),
      ('bank_accounts', 'financials', 'financials', 'financials'),
      ('bank_transactions', 'financials', 'financials', 'financials'),
      ('cash_transactions', 'financials', 'financials', 'financials'),
      ('held_orders', 'pos', 'pos', 'pos'),
      ('discount_offers', 'products', 'products OR pos', 'products OR pos'),
      ('users', 'user_management', 'user_management', 'user_management'),
      ('roles', 'user_management', 'user_management', 'user_management')
    ) AS rules(table_name, write_permission, read_permissions, update_permissions)
  LOOP
    SELECT string_agg(
      format('(SELECT public.has_store_permission(%L))', permission_name),
      ' OR '
    )
    INTO v_read_expression
    FROM unnest(string_to_array(v_rule.read_permissions, ' OR ')) AS permissions(permission_name);

    SELECT string_agg(
      format('(SELECT public.has_store_permission(%L))', permission_name),
      ' OR '
    )
    INTO v_update_expression
    FROM unnest(string_to_array(v_rule.update_permissions, ' OR ')) AS permissions(permission_name);

    EXECUTE format('DROP POLICY IF EXISTS role_permission_select ON public.%I', v_rule.table_name);
    EXECUTE format('DROP POLICY IF EXISTS role_permission_insert ON public.%I', v_rule.table_name);
    EXECUTE format('DROP POLICY IF EXISTS role_permission_update ON public.%I', v_rule.table_name);
    EXECUTE format('DROP POLICY IF EXISTS role_permission_delete ON public.%I', v_rule.table_name);

    EXECUTE format(
      'CREATE POLICY role_permission_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT public.is_super_admin()) OR (%s))',
      v_rule.table_name,
      v_read_expression
    );
    EXECUTE format(
      'CREATE POLICY role_permission_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_super_admin()) OR (%s))',
      v_rule.table_name,
      CASE
        WHEN v_rule.table_name = 'stock_movements' THEN
          '(SELECT public.has_store_permission(''inventory'')) OR (SELECT public.has_store_permission(''pos''))'
        ELSE format('(SELECT public.has_store_permission(%L))', v_rule.write_permission)
      END
    );
    EXECUTE format(
      'CREATE POLICY role_permission_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.is_super_admin()) OR (%s)) WITH CHECK ((SELECT public.is_super_admin()) OR (%s))',
      v_rule.table_name,
      v_update_expression,
      v_update_expression
    );
    EXECUTE format(
      'CREATE POLICY role_permission_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.is_super_admin()) OR (SELECT public.has_store_permission(%L)))',
      v_rule.table_name,
      v_rule.write_permission
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_pos_product_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.has_store_permission('products') THEN
    RETURN NEW;
  END IF;

  IF public.has_store_permission('pos')
    AND (to_jsonb(NEW) - 'stock' - 'updated_at')
      IS NOT DISTINCT FROM (to_jsonb(OLD) - 'stock' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Product-management permission is required for product changes'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_pos_product_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER products_enforce_pos_update
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pos_product_update();

CREATE OR REPLACE FUNCTION public.enforce_pos_discount_offer_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.has_store_permission('products') THEN
    RETURN NEW;
  END IF;

  IF public.has_store_permission('pos')
    AND (to_jsonb(NEW) - 'usage_count' - 'updated_at')
      IS NOT DISTINCT FROM (to_jsonb(OLD) - 'usage_count' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Product-management permission is required to edit offers'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_pos_discount_offer_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER discount_offers_enforce_pos_update
  BEFORE UPDATE ON public.discount_offers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pos_discount_offer_update();

DROP POLICY IF EXISTS subscriptions_read_store_or_admin ON public.subscriptions;
CREATE POLICY subscriptions_read_owner_or_admin
  ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      store_id = (SELECT public.get_my_store_id())
      AND (SELECT public.has_store_permission('billing'))
    )
  );

DROP POLICY IF EXISTS payments_read_store_or_admin ON public.payments;
CREATE POLICY payments_read_owner_or_admin
  ON public.payments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      store_id = (SELECT public.get_my_store_id())
      AND (SELECT public.has_store_permission('billing'))
    )
  );

DROP POLICY IF EXISTS tenant_role_gate_product_images_select ON storage.objects;
DROP POLICY IF EXISTS tenant_role_gate_product_images_insert ON storage.objects;
DROP POLICY IF EXISTS tenant_role_gate_product_images_update ON storage.objects;
DROP POLICY IF EXISTS tenant_role_gate_product_images_delete ON storage.objects;

CREATE POLICY tenant_role_gate_product_images_select
  ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id <> 'product-images'
    OR (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('products'))
    OR (SELECT public.has_store_permission('pos'))
  );

CREATE POLICY tenant_role_gate_product_images_insert
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'product-images'
    OR (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('products'))
  );

CREATE POLICY tenant_role_gate_product_images_update
  ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    bucket_id <> 'product-images'
    OR (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('products'))
  )
  WITH CHECK (
    bucket_id <> 'product-images'
    OR (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('products'))
  );

CREATE POLICY tenant_role_gate_product_images_delete
  ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id <> 'product-images'
    OR (SELECT public.is_super_admin())
    OR (SELECT public.has_store_permission('products'))
  );

REVOKE ALL ON FUNCTION public.create_store_invitation(text, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_store_team_members() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_store_invitations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manage_store_member(uuid, text, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_store_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_invitation(text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_team_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_store_member(uuid, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_store_invitation(uuid) TO authenticated;
