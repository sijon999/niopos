DO $$
DECLARE
  v_function_definition text;
  v_old_number_assignment constant text :=
    $old$v_po_number := 'PO-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);$old$;
  v_new_number_assignment constant text :=
    $new$LOOP
    v_po_number := 'PO-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);$new$;
  v_old_insert_returning constant text :=
    $old$) RETURNING id INTO v_purchase_id;$old$;
  v_new_insert_returning constant text :=
    $new$) ON CONFLICT (po_number) DO NOTHING RETURNING id INTO v_purchase_id;
    EXIT WHEN FOUND;
  END LOOP;$new$;
BEGIN
  v_function_definition := pg_get_functiondef(
    'public.complete_purchase_order(uuid, jsonb, numeric, numeric, numeric, text, text, text)'::regprocedure
  );

  IF position(v_old_number_assignment IN v_function_definition) = 0 THEN
    RAISE EXCEPTION 'Expected purchase order number generation logic was not found';
  END IF;
  IF position(v_old_insert_returning IN v_function_definition) = 0 THEN
    RAISE EXCEPTION 'Expected purchase order insert was not found';
  END IF;

  v_function_definition := replace(v_function_definition, v_old_number_assignment, v_new_number_assignment);
  v_function_definition := replace(v_function_definition, v_old_insert_returning, v_new_insert_returning);

  EXECUTE v_function_definition;
END;
$$;
