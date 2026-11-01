ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS purchase_price numeric,
  ADD COLUMN IF NOT EXISTS profit numeric;

CREATE OR REPLACE FUNCTION public.snapshot_sale_item_purchase_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT COALESCE(p.cost_price, 0)
    INTO NEW.purchase_price
    FROM public.products AS p
    WHERE p.id = NEW.product_id;
  ELSE
    NEW.purchase_price := 0;
  END IF;

  NEW.purchase_price := COALESCE(NEW.purchase_price, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sale_items_snapshot_purchase_price ON public.sale_items;
CREATE TRIGGER sale_items_snapshot_purchase_price
  BEFORE INSERT ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_sale_item_purchase_price();

CREATE OR REPLACE FUNCTION public.persist_completed_sale_item_profit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_item_discounts numeric := 0;
  v_item_revenue numeric := 0;
  v_bill_discount numeric := 0;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  UPDATE public.sale_items AS si
  SET purchase_price = COALESCE(p.cost_price, 0)
  FROM public.products AS p
  WHERE si.sale_id = NEW.id
    AND si.profit IS NULL
    AND p.id = si.product_id;

  UPDATE public.sale_items
  SET purchase_price = 0
  WHERE sale_id = NEW.id
    AND profit IS NULL
    AND product_id IS NULL;

  SELECT
    COALESCE(SUM(si.discount_amount), 0),
    COALESCE(SUM(si.total), 0)
  INTO v_item_discounts, v_item_revenue
  FROM public.sale_items AS si
  WHERE si.sale_id = NEW.id;

  v_bill_discount := GREATEST(COALESCE(NEW.discount, 0) - v_item_discounts, 0);

  UPDATE public.sale_items AS si
  SET profit = ROUND(
    si.total
      - CASE
          WHEN v_item_revenue > 0
            THEN v_bill_discount * si.total / v_item_revenue
          ELSE 0
        END
      - COALESCE(si.purchase_price, 0) * si.quantity,
    2
  )
  WHERE si.sale_id = NEW.id
    AND si.profit IS NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_completed_sale_item_profit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sales_persist_item_profit ON public.sales;
CREATE CONSTRAINT TRIGGER sales_persist_item_profit
  AFTER INSERT OR UPDATE OF status ON public.sales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION public.persist_completed_sale_item_profit();

CREATE OR REPLACE FUNCTION public.get_sales_profit_summary(
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_payment_method text,
  p_customer_id uuid,
  p_status text,
  p_min_amount numeric,
  p_max_amount numeric,
  p_product_ids uuid[],
  p_category_ids uuid[],
  p_brand_ids uuid[],
  p_units text[]
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(si.profit), 0)
  FROM public.sale_items AS si
  JOIN public.sales AS s ON s.id = si.sale_id
  LEFT JOIN public.products AS p ON p.id = si.product_id
  WHERE s.status = 'completed'
    AND (p_status IS NULL OR p_status IN ('all', 'completed'))
    AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
    AND (p_payment_method IS NULL OR p_payment_method = 'all' OR s.payment_method = p_payment_method)
    AND (p_customer_id IS NULL OR s.customer_id = p_customer_id)
    AND (p_min_amount IS NULL OR s.total >= p_min_amount)
    AND (p_max_amount IS NULL OR s.total <= p_max_amount)
    AND (COALESCE(cardinality(p_product_ids), 0) = 0 OR si.product_id = ANY(p_product_ids))
    AND (COALESCE(cardinality(p_category_ids), 0) = 0 OR p.category_id = ANY(p_category_ids))
    AND (COALESCE(cardinality(p_brand_ids), 0) = 0 OR p.brand_id = ANY(p_brand_ids))
    AND (COALESCE(cardinality(p_units), 0) = 0 OR p.unit = ANY(p_units));
$$;

REVOKE ALL ON FUNCTION public.get_sales_profit_summary(
  timestamptz, timestamptz, text, uuid, text, numeric, numeric, uuid[], uuid[], uuid[], text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_profit_summary(
  timestamptz, timestamptz, text, uuid, text, numeric, numeric, uuid[], uuid[], uuid[], text[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';
