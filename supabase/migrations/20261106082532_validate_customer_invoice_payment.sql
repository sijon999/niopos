DO $migration$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.collect_customer_invoice_payment(uuid,numeric,text,date,text,text,uuid)'::regprocedure
  );
  v_updated := regexp_replace(
    v_definition,
    'OR[[:space:]]+p_payment_method NOT IN[[:space:]]*\(',
    'OR p_payment_method IS NULL OR p_payment_method NOT IN (',
    'g'
  );
  IF v_updated = v_definition
    OR position('OR p_payment_method IS NULL OR p_payment_method NOT IN (' IN v_updated) = 0 THEN
    RAISE EXCEPTION 'Unable to enforce required customer payment method';
  END IF;
  EXECUTE v_updated;
END;
$migration$;
