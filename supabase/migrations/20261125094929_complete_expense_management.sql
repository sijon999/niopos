CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#64748b',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_store_name_key
  ON public.expense_categories (store_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_id_store_id_key
  ON public.expense_categories (id, store_id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_id_store_id_key
  ON public.bank_accounts (id, store_id);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS payee text,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(14, 2)
    GENERATED ALWAYS AS (amount + tax_amount - discount_amount) STORED,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS account text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.expenses
SET title = COALESCE(NULLIF(btrim(description), ''), 'Expense'),
    due_date = COALESCE(due_date, date)
WHERE title IS NULL OR due_date IS NULL;

ALTER TABLE public.expenses
  ALTER COLUMN title SET DEFAULT 'Expense',
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN due_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN due_date SET NOT NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_category_id_fkey;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_category_store_fkey
  FOREIGN KEY (category_id, store_id)
  REFERENCES public.expense_categories (id, store_id)
  ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_nonnegative_amounts_check
  CHECK (
    amount >= 0
    AND tax_amount >= 0
    AND discount_amount >= 0
    AND amount + tax_amount - discount_amount >= 0
    AND paid_amount >= 0
    AND paid_amount <= amount + tax_amount - discount_amount
  ) NOT VALID;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_payment_status_check
  CHECK (payment_status IN ('paid', 'unpaid', 'partially_paid', 'overdue', 'cancelled'))
  NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_id_store_id_key
  ON public.expenses (id, store_id);
CREATE INDEX IF NOT EXISTS expenses_store_date_idx
  ON public.expenses (store_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_store_status_due_idx
  ON public.expenses (store_id, payment_status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_store_category_idx
  ON public.expenses (store_id, category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_store_reference_idx
  ON public.expenses (store_id, reference_number);

CREATE TABLE public.expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  expense_id uuid NOT NULL,
  bank_account_id uuid,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (
    payment_method IN ('cash', 'card', 'bank_transfer', 'mobile_banking', 'other')
  ),
  transaction_reference text,
  account text,
  notes text,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_payments_expense_store_fkey
    FOREIGN KEY (expense_id, store_id)
    REFERENCES public.expenses(id, store_id) ON DELETE RESTRICT,
  CONSTRAINT expense_payments_account_store_fkey
    FOREIGN KEY (bank_account_id, store_id)
    REFERENCES public.bank_accounts(id, store_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX expense_payments_id_store_id_key
  ON public.expense_payments (id, store_id);
CREATE INDEX expense_payments_store_expense_date_idx
  ON public.expense_payments (store_id, expense_id, payment_date DESC);
CREATE INDEX expense_payments_store_method_idx
  ON public.expense_payments (store_id, payment_method, payment_date DESC);

ALTER TABLE public.bank_transactions
  ADD COLUMN expense_payment_id uuid;
ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_expense_payment_fkey
  FOREIGN KEY (expense_payment_id, store_id)
  REFERENCES public.expense_payments(id, store_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX bank_transactions_expense_payment_key
  ON public.bank_transactions (expense_payment_id)
  WHERE expense_payment_id IS NOT NULL;
ALTER TABLE public.cash_transactions
  ADD COLUMN expense_payment_id uuid;
ALTER TABLE public.cash_transactions
  ADD CONSTRAINT cash_transactions_expense_payment_fkey
  FOREIGN KEY (expense_payment_id, store_id)
  REFERENCES public.expense_payments(id, store_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX cash_transactions_expense_payment_key
  ON public.cash_transactions (expense_payment_id)
  WHERE expense_payment_id IS NOT NULL;

CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  category_id uuid,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text,
  payee text,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  tax_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  payment_method text CHECK (
    payment_method IS NULL OR payment_method IN ('cash', 'card', 'bank_transfer', 'mobile_banking', 'other')
  ),
  interval text NOT NULL CHECK (interval IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  start_date date NOT NULL,
  next_due_date date NOT NULL,
  end_date date,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_expenses_dates_check CHECK (
    next_due_date >= start_date AND (end_date IS NULL OR end_date >= start_date)
  ),
  CONSTRAINT recurring_expenses_total_check CHECK (amount + tax_amount - discount_amount >= 0),
  CONSTRAINT recurring_expenses_category_store_fkey
    FOREIGN KEY (category_id, store_id)
    REFERENCES public.expense_categories(id, store_id) ON DELETE RESTRICT
);
CREATE INDEX recurring_expenses_due_idx
  ON public.recurring_expenses (next_due_date) WHERE is_enabled;
CREATE INDEX recurring_expenses_store_idx
  ON public.recurring_expenses (store_id, is_enabled, next_due_date);

ALTER TABLE public.expenses
  ADD COLUMN recurring_expense_id uuid
    REFERENCES public.recurring_expenses(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX expenses_recurring_occurrence_key
  ON public.expenses (recurring_expense_id, date)
  WHERE recurring_expense_id IS NOT NULL;

CREATE TABLE public.expense_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  expense_id uuid NOT NULL,
  object_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_attachments_expense_store_fkey
    FOREIGN KEY (expense_id, store_id)
    REFERENCES public.expenses(id, store_id) ON DELETE RESTRICT
);
CREATE INDEX expense_attachments_store_expense_idx
  ON public.expense_attachments (store_id, expense_id);

CREATE TABLE public.expense_audit_logs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  expense_id uuid,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'payment_recorded')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_audit_logs_expense_store_fkey
    FOREIGN KEY (expense_id, store_id)
    REFERENCES public.expenses(id, store_id) ON DELETE RESTRICT
);
CREATE INDEX expense_audit_logs_store_expense_time_idx
  ON public.expense_audit_logs (store_id, expense_id, created_at DESC);

ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY expense_payments_read ON public.expense_payments
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('expenses.view'))
  );
CREATE POLICY expense_payments_add ON public.expense_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('expenses.edit'))
  );

CREATE POLICY recurring_expenses_read ON public.recurring_expenses
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('expenses.view'))
  );
CREATE POLICY recurring_expenses_add ON public.recurring_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('expenses.create'))
  );
CREATE POLICY recurring_expenses_edit ON public.recurring_expenses
  FOR UPDATE TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('expenses.edit'))
  )
  WITH CHECK (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('expenses.edit'))
  );

CREATE POLICY expense_attachments_read ON public.expense_attachments
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('expenses.view'))
  );
CREATE POLICY expense_attachments_add ON public.expense_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('expenses.create'))
      OR (SELECT public.has_store_permission('expenses.edit'))
    )
  );
CREATE POLICY expense_attachments_delete ON public.expense_attachments
  FOR DELETE TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('expenses.edit'))
  );

CREATE POLICY expense_audit_logs_read ON public.expense_audit_logs
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (SELECT public.has_store_permission('expenses.view'))
  );

REVOKE ALL ON public.expense_payments, public.recurring_expenses,
  public.expense_attachments, public.expense_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.expense_payments TO authenticated;
GRANT SELECT ON public.recurring_expenses TO authenticated;
GRANT INSERT (
  category_id, title, description, payee, amount, tax_amount, discount_amount,
  payment_method, interval, start_date, next_due_date, end_date, is_enabled
) ON public.recurring_expenses TO authenticated;
GRANT UPDATE (
  category_id, title, description, payee, amount, tax_amount, discount_amount,
  payment_method, interval, start_date, next_due_date, end_date, is_enabled
) ON public.recurring_expenses TO authenticated;
GRANT SELECT ON public.expense_attachments TO authenticated;
GRANT INSERT (expense_id, object_path, file_name, mime_type, file_size)
  ON public.expense_attachments TO authenticated;
GRANT DELETE ON public.expense_attachments TO authenticated;
GRANT SELECT ON public.expense_audit_logs TO authenticated;

REVOKE INSERT, UPDATE ON public.expenses FROM authenticated;
GRANT INSERT (
  id, category_id, description, amount, date, title, reference_number, invoice_number,
  payee, tax_amount, discount_amount, payment_method, account, due_date, notes
) ON public.expenses TO authenticated;
GRANT UPDATE (
  category_id, description, amount, date, title, reference_number, invoice_number,
  payee, tax_amount, discount_amount, payment_method, payment_status, account, due_date, notes,
  deleted_at
) ON public.expenses TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_expense_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_store_id uuid;
  v_total numeric(14, 2);
  v_paid numeric(14, 2);
  v_status text;
  v_account_label text;
BEGIN
  v_store_id := public.get_my_store_id();
  IF auth.uid() IS NULL OR v_store_id IS NULL
     OR NOT public.has_store_permission('expenses.edit') THEN
    RAISE EXCEPTION 'You are not allowed to record expense payments'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.store_id IS NOT NULL AND NEW.store_id <> v_store_id THEN
    RAISE EXCEPTION 'A payment cannot be assigned to another store'
      USING ERRCODE = '42501';
  END IF;
  NEW.store_id := v_store_id;
  NEW.recorded_by := auth.uid();

  SELECT e.total_amount, e.payment_status
  INTO v_total, v_status
  FROM public.expenses AS e
  WHERE e.id = NEW.expense_id AND e.store_id = v_store_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense was not found in this store'
      USING ERRCODE = '42501';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Payments cannot be added to a cancelled expense';
  END IF;
  IF NEW.payment_method = 'bank_transfer' AND NEW.bank_account_id IS NULL THEN
    RAISE EXCEPTION 'Choose a bank account for a bank transfer';
  END IF;
  IF NEW.bank_account_id IS NOT NULL THEN
    SELECT concat_ws(' · ', a.bank_name, a.account_number)
    INTO v_account_label
    FROM public.bank_accounts AS a
    WHERE a.id = NEW.bank_account_id
      AND a.store_id = v_store_id
      AND a.status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected bank account is not active in this store'
        USING ERRCODE = '42501';
    END IF;
    NEW.account := COALESCE(NEW.account, v_account_label);
  END IF;
  SELECT COALESCE(sum(p.amount), 0)
  INTO v_paid
  FROM public.expense_payments AS p
  WHERE p.expense_id = NEW.expense_id AND p.store_id = v_store_id;
  IF v_paid + NEW.amount > v_total THEN
    RAISE EXCEPTION 'Payment exceeds the remaining expense balance';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_expense_payment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_expense_payment_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_expense_id uuid := NEW.expense_id;
  v_store_id uuid := NEW.store_id;
  v_paid numeric(14, 2);
  v_total numeric(14, 2);
  v_due_date date;
BEGIN
  SELECT COALESCE(sum(p.amount), 0)
  INTO v_paid
  FROM public.expense_payments AS p
  WHERE p.expense_id = v_expense_id AND p.store_id = v_store_id;
  SELECT e.total_amount, e.due_date
  INTO v_total, v_due_date
  FROM public.expenses AS e
  WHERE e.id = v_expense_id AND e.store_id = v_store_id;

  UPDATE public.expenses
  SET paid_amount = v_paid,
      payment_status = CASE
        WHEN payment_status = 'cancelled' THEN 'cancelled'
        WHEN v_paid >= v_total THEN 'paid'
        WHEN v_paid > 0 THEN 'partially_paid'
        WHEN v_due_date < CURRENT_DATE THEN 'overdue'
        ELSE 'unpaid'
      END
  WHERE id = v_expense_id AND store_id = v_store_id;

  IF NEW.payment_method = 'cash' THEN
    INSERT INTO public.cash_transactions (
      store_id, type, amount, description, transaction_date, counter_name, expense_payment_id
    )
    VALUES (
      v_store_id, 'out', NEW.amount, 'Expense payment ' || v_expense_id::text,
      NEW.payment_date::timestamptz, 'main', NEW.id
    )
    ON CONFLICT (expense_payment_id) WHERE expense_payment_id IS NOT NULL DO NOTHING;
  ELSIF NEW.bank_account_id IS NOT NULL THEN
    INSERT INTO public.bank_transactions (
      store_id, account_id, type, amount, description, transaction_date, expense_payment_id
    )
    VALUES (
      v_store_id, NEW.bank_account_id, 'withdraw', NEW.amount,
      'Expense payment ' || v_expense_id::text,
      NEW.payment_date::timestamptz, NEW.id
    )
    ON CONFLICT (expense_payment_id) WHERE expense_payment_id IS NOT NULL DO NOTHING;
    IF FOUND THEN
      UPDATE public.bank_accounts
      SET balance = COALESCE(balance, 0) - NEW.amount
      WHERE id = NEW.bank_account_id AND store_id = v_store_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_expense_payment_totals() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_expense_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_total numeric(14, 2);
BEGIN
  v_total := NEW.amount + NEW.tax_amount - NEW.discount_amount;
  IF NEW.amount < 0 OR NEW.tax_amount < 0 OR NEW.discount_amount < 0 OR v_total < 0 THEN
    RAISE EXCEPTION 'Expense amounts must be valid non-negative values';
  END IF;
  IF NEW.paid_amount > v_total THEN
    RAISE EXCEPTION 'Expense total cannot be less than the recorded payments';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.payment_status := CASE
      WHEN NEW.due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'unpaid'
    END;
  ELSE
    IF OLD.payment_status = 'cancelled' AND NEW.payment_status <> 'cancelled' THEN
      RAISE EXCEPTION 'Cancelled expenses cannot be reactivated';
    END IF;
    IF NEW.payment_status = 'cancelled' AND NEW.paid_amount > 0 THEN
      RAISE EXCEPTION 'Refund recorded payments before cancelling this expense';
    END IF;
    NEW.updated_by := auth.uid();
    NEW.updated_at := now();
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      IF auth.uid() IS NULL OR NOT public.has_store_permission('expenses.delete') THEN
        RAISE EXCEPTION 'You are not allowed to archive expenses'
          USING ERRCODE = '42501';
      END IF;
      NEW.deleted_by := auth.uid();
    END IF;
    IF NEW.payment_status <> 'cancelled' THEN
      NEW.payment_status := CASE
        WHEN NEW.paid_amount >= v_total THEN 'paid'
        WHEN NEW.paid_amount > 0 THEN 'partially_paid'
        WHEN NEW.due_date < CURRENT_DATE THEN 'overdue'
        ELSE 'unpaid'
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_expense_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_expense_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Expenses are retained for audit. Use the delete action to archive this record.';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_expense_hard_delete() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_expense_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.expense_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Expense ledger entries are immutable; use an audited correction instead.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_expense_ledger_entry() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stamp_expense_child_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'expense_attachments' THEN
    NEW.uploaded_by := auth.uid();
  ELSIF TG_TABLE_NAME = 'recurring_expenses' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := auth.uid();
    ELSE
      NEW.updated_by := auth.uid();
      NEW.updated_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_expense_child_record() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.write_expense_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_record jsonb;
  v_store_id uuid;
  v_expense_id uuid;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_record := to_jsonb(OLD);
  ELSE
    v_record := to_jsonb(NEW);
  END IF;
  v_store_id := (v_record ->> 'store_id')::uuid;
  v_expense_id := (v_record ->> 'id')::uuid;
  v_action := CASE
    WHEN TG_TABLE_NAME = 'expense_payments' THEN 'payment_recorded'
    WHEN TG_OP = 'INSERT' THEN 'created'
    WHEN TG_OP = 'DELETE' THEN 'deleted'
    WHEN TG_TABLE_NAME = 'expenses' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'deleted'
    ELSE 'updated'
  END;
  INSERT INTO public.expense_audit_logs
    (store_id, expense_id, actor_id, action, before_data, after_data)
  VALUES (
    v_store_id,
    CASE WHEN TG_TABLE_NAME = 'expenses' THEN v_expense_id
         ELSE (v_record ->> 'expense_id')::uuid END,
    auth.uid(),
    v_action,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.write_expense_audit_log() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_template public.recurring_expenses%ROWTYPE;
  v_occurrence date;
  v_count integer := 0;
BEGIN
  UPDATE public.expenses
  SET payment_status = 'overdue'
  WHERE payment_status IN ('unpaid', 'partially_paid')
    AND due_date < CURRENT_DATE
    AND deleted_at IS NULL;

  FOR v_template IN
    SELECT *
    FROM public.recurring_expenses
    WHERE is_enabled
      AND next_due_date <= CURRENT_DATE
      AND (end_date IS NULL OR next_due_date <= end_date)
    ORDER BY next_due_date
    FOR UPDATE
  LOOP
    v_occurrence := v_template.next_due_date;
    WHILE v_occurrence <= CURRENT_DATE
      AND (v_template.end_date IS NULL OR v_occurrence <= v_template.end_date)
    LOOP
      INSERT INTO public.expenses (
        store_id, category_id, title, description, payee, amount, tax_amount,
        discount_amount, date, due_date, payment_method, recurring_expense_id,
        created_by
      )
      VALUES (
        v_template.store_id, v_template.category_id, v_template.title,
        v_template.description, v_template.payee, v_template.amount,
        v_template.tax_amount, v_template.discount_amount, v_occurrence,
        v_occurrence, v_template.payment_method, v_template.id,
        v_template.created_by
      )
      ON CONFLICT (recurring_expense_id, date)
        WHERE recurring_expense_id IS NOT NULL
        DO NOTHING;
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
      v_occurrence := CASE v_template.interval
        WHEN 'daily' THEN v_occurrence + 1
        WHEN 'weekly' THEN v_occurrence + 7
        WHEN 'monthly' THEN (v_occurrence + interval '1 month')::date
        WHEN 'quarterly' THEN (v_occurrence + interval '3 months')::date
        ELSE (v_occurrence + interval '1 year')::date
      END;
    END LOOP;
    UPDATE public.recurring_expenses
    SET next_due_date = v_occurrence,
        is_enabled = (end_date IS NULL OR v_occurrence <= end_date),
        updated_at = now()
    WHERE id = v_template.id AND store_id = v_template.store_id;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_due_recurring_expenses() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.purchase_expense_report
WITH (security_invoker = true)
AS
SELECT
  p.id,
  'purchase'::text AS transaction_type,
  p.purchase_date AS transaction_date,
  p.po_number AS reference_no,
  s.name AS party_name,
  s.phone AS party_phone,
  NULL::text AS category_name,
  COALESCE(p.payment_method, 'other')::text AS payment_method,
  p.total::numeric AS amount,
  p.status,
  p.created_at,
  p.supplier_id,
  NULL::uuid AS category_id,
  COALESCE(p.paid_amount, 0)::numeric AS paid_amount
FROM public.purchases AS p
LEFT JOIN public.suppliers AS s ON s.id = p.supplier_id
UNION ALL
SELECT
  e.id,
  'expense'::text AS transaction_type,
  e.date::timestamp AT TIME ZONE 'UTC' AS transaction_date,
  COALESCE(NULLIF(e.reference_number, ''), NULLIF(e.invoice_number, ''), NULLIF(e.description, ''), e.id::text) AS reference_no,
  e.payee AS party_name,
  NULL::text AS party_phone,
  ec.name AS category_name,
  COALESCE(e.payment_method, 'other')::text AS payment_method,
  e.total_amount::numeric AS amount,
  e.payment_status AS status,
  e.created_at,
  NULL::uuid AS supplier_id,
  e.category_id,
  e.paid_amount::numeric
FROM public.expenses AS e
LEFT JOIN public.expense_categories AS ec ON ec.id = e.category_id AND ec.store_id = e.store_id
WHERE e.payment_status <> 'cancelled'
  AND e.deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_purchase_expense_report_summary(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_type text DEFAULT 'all',
  p_payment text DEFAULT 'all',
  p_supplier uuid DEFAULT NULL,
  p_category uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_min_amount numeric DEFAULT NULL,
  p_max_amount numeric DEFAULT NULL,
  p_purchase_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  total_purchase numeric,
  total_expense numeric,
  total_outflow numeric,
  transaction_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(r.amount) FILTER (WHERE r.transaction_type = 'purchase'), 0),
    COALESCE(SUM(r.amount) FILTER (WHERE r.transaction_type = 'expense'), 0),
    COALESCE(SUM(r.paid_amount), 0),
    COUNT(*)
  FROM public.purchase_expense_report AS r
  WHERE (p_from IS NULL OR r.transaction_date >= p_from)
    AND (p_to IS NULL OR r.transaction_date <= p_to)
    AND (p_type = 'all' OR r.transaction_type = p_type)
    AND (p_payment = 'all' OR r.payment_method = p_payment)
    AND (p_supplier IS NULL OR r.supplier_id = p_supplier)
    AND (p_category IS NULL OR r.category_id = p_category)
    AND (p_status = 'all' OR r.status = p_status)
    AND (p_min_amount IS NULL OR r.amount >= p_min_amount)
    AND (p_max_amount IS NULL OR r.amount <= p_max_amount)
    AND (p_purchase_ids IS NULL OR (
      r.transaction_type = 'purchase' AND r.id = ANY(p_purchase_ids)
    ))
    AND (
      p_search IS NULL OR p_search = '' OR
      r.party_name ILIKE '%' || p_search || '%' OR
      r.party_phone ILIKE '%' || p_search || '%' OR
      r.reference_no ILIKE '%' || p_search || '%' OR
      r.category_name ILIKE '%' || p_search || '%'
    );
$$;
REVOKE ALL ON FUNCTION public.get_purchase_expense_report_summary(
  timestamptz, timestamptz, text, text, uuid, uuid, text, text, numeric, numeric, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_expense_report_summary(
  timestamptz, timestamptz, text, text, uuid, uuid, text, text, numeric, numeric, uuid[]
) TO authenticated;
ALTER VIEW public.purchase_expense_report SET (security_invoker = true);
REVOKE ALL ON TABLE public.purchase_expense_report FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_expense_report TO authenticated;
NOTIFY pgrst, 'reload schema';

DROP TRIGGER IF EXISTS expense_write_guard ON public.expenses;
CREATE TRIGGER expense_write_guard
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_write();
DROP TRIGGER IF EXISTS expense_hard_delete_guard ON public.expenses;
CREATE TRIGGER expense_hard_delete_guard
  BEFORE DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_expense_hard_delete();
DROP TRIGGER IF EXISTS expense_audit_write ON public.expenses;
CREATE TRIGGER expense_audit_write
  AFTER INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.write_expense_audit_log();
DROP TRIGGER IF EXISTS expense_payment_write_guard ON public.expense_payments;
CREATE TRIGGER expense_payment_write_guard
  BEFORE INSERT ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.validate_expense_payment();
DROP TRIGGER IF EXISTS expense_payment_refresh_totals ON public.expense_payments;
CREATE TRIGGER expense_payment_refresh_totals
  AFTER INSERT ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.refresh_expense_payment_totals();
DROP TRIGGER IF EXISTS expense_payment_audit_write ON public.expense_payments;
CREATE TRIGGER expense_payment_audit_write
  AFTER INSERT ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.write_expense_audit_log();
DROP TRIGGER IF EXISTS protect_expense_bank_ledger ON public.bank_transactions;
CREATE TRIGGER protect_expense_bank_ledger
  BEFORE UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_expense_ledger_entry();
DROP TRIGGER IF EXISTS protect_expense_cash_ledger ON public.cash_transactions;
CREATE TRIGGER protect_expense_cash_ledger
  BEFORE UPDATE OR DELETE ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_expense_ledger_entry();
DROP TRIGGER IF EXISTS expense_payments_set_store ON public.expense_payments;
CREATE TRIGGER expense_payments_set_store
  BEFORE INSERT OR UPDATE ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_store_id();
DROP TRIGGER IF EXISTS recurring_expenses_set_store ON public.recurring_expenses;
CREATE TRIGGER recurring_expenses_set_store
  BEFORE INSERT OR UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_store_id();
DROP TRIGGER IF EXISTS recurring_expenses_stamp ON public.recurring_expenses;
CREATE TRIGGER recurring_expenses_stamp
  BEFORE INSERT OR UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.stamp_expense_child_record();
DROP TRIGGER IF EXISTS expense_attachments_set_store ON public.expense_attachments;
CREATE TRIGGER expense_attachments_set_store
  BEFORE INSERT OR UPDATE ON public.expense_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_store_id();
DROP TRIGGER IF EXISTS expense_attachments_stamp ON public.expense_attachments;
CREATE TRIGGER expense_attachments_stamp
  BEFORE INSERT OR UPDATE ON public.expense_attachments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_expense_child_record();

DROP POLICY IF EXISTS expense_categories_select ON public.expense_categories;
CREATE POLICY expense_categories_select ON public.expense_categories
  FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('expenses.view'))
      OR (SELECT public.has_store_permission('expenses.create'))
      OR (SELECT public.has_store_permission('expenses.edit'))
    )
  );
DROP POLICY IF EXISTS expenses_select_active ON public.expenses;
CREATE POLICY expenses_select_active ON public.expenses
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR (SELECT public.has_store_permission('expenses.delete')));
DROP POLICY IF EXISTS rbac_action_update ON public.expenses;
CREATE POLICY rbac_action_update ON public.expenses
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('expenses.edit'))
      OR (SELECT public.has_store_permission('expenses.delete'))
    )
  )
  WITH CHECK (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('expenses.edit'))
      OR (SELECT public.has_store_permission('expenses.delete'))
    )
  );
DROP POLICY IF EXISTS rbac_action_select ON public.expense_categories;
CREATE POLICY rbac_action_select ON public.expense_categories
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('expenses.view'))
      OR (SELECT public.has_store_permission('expenses.create'))
      OR (SELECT public.has_store_permission('expenses.edit'))
    )
  );

INSERT INTO public.expense_categories (store_id, name, description, color)
SELECT stores.id, defaults.name, defaults.description, defaults.color
FROM public.stores AS stores
CROSS JOIN (VALUES
  ('Rent', 'Shop rent', '#6366f1'),
  ('Electricity', 'Electricity bills', '#eab308'),
  ('Water Bill', 'Water bills', '#0ea5e9'),
  ('Internet', 'Internet service', '#8b5cf6'),
  ('Employee Salary', 'Employee salaries', '#10b981'),
  ('Transportation', 'Transportation costs', '#f97316'),
  ('Delivery', 'Delivery costs', '#14b8a6'),
  ('Marketing', 'Marketing expenses', '#ec4899'),
  ('Advertising', 'Advertising expenses', '#d946ef'),
  ('Office Supplies', 'Office supplies', '#64748b'),
  ('Maintenance', 'Repairs and maintenance', '#f59e0b'),
  ('Equipment', 'Equipment and tools', '#3b82f6'),
  ('Software Subscription', 'Software subscriptions', '#a855f7'),
  ('Telephone', 'Telephone bills', '#06b6d4'),
  ('Packaging', 'Packaging materials', '#84cc16'),
  ('Cleaning', 'Cleaning supplies and services', '#22c55e'),
  ('Taxes', 'Business taxes and fees', '#ef4444'),
  ('Other', 'Other business expenses', '#94a3b8')
) AS defaults(name, description, color)
ON CONFLICT (store_id, lower(name)) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-attachments',
  'expense-attachments',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS expense_attachments_storage_read ON storage.objects;
CREATE POLICY expense_attachments_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-attachments'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
    AND (SELECT public.has_store_permission('expenses.view'))
  );
DROP POLICY IF EXISTS expense_attachments_storage_add ON storage.objects;
CREATE POLICY expense_attachments_storage_add ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-attachments'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
    AND (
      (SELECT public.has_store_permission('expenses.create'))
      OR (SELECT public.has_store_permission('expenses.edit'))
    )
  );
DROP POLICY IF EXISTS expense_attachments_storage_delete ON storage.objects;
CREATE POLICY expense_attachments_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-attachments'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_store_id())::text
    AND (SELECT public.has_store_permission('expenses.edit'))
  );

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'niopos-generate-recurring-expenses';
    PERFORM cron.schedule(
      'niopos-generate-recurring-expenses',
      '*/15 * * * *',
      'SELECT public.generate_due_recurring_expenses();'
    );
  END IF;
END;
$$;