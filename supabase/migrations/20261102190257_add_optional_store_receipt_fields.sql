ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS trade_license_no text,
  ADD COLUMN IF NOT EXISTS tax_no text;
