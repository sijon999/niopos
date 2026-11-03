-- Guard return totals against NULL values before writing transaction records.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.complete_sale_return(uuid,jsonb,text,uuid)'::regprocedure
  )
  INTO v_definition;

  v_old := $old$v_line_taxable:=GREATEST(v_line_revenue-v_line_bill_discount,0);$old$;
  v_new := $new$v_line_taxable:=GREATEST(COALESCE(v_line_revenue,0)-COALESCE(v_line_bill_discount,0),0);$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected sales return taxable amount expression was not found';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$v_line_tax:=CASE WHEN v_taxable_base>0 THEN COALESCE(v_sale.tax,0)*v_line_taxable/v_taxable_base ELSE 0 END;$old$;
  v_new := $new$v_line_tax:=CASE WHEN COALESCE(v_taxable_base,0)>0 THEN COALESCE(v_sale.tax,0)*COALESCE(v_line_taxable,0)/v_taxable_base ELSE 0 END;$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected sales return tax expression was not found';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$v_line_total:=GREATEST(v_line_taxable+v_line_tax,0);$old$;
  v_new := $new$v_line_total:=GREATEST(COALESCE(v_line_taxable,0)+COALESCE(v_line_tax,0),0);$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected sales return line total expression was not found';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$v_return_subtotal:=v_return_subtotal+v_line_subtotal; v_return_discount:=v_return_discount+v_line_discount; v_return_tax:=v_return_tax+v_line_tax; v_return_total:=v_return_total+v_line_total;$old$;
  v_new := $new$v_return_subtotal:=COALESCE(v_return_subtotal,0)+COALESCE(v_line_subtotal,0); v_return_discount:=COALESCE(v_return_discount,0)+COALESCE(v_line_discount,0); v_return_tax:=COALESCE(v_return_tax,0)+COALESCE(v_line_tax,0); v_return_total:=COALESCE(v_return_total,0)+COALESCE(v_line_total,0);$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected sales return totals expression was not found';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$IF v_return_total<=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='return_amount_exceeded'; END IF;$old$;
  v_new := $new$IF v_return_total IS NULL OR v_return_total<=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='return_amount_exceeded'; END IF;$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected sales return amount validation was not found';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$v_due_adjustment:=LEAST(v_return_total,v_due_remaining); v_refund_amount:=v_return_total-v_due_adjustment; IF v_refund_amount>v_paid_remaining THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='return_unpaid_refund'; END IF;$old$;
  v_new := $new$v_due_adjustment:=LEAST(v_return_total,COALESCE(v_due_remaining,0)); v_refund_amount:=GREATEST(v_return_total-v_due_adjustment,0); IF v_refund_amount>COALESCE(v_paid_remaining,0) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='return_unpaid_refund'; END IF;$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected sales return refund calculation was not found';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
