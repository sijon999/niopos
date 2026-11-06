CREATE INDEX customer_payments_sale_fk_idx
  ON public.customer_payments (sale_id, store_id, payment_date DESC)
  WHERE sale_id IS NOT NULL;
