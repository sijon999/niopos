CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'BDT'
    CHECK (currency ~ '^[A-Z]{3}$'),
  billing_cycle text NOT NULL
    CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  features jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(features) IN ('array', 'object')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status text NOT NULL
    CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'suspended')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  UNIQUE (id, store_id)
);

CREATE UNIQUE INDEX subscriptions_one_current_per_store_idx
  ON public.subscriptions (store_id)
  WHERE status IN ('trial', 'active');
CREATE INDEX subscriptions_store_status_end_idx
  ON public.subscriptions (store_id, status, end_date);
CREATE INDEX subscriptions_plan_id_idx
  ON public.subscriptions (plan_id);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'BDT'
    CHECK (currency ~ '^[A-Z]{3}$'),
  payment_method text NOT NULL CHECK (length(btrim(payment_method)) > 0),
  transaction_id text,
  payment_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_subscription_store_fk
    FOREIGN KEY (subscription_id, store_id)
    REFERENCES public.subscriptions (id, store_id)
    ON DELETE RESTRICT
);

CREATE INDEX payments_store_date_idx
  ON public.payments (store_id, payment_date DESC);
CREATE INDEX payments_subscription_date_idx
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

CREATE TRIGGER plans_set_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_subscription_updated_at();

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_subscription_updated_at();

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.plans, public.subscriptions, public.payments
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscriptions TO authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;

CREATE POLICY plans_read_active_or_admin
  ON public.plans
  FOR SELECT TO authenticated
  USING (status = 'active' OR (SELECT public.is_super_admin()));

CREATE POLICY plans_admin_manage
  ON public.plans
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

CREATE POLICY subscriptions_read_store_or_admin
  ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.has_store_access(store_id))
  );

CREATE POLICY subscriptions_admin_manage
  ON public.subscriptions
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

CREATE POLICY payments_read_store_or_admin
  ON public.payments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.has_store_access(store_id))
  );

CREATE POLICY payments_admin_manage
  ON public.payments
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

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
AS $$
DECLARE
  v_subscription_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an approved Super Admin can manage subscriptions'
      USING ERRCODE = '42501';
  END IF;

  IF target_store_id IS NULL OR target_plan_id IS NULL OR target_status IS NULL THEN
    RAISE EXCEPTION 'Store, plan, and subscription status are required';
  END IF;

  IF target_status NOT IN ('trial', 'active', 'expired', 'cancelled', 'suspended') THEN
    RAISE EXCEPTION 'Unsupported subscription status';
  END IF;

  IF target_start_date IS NULL OR target_end_date IS NULL OR target_end_date < target_start_date THEN
    RAISE EXCEPTION 'A valid subscription date range is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = target_store_id) THEN
    RAISE EXCEPTION 'Store was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.plans
    WHERE id = target_plan_id
      AND (status = 'active' OR target_status IN ('expired', 'cancelled', 'suspended'))
  ) THEN
    RAISE EXCEPTION 'An active plan is required to create or activate a subscription';
  END IF;

  IF target_subscription_id IS NULL AND target_status NOT IN ('trial', 'active') THEN
    RAISE EXCEPTION 'A new subscription must start as trial or active';
  END IF;

  IF target_subscription_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.subscriptions
      WHERE id = target_subscription_id
        AND store_id = target_store_id
    ) THEN
      RAISE EXCEPTION 'Subscription was not found for this store';
    END IF;
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
AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an approved Super Admin can record subscription payments'
      USING ERRCODE = '42501';
  END IF;

  IF target_amount IS NULL OR target_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF target_store_id IS NULL OR target_subscription_id IS NULL OR target_currency IS NULL
    OR target_currency !~ '^[A-Z]{3}$' OR target_payment_method IS NULL
    OR length(btrim(target_payment_method)) = 0 THEN
    RAISE EXCEPTION 'A valid currency and payment method are required';
  END IF;

  IF target_status IS NULL OR target_status NOT IN ('pending', 'paid', 'failed', 'refunded') THEN
    RAISE EXCEPTION 'Unsupported payment status';
  END IF;

  INSERT INTO public.payments (
    store_id, subscription_id, amount, currency, payment_method,
    transaction_id, payment_date, status, notes
  )
  VALUES (
    target_store_id, target_subscription_id, target_amount, target_currency,
    btrim(target_payment_method), NULLIF(btrim(target_transaction_id), ''),
    COALESCE(target_payment_date, now()), target_status, NULLIF(btrim(target_notes), '')
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT public.is_super_admin())
    OR (SELECT public.get_my_store_id()) IS NOT NULL;
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
  ) AS store_access
  WHERE EXISTS (
    SELECT 1
    FROM public.subscriptions AS sub
    WHERE sub.store_id = store_access.store_id
      AND sub.status IN ('trial', 'active')
      AND sub.start_date <= CURRENT_DATE
      AND sub.end_date >= CURRENT_DATE
  );

  IF v_store_count > 1 THEN
    RAISE EXCEPTION 'This account is assigned to multiple subscribed stores'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_store_id;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_store_subscription(uuid, uuid, uuid, text, date, date)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_subscription_payment(uuid, uuid, numeric, text, text, text, timestamptz, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_store_subscription(uuid, uuid, uuid, text, date, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_subscription_payment(uuid, uuid, numeric, text, text, text, timestamptz, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_store_id() TO authenticated;
