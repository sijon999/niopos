/*
# Restrict internal customer financial functions

## Purpose
The customer total recalculation functions are internal trigger helpers and
must not be callable directly by browser clients.

## Security change
- Revoke EXECUTE on `refresh_customer_financials(uuid)` from anon and authenticated.
- Revoke EXECUTE on `refresh_customer_financials_from_sales()` from anon and authenticated.
- Keep `complete_pos_sale(...)` executable for anon and authenticated because the
  current single-tenant POS uses the anon-key client and calls this function to
  complete checkout atomically.

No tables or user data are changed by this migration.
*/

REVOKE EXECUTE ON FUNCTION refresh_customer_financials(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION refresh_customer_financials_from_sales() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_pos_sale(jsonb, uuid, numeric, text, numeric) TO anon, authenticated;
