ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stores'
      AND column_name IN ('id', 'owner_id', 'store_name', 'store_phone', 'store_address')
    GROUP BY table_name
    HAVING count(*) = 5
  ) THEN
    RAISE EXCEPTION
      'Expected public.stores columns id, owner_id, store_name, store_phone, and store_address';
  END IF;
END;
$$;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BDT',
  ADD COLUMN IF NOT EXISTS currency_symbol text NOT NULL DEFAULT '৳',
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_footer text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE role NOT IN (
      'super_admin', 'admin', 'manager', 'cashier', 'staff', 'user', 'store_owner'
    )
  ) THEN
    RAISE EXCEPTION 'profiles contains a role not covered by the reconciliation constraint';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE status NOT IN ('pending', 'approved', 'rejected', 'suspended')
  ) THEN
    RAISE EXCEPTION 'profiles contains a status not covered by the existing status constraint';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
      AND conname NOT IN ('profiles_role_check', 'profiles_role_reconciled_check')
  ) THEN
    RAISE EXCEPTION 'Unexpected additional role check on public.profiles; inspect it before applying';
  END IF;

  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_reconciled_check;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_reconciled_check
    CHECK (role IN (
      'super_admin', 'admin', 'manager', 'cashier', 'staff', 'user', 'store_owner'
    ));

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_attribute AS a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.profiles'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.stores'::regclass
      AND a.attname = 'store_id'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_store_id_reconciled_fk
      FOREIGN KEY (store_id) REFERENCES public.stores(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'super_admin'
      AND status = 'approved'
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.store_memberships (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager', 'cashier')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS store_memberships_user_status_idx
  ON public.store_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS store_memberships_store_status_idx
  ON public.store_memberships (store_id, status);

CREATE TABLE IF NOT EXISTS public.store_invitations (
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

CREATE UNIQUE INDEX IF NOT EXISTS store_invitations_active_email_idx
  ON public.store_invitations (store_id, lower(email))
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS store_invitations_store_expiry_idx
  ON public.store_invitations (store_id, expires_at);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'BDT' CHECK (currency ~ '^[A-Z]{3}$'),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  features jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(features) IN ('array', 'object')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'suspended')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  UNIQUE (id, store_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current_per_store_idx
  ON public.subscriptions (store_id)
  WHERE status IN ('trial', 'active');
CREATE INDEX IF NOT EXISTS subscriptions_store_status_end_idx
  ON public.subscriptions (store_id, status, end_date);
CREATE INDEX IF NOT EXISTS subscriptions_plan_id_idx
  ON public.subscriptions (plan_id);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'BDT' CHECK (currency ~ '^[A-Z]{3}$'),
  payment_method text NOT NULL CHECK (length(btrim(payment_method)) > 0),
  transaction_id text,
  payment_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_subscription_store_reconciled_fk
    FOREIGN KEY (subscription_id, store_id)
    REFERENCES public.subscriptions (id, store_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS payments_store_date_idx
  ON public.payments (store_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS payments_subscription_date_idx
  ON public.payments (subscription_id, payment_date DESC);

CREATE OR REPLACE FUNCTION public.set_subscription_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_subscription_updated_at() FROM PUBLIC, anon, authenticated;

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

DROP TRIGGER IF EXISTS plans_set_updated_at ON public.plans;
CREATE TRIGGER plans_set_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_subscription_updated_at();
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_subscription_updated_at();
DROP TRIGGER IF EXISTS store_memberships_set_updated_at ON public.store_memberships;
CREATE TRIGGER store_memberships_set_updated_at
  BEFORE UPDATE ON public.store_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_store_membership_updated_at();

CREATE OR REPLACE FUNCTION public.has_store_access(target_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL OR target_store_id IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.stores AS s ON s.owner_id = p.id
    WHERE p.id = v_user_id
      AND p.status = 'approved'
      AND p.role IN ('admin', 'store_owner')
      AND s.id = target_store_id
      AND (p.store_id IS NULL OR p.store_id = s.id)
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.store_memberships AS sm
    JOIN public.profiles AS p ON p.id = sm.user_id
    WHERE sm.store_id = target_store_id
      AND sm.user_id = v_user_id
      AND sm.status = 'approved'
      AND p.status = 'approved'
      AND p.role = sm.role
      AND p.role IN ('manager', 'cashier')
      AND (p.store_id IS NULL OR p.store_id = sm.store_id)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
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
  v_user_id uuid := (SELECT auth.uid());
  v_store_ids uuid[];
BEGIN
  IF v_user_id IS NULL OR public.is_super_admin() THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(DISTINCT candidate.store_id)
  INTO v_store_ids
  FROM (
    SELECT s.id AS store_id
    FROM public.profiles AS p
    JOIN public.stores AS s ON s.owner_id = p.id
    WHERE p.id = v_user_id
      AND p.status = 'approved'
      AND p.role IN ('admin', 'store_owner')
      AND (p.store_id IS NULL OR p.store_id = s.id)

    UNION

    SELECT sm.store_id
    FROM public.profiles AS p
    JOIN public.store_memberships AS sm ON sm.user_id = p.id
    JOIN public.stores AS s ON s.id = sm.store_id
    WHERE p.id = v_user_id
      AND p.status = 'approved'
      AND p.role IN ('manager', 'cashier')
      AND p.role = sm.role
      AND sm.status = 'approved'
      AND (p.store_id IS NULL OR p.store_id = sm.store_id)
  ) AS candidate
  WHERE EXISTS (
    SELECT 1
    FROM public.subscriptions AS sub
    WHERE sub.store_id = candidate.store_id
      AND sub.status IN ('trial', 'active')
      AND sub.start_date <= CURRENT_DATE
      AND sub.end_date >= CURRENT_DATE
  );

  IF cardinality(v_store_ids) > 1 THEN
    RAISE EXCEPTION 'This account has access to multiple subscribed stores'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_store_ids[1];
END;
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT (SELECT public.is_super_admin())
      OR (SELECT public.get_my_store_id()) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.manage_store_subscription(
  target_store_id uuid,
  target_subscription_id uuid,
  target_plan_id uuid,
  target_status text,
  target_start_date date,
  target_end_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_subscription_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an approved Super Admin can manage subscriptions'
      USING ERRCODE = '42501';
  END IF;
  IF target_store_id IS NULL OR target_plan_id IS NULL OR target_status IS NULL
    OR target_status NOT IN ('trial', 'active', 'expired', 'cancelled', 'suspended')
    OR target_start_date IS NULL OR target_end_date IS NULL
    OR target_end_date < target_start_date THEN
    RAISE EXCEPTION 'A store, plan, supported status, and valid date range are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = target_store_id) THEN
    RAISE EXCEPTION 'Store was not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.plans
    WHERE id = target_plan_id
      AND (status = 'active' OR target_status IN ('expired', 'cancelled', 'suspended'))
  ) THEN
    RAISE EXCEPTION 'An active plan is required to create or activate a subscription';
  END IF;
  IF target_subscription_id IS NULL AND target_status NOT IN ('trial', 'active') THEN
    RAISE EXCEPTION 'A new subscription must start as trial or active';
  END IF;
  IF target_subscription_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE id = target_subscription_id AND store_id = target_store_id
  ) THEN
    RAISE EXCEPTION 'Subscription was not found for this store';
  END IF;

  IF target_status IN ('trial', 'active') THEN
    UPDATE public.subscriptions
    SET status = 'expired'
    WHERE store_id = target_store_id
      AND status IN ('trial', 'active')
      AND (target_subscription_id IS NULL OR id <> target_subscription_id);
  END IF;

  IF target_subscription_id IS NULL THEN
    INSERT INTO public.subscriptions (store_id, plan_id, status, start_date, end_date)
    VALUES (target_store_id, target_plan_id, target_status, target_start_date, target_end_date)
    RETURNING id INTO v_subscription_id;
  ELSE
    UPDATE public.subscriptions
    SET plan_id = target_plan_id,
        status = target_status,
        start_date = target_start_date,
        end_date = target_end_date
    WHERE id = target_subscription_id
      AND store_id = target_store_id
    RETURNING id INTO v_subscription_id;
  END IF;
  RETURN v_subscription_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_subscription_payment(
  target_store_id uuid,
  target_subscription_id uuid,
  target_amount numeric,
  target_currency text,
  target_payment_method text,
  target_transaction_id text DEFAULT NULL,
  target_payment_date timestamptz DEFAULT now(),
  target_status text DEFAULT 'paid',
  target_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an approved Super Admin can record subscription payments'
      USING ERRCODE = '42501';
  END IF;
  IF target_amount IS NULL OR target_amount <= 0
    OR target_currency IS NULL OR target_currency !~ '^[A-Z]{3}$'
    OR target_payment_method IS NULL OR length(btrim(target_payment_method)) = 0
    OR target_status IS NULL
    OR target_status NOT IN ('pending', 'paid', 'failed', 'refunded') THEN
    RAISE EXCEPTION 'Valid payment details are required';
  END IF;
  INSERT INTO public.payments (
    store_id, subscription_id, amount, currency, payment_method,
    transaction_id, payment_date, status, notes
  )
  SELECT target_store_id, target_subscription_id, target_amount, target_currency,
    btrim(target_payment_method), NULLIF(btrim(target_transaction_id), ''),
    COALESCE(target_payment_date, now()), target_status, NULLIF(btrim(target_notes), '')
  WHERE EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE id = target_subscription_id AND store_id = target_store_id
  )
  RETURNING id INTO v_payment_id;
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Subscription was not found for this store';
  END IF;
  RETURN v_payment_id;
END;
$$;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND NOT t.tgisinternal
      AND (t.tgtype & 4) = 4
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
      AND NOT t.tgisinternal
      AND (t.tgtype & 4) = 4
      AND t.tgfoid = 'public.handle_new_user_profile()'::regprocedure
  ) THEN
    RAISE EXCEPTION
      'Expected exactly one auth.users INSERT trigger, on_auth_user_created -> public.handle_new_user_profile(); inspect trigger definitions before applying';
  END IF;
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
  v_invitation public.store_invitations%ROWTYPE;
  v_store_name text;
  v_invitation_token uuid;
  v_store_id uuid;
  v_profile_id uuid;
  v_full_name text;
BEGIN
  IF NEW.email IS NULL OR NULLIF(btrim(NEW.email), '') IS NULL THEN
    RAISE EXCEPTION 'A valid email is required to create a profile';
  END IF;

  v_full_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
    NULLIF(split_part(NEW.email, '@', 1), ''),
    'New User'
  );

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

    INSERT INTO public.profiles (id, email, full_name, phone, role, status, store_id)
    VALUES (
      NEW.id, NEW.email, v_full_name,
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), ''),
      v_invitation.role, 'pending', v_invitation.store_id
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_profile_id;

    IF v_profile_id IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.store_memberships (store_id, user_id, role, status, permissions)
    VALUES (
      v_invitation.store_id, NEW.id, v_invitation.role, 'pending', v_invitation.permissions
    )
    ON CONFLICT (store_id, user_id) DO NOTHING;
    RETURN NEW;
  END IF;

  v_store_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'store_name'), ''),
    v_full_name || '''s Store'
  );

  INSERT INTO public.profiles (id, email, full_name, phone, role, status)
  VALUES (
    NEW.id, NEW.email, v_full_name,
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), ''),
    'admin', 'pending'
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_profile_id;

  IF v_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.stores (owner_id, store_name, store_phone, store_address)
  VALUES (
    NEW.id, v_store_name,
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'store_phone'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'store_address'), '')
  )
  RETURNING id INTO v_store_id;

  UPDATE public.profiles SET store_id = v_store_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_store_owner_status(
  target_user_id uuid,
  requested_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_role text;
  v_store_id uuid;
  v_store_count integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an approved Super Admin can change account status'
      USING ERRCODE = '42501';
  END IF;
  IF requested_status IS NULL OR requested_status NOT IN ('approved', 'rejected', 'suspended') THEN
    RAISE EXCEPTION 'Unsupported account status';
  END IF;

  SELECT role, store_id INTO v_role, v_store_id
  FROM public.profiles WHERE id = target_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_role = 'super_admin' THEN
    RAISE EXCEPTION 'Eligible user profile was not found';
  END IF;

  IF v_role IN ('admin', 'store_owner') THEN
    SELECT count(*), (array_agg(id))[1]
    INTO v_store_count, v_store_id
    FROM public.stores
    WHERE owner_id = target_user_id;
    IF v_store_count <> 1 THEN
      RAISE EXCEPTION 'Exactly one existing store must belong to this store owner before approval';
    END IF;
  ELSIF v_role IN ('manager', 'cashier') THEN
    UPDATE public.store_memberships SET status = requested_status WHERE user_id = target_user_id;
  END IF;

  UPDATE public.profiles
  SET status = requested_status,
      store_id = CASE WHEN v_role IN ('admin', 'store_owner') THEN v_store_id ELSE store_id END,
      approved_by = CASE WHEN requested_status = 'approved' THEN (SELECT auth.uid()) ELSE approved_by END,
      approved_at = CASE WHEN requested_status = 'approved' THEN now() ELSE approved_at END,
      rejected_by = CASE
        WHEN requested_status = 'rejected' THEN (SELECT auth.uid())
        WHEN requested_status = 'approved' THEN NULL
        ELSE rejected_by
      END,
      rejected_at = CASE
        WHEN requested_status = 'rejected' THEN now()
        WHEN requested_status = 'approved' THEN NULL
        ELSE rejected_at
      END
  WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_owner_approvals()
RETURNS TABLE (
  id uuid, email text, full_name text, phone text, status text, created_at timestamptz,
  approved_by uuid, approved_at timestamptz, rejected_by uuid, rejected_at timestamptz,
  store_names text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an approved Super Admin can view store-owner approvals'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.phone, p.status, p.created_at,
    p.approved_by, p.approved_at, p.rejected_by, p.rejected_at,
    COALESCE(array_agg(s.store_name ORDER BY s.created_at)
      FILTER (WHERE s.id IS NOT NULL), ARRAY[]::text[])
  FROM public.profiles AS p
  LEFT JOIN public.stores AS s ON s.owner_id = p.id
  WHERE p.role IN ('admin', 'store_owner')
  GROUP BY p.id
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_user_approvals()
RETURNS TABLE (
  id uuid, email text, full_name text, phone text, role text, status text,
  created_at timestamptz, store_names text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an approved Super Admin can view pending user approvals'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.phone, p.role, p.status, p.created_at,
    COALESCE(array_agg(s.store_name ORDER BY s.created_at)
      FILTER (WHERE s.id IS NOT NULL), ARRAY[]::text[])
  FROM public.profiles AS p
  LEFT JOIN public.stores AS s ON s.owner_id = p.id
  WHERE p.status = 'pending'
  GROUP BY p.id
  ORDER BY p.created_at DESC;
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
    WHEN (SELECT public.is_super_admin()) THEN true
    WHEN (SELECT public.get_my_store_id()) IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM public.profiles AS p
      JOIN public.stores AS s ON s.owner_id = p.id
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'approved'
        AND p.role IN ('admin', 'store_owner')
        AND s.id = (SELECT public.get_my_store_id())
        AND (p.store_id IS NULL OR p.store_id = s.id)
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
          OR (sm.role = 'cashier' AND requested_permission = 'reports'
            AND requested_permission = ANY (sm.permissions))
          OR (sm.role = 'manager' AND requested_permission = ANY (ARRAY[
            'pos', 'products', 'sales', 'purchases', 'customers', 'reports', 'inventory'
          ]::text[]))
          OR (sm.role = 'manager' AND requested_permission = 'employees'
            AND requested_permission = ANY (sm.permissions))
        )
    ) THEN true
    ELSE false
  END;
$$;

  ALTER TABLE public.store_memberships ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.store_memberships FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.store_memberships FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON TABLE public.store_memberships TO authenticated;

  DROP POLICY IF EXISTS "Stores are viewable by their owner or super admin" ON public.stores;
  CREATE POLICY "Stores are viewable by their owner or super admin"
    ON public.stores
    FOR SELECT TO authenticated
    USING (
      owner_id = (SELECT auth.uid())
      OR (SELECT public.is_super_admin())
    );

  DROP POLICY IF EXISTS "Stores can be inserted by their owner" ON public.stores;
  CREATE POLICY "Stores can be inserted by their owner"
    ON public.stores
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = (SELECT auth.uid()));

  DROP POLICY IF EXISTS "Stores can be managed by their owner or super admin" ON public.stores;
  CREATE POLICY "Stores can be managed by their owner or super admin"
    ON public.stores
    FOR UPDATE TO authenticated
    USING (
      owner_id = (SELECT auth.uid())
      OR (SELECT public.is_super_admin())
    )
    WITH CHECK (
      owner_id = (SELECT auth.uid())
      OR (SELECT public.is_super_admin())
    );

  DROP POLICY IF EXISTS memberships_select_self_or_employee_managers ON public.store_memberships;
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

  DROP POLICY IF EXISTS store_invitations_read_employees ON public.store_invitations;
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

  ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plans, public.subscriptions, public.payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans, public.subscriptions TO authenticated;
GRANT SELECT ON public.payments TO authenticated;

DROP POLICY IF EXISTS plans_read_active_or_admin ON public.plans;
DROP POLICY IF EXISTS plans_admin_manage ON public.plans;
CREATE POLICY plans_read_active_or_admin ON public.plans
  FOR SELECT TO authenticated
  USING (status = 'active' OR (SELECT public.is_super_admin()));
CREATE POLICY plans_admin_manage ON public.plans
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS subscriptions_read_store_or_admin ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_read_owner_or_admin ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_admin_manage ON public.subscriptions;
CREATE POLICY subscriptions_read_owner_or_admin ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      store_id = (SELECT public.get_my_store_id())
      AND (SELECT public.has_store_permission('billing'))
    )
  );
CREATE POLICY subscriptions_admin_manage ON public.subscriptions
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS payments_read_store_or_admin ON public.payments;
DROP POLICY IF EXISTS payments_read_owner_or_admin ON public.payments;
DROP POLICY IF EXISTS payments_admin_manage ON public.payments;
CREATE POLICY payments_read_owner_or_admin ON public.payments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      store_id = (SELECT public.get_my_store_id())
      AND (SELECT public.has_store_permission('billing'))
    )
  );
CREATE POLICY payments_admin_manage ON public.payments
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

REVOKE ALL ON FUNCTION public.has_store_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_store_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_subscription() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manage_store_subscription(uuid, uuid, uuid, text, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_subscription_payment(uuid, uuid, numeric, text, text, text, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_store_owner_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_store_owner_approvals() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_pending_user_approvals() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_store_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_store_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_store_subscription(uuid, uuid, uuid, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_subscription_payment(uuid, uuid, numeric, text, text, text, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_store_owner_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_owner_approvals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_user_approvals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_permission(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
