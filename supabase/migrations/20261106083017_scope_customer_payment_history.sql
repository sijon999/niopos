DROP POLICY IF EXISTS sales_permission_read_customer_payments
  ON public.customer_payments;

CREATE POLICY sales_permission_read_customer_payments
  ON public.customer_payments
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.get_my_store_id())
    AND (
      (SELECT public.has_store_permission('sales'))
      OR (SELECT public.has_store_permission('reports'))
    )
  );
