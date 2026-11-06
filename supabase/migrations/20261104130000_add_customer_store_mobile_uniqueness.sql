ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_normalized text
  GENERATED ALWAYS AS (
    NULLIF(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), '')
  ) STORED;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.customers
    WHERE phone_normalized IS NOT NULL
    GROUP BY store_id, phone_normalized
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce unique customer mobile numbers: duplicate normalized mobile numbers already exist within a store. Resolve those records without deleting customer data, then rerun this migration.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_store_phone_normalized_uidx
  ON public.customers (store_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;
