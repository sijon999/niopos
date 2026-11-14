REVOKE ALL ON FUNCTION public.enforce_pos_product_update()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS purchase_return_items_product_id_idx
  ON public.purchase_return_items (product_id);
CREATE INDEX IF NOT EXISTS purchase_return_items_return_id_idx
  ON public.purchase_return_items (return_id);
CREATE INDEX IF NOT EXISTS purchase_returns_original_purchase_id_idx
  ON public.purchase_returns (original_purchase_id);
CREATE INDEX IF NOT EXISTS stock_movements_performed_by_idx
  ON public.stock_movements (performed_by);
