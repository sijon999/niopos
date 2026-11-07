-- Product identifiers must be unique within a store, not across tenants.
DROP INDEX IF EXISTS public.idx_products_barcode_unique;
DROP INDEX IF EXISTS public.idx_products_product_code_unique;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;

CREATE UNIQUE INDEX idx_products_barcode_unique
  ON public.products (store_id, barcode)
  WHERE store_id IS NOT NULL AND barcode IS NOT NULL;

CREATE UNIQUE INDEX idx_products_barcode_unassigned_unique
  ON public.products (barcode)
  WHERE store_id IS NULL AND barcode IS NOT NULL;

CREATE UNIQUE INDEX idx_products_product_code_unique
  ON public.products (store_id, product_code)
  WHERE store_id IS NOT NULL
    AND product_code IS NOT NULL
    AND is_deleted = false;

CREATE UNIQUE INDEX idx_products_product_code_unassigned_unique
  ON public.products (product_code)
  WHERE store_id IS NULL
    AND product_code IS NOT NULL
    AND is_deleted = false;

CREATE UNIQUE INDEX idx_products_sku_unique
  ON public.products (store_id, sku)
  WHERE store_id IS NOT NULL AND sku IS NOT NULL;

CREATE UNIQUE INDEX idx_products_sku_unassigned_unique
  ON public.products (sku)
  WHERE store_id IS NULL AND sku IS NOT NULL;
