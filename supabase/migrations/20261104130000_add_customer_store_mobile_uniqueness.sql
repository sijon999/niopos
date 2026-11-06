ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_normalized text
  GENERATED ALWAYS AS (
    NULLIF(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), '')
  ) STORED;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_customer_phone_per_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_normalized_phone text;
  v_old_normalized_phone text;
BEGIN
  v_normalized_phone := NULLIF(
    regexp_replace(COALESCE(NEW.phone, ''), '[^0-9]', '', 'g'),
    ''
  );

  IF v_normalized_phone IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_normalized_phone := NULLIF(
      regexp_replace(COALESCE(OLD.phone, ''), '[^0-9]', '', 'g'),
      ''
    );
    IF NEW.store_id IS NOT DISTINCT FROM OLD.store_id
      AND v_normalized_phone IS NOT DISTINCT FROM v_old_normalized_phone THEN
      RETURN NEW;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customers AS customer
    WHERE customer.store_id = NEW.store_id
      AND customer.phone_normalized = v_normalized_phone
      AND customer.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'customers_store_phone_normalized_uidx: This mobile number is already registered with another customer.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_duplicate_customer_phone_per_store()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customers_store_phone_normalized_guard
  ON public.customers;
CREATE TRIGGER customers_store_phone_normalized_guard
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_customer_phone_per_store();
