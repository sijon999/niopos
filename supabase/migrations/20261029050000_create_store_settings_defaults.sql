CREATE UNIQUE INDEX settings_store_id_unique_idx
  ON public.settings (store_id)
  WHERE store_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_store_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.settings (
    store_id,
    store_name,
    store_email,
    store_phone,
    store_address,
    currency,
    currency_symbol,
    tax_rate,
    receipt_footer
  )
  SELECT
    NEW.id,
    COALESCE(NULLIF(pg_catalog.btrim(NEW.store_name), ''), 'My Store'),
    p.email,
    NEW.store_phone,
    NEW.store_address,
    'BDT',
    '৳',
    5,
    'Thank you for shopping with StyleBazaar!'
  FROM public.profiles AS p
  WHERE p.id = NEW.owner_id
  ON CONFLICT (store_id) WHERE store_id IS NOT NULL DO NOTHING;

  IF NOT FOUND THEN
    INSERT INTO public.settings (
      store_id,
      store_name,
      store_email,
      store_phone,
      store_address,
      currency,
      currency_symbol,
      tax_rate,
      receipt_footer
    )
    VALUES (
      NEW.id,
      COALESCE(NULLIF(pg_catalog.btrim(NEW.store_name), ''), 'My Store'),
      NULL,
      NEW.store_phone,
      NEW.store_address,
      'BDT',
      '৳',
      5,
      'Thank you for shopping with StyleBazaar!'
    )
    ON CONFLICT (store_id) WHERE store_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_store_settings() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER create_store_settings_after_insert
  AFTER INSERT ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.create_store_settings();

INSERT INTO public.settings (
  store_id,
  store_name,
  store_email,
  store_phone,
  store_address,
  currency,
  currency_symbol,
  tax_rate,
  receipt_footer
)
SELECT
  s.id,
  COALESCE(NULLIF(pg_catalog.btrim(s.store_name), ''), 'My Store'),
  p.email,
  s.store_phone,
  s.store_address,
  'BDT',
  '৳',
  5,
  'Thank you for shopping with StyleBazaar!'
FROM public.stores AS s
LEFT JOIN public.profiles AS p ON p.id = s.owner_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.settings AS existing
  WHERE existing.store_id = s.id
);

NOTIFY pgrst, 'reload schema';
