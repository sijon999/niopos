# NioPOS Migration History Reconciliation

Status: local source review only, 2026-10-26. No Supabase connection/query,
migration execution, migration-history repair, or application change was made
for this document. The nested workspace has no `.git` directory. The review
examined all 32 checked-in `supabase/migrations/*.sql` files in lexical
timestamp order, along with prior local audit records. A filename is not proof
that a migration ran remotely.

## Classification meanings

- **SAFE TO APPLY**: source, exact target baseline, dependencies, and effects
  have all been verified. No migration is currently in this category.
- **REQUIRES REVIEW**: potential use only after remote schema/history and
  security effects are reviewed; not approved to run now.
- **BLOCKED**: known conflict with approved decisions, unresolved ownership,
  or a destructive/unsafe assumption prevents use as written.
- **SUPERSEDED**: later local source replaces or contradicts this file's
  behavior. This does not prove the later file ran or that the earlier file
  should be marked applied.
- **UNKNOWN UNTIL REMOTE EVIDENCE**: the remote ledger/object fingerprint is
  insufficient to determine whether, or how much of, this file was applied.

All statuses are source/reconciliation dispositions, not remote migration
ledger statuses. Do not mark any version applied based on this document.

## Migration timeline and dependency matrix

“Data effect” distinguishes SQL executed when the migration is applied from
DML inside functions/triggers that runs only when a future API call or row
operation invokes them. RLS means the file creates or changes policies/RLS
configuration. “Auth trigger” means a trigger on `auth.users`, not merely a
function that checks Auth.

| Filename / version | Purpose; affected tables, functions, triggers | Data effect when applied | RLS / Auth trigger | Earlier dependencies; destructive or high-risk behavior | Classification |
|---|---|---|---|---|---|
| [20260806074402_create_core_schema.sql](./migrations/20260806074402_create_core_schema.sql) | Initial POS schema: `categories, brands, suppliers, products, customers, employees, expense_categories, expenses, sales, sale_items, purchases, purchase_items, stock_movements, settings`; creates indexes and dynamic anon/auth policies. No functions/triggers. | No row DML in the file. | Creates RLS plus `USING/WITH CHECK (true)` anon/auth CRUD policies. No Auth trigger. | Foundational; requires PostgreSQL UUID-generation support. Single-tenant baseline conflicts with approved tenant/default-deny model. | UNKNOWN UNTIL REMOTE EVIDENCE |
| [20260810042844_rebrand_to_clothing_store.sql](./migrations/20260810042844_rebrand_to_clothing_store.sql) | Rebrand and seed `settings, categories, brands, products, expense_categories`. | Updates existing settings matching `FreshMart Grocery`; conditionally inserts settings; inserts categories, brands, 28 products, and expense categories. `ON CONFLICT DO NOTHING` does not make the settings update reversible. | No RLS change. No Auth trigger. | Depends on core schema. Overwrites existing business settings and injects shared catalog rows; requires per-row comparison and explicit approval. | BLOCKED |
| [20260813034825_create_product_images_bucket.sql](./migrations/20260813034825_create_product_images_bucket.sql) | Creates/uses Storage bucket `product-images`; four `storage.objects` policies. | Inserts bucket row `product-images` with public flag true, ignoring ID conflict. | Adds anon/auth SELECT/INSERT/UPDATE/DELETE policies. No Auth trigger. | Depends on Supabase Storage schema. Public anonymous write/update/delete is incompatible with approved exposure restrictions. | BLOCKED |
| [20260907042516_add_pos_erp_features.sql](./migrations/20260907042516_add_pos_erp_features.sql) | Alters `products, customers, suppliers, sales, purchases`; creates `sale_returns, sale_return_items, purchase_returns, purchase_return_items, customer_payments, supplier_payments, bank_accounts, bank_transactions, cash_transactions, held_orders, customer_groups, users, roles`; `users` includes `password_hash`. | Primarily additive columns/tables/defaults; inspect default application to existing rows on exact target. No explicit business-row UPDATE/DELETE. | Enables RLS and broad anon/auth CRUD on the added business tables. No Auth trigger. | Depends on core. Credential-like `users.password_hash` exposure and broad policies/grants require remediation review; parent deletes can cascade through declared FKs. | BLOCKED |
| [20260913041549_add_barcode_management.sql](./migrations/20260913041549_add_barcode_management.sql) | Alters `products`; creates `barcode_history`, indexes and four policies. | Additive schema only. | Enables RLS; drops/recreates barcode-history policies as anon/auth true CRUD. No Auth trigger. | Depends on core. Policy replacement broadens/retains anonymous business-data access. | REQUIRES REVIEW |
| [20260917054040_enhance_product_management.sql](./migrations/20260917054040_enhance_product_management.sql) | Creates `units, product_variants`; adds product-management columns/index to `products`. | Inserts eight global default unit rows: Piece, Kilogram, Gram, Liter, Meter, Box, Dozen, Pack. No store ownership or unit mapping. | Enables RLS and open anon/auth CRUD for units and variants. No Auth trigger. | Depends on core. Seed directly conflicts with “new stores receive no default units”; absent unit uniqueness means reruns may add duplicate seed rows. | BLOCKED |
| [20260918033021_create_stock_reconciliation.sql](./migrations/20260918033021_create_stock_reconciliation.sql) | Creates `stock_reconciliations, stock_adjustments`; function `update_updated_at_column()`; trigger `trigger_reconciliations_updated_at`. | No initial row DML. FK cascades can remove child records if parent product/reconciliation rows are deleted later. | Creates authenticated `true` CRUD policies; drops/recreates the timestamp trigger. No Auth trigger. | Depends on products and variants from earlier migrations. Policy design is not tenant-safe; trigger replacement must be checked. | REQUIRES REVIEW |
| [20261001182330_fix_reconciliation_rls_policies.sql](./migrations/20261001182330_fix_reconciliation_rls_policies.sql) | Changes policies on `stock_reconciliations, stock_adjustments`. | No row DML. | Drops prior policies and grants anon/auth `true` CRUD. No Auth trigger. | Depends on stock-reconciliation tables. Explicitly widens access and is superseded by the approved default-deny model. | SUPERSEDED |
| [20261001185741_repair_customer_sales_transactions.sql](./migrations/20261001185741_repair_customer_sales_transactions.sql) | Creates/replaces `refresh_customer_financials(uuid)`, `refresh_customer_financials_from_sales()`, `complete_pos_sale(...)`; triggers `sales_refresh_customer_financials`, `customer_payments_refresh_financials`, `sale_returns_refresh_customer_financials`; affects `customers, sales, sale_items, products, stock_movements, customer_payments, sale_returns`. | **Executes a loop over all existing customers and recalculates their totals**, updating `customers.total_buy/paid/due/return`. Function bodies additionally write sales/items, decrement product stock, create stock movements, and update customer totals when called. | No table RLS change. Replaces three triggers. No Auth trigger. | Depends on ERP columns/tables. Migration-time overwrite of derived financial totals needs a verified snapshot/reconciliation; RPC is SECURITY DEFINER with `search_path=public` and later receives anon execution. | BLOCKED |
| [20261001190222_restrict_customer_financial_functions.sql](./migrations/20261001190222_restrict_customer_financial_functions.sql) | Changes EXECUTE grants for customer financial refresh functions and `complete_pos_sale(...)`. | No row DML. | No table RLS change. No Auth trigger. | Depends on the prior financial/POS functions. It revokes internal helper calls but explicitly leaves/regrants POS completion to anon; later tenant design supersedes this access model. | SUPERSEDED |
| [20261003090642_add_purchase_expense_report_view.sql](./migrations/20261003090642_add_purchase_expense_report_view.sql) | Adds indexes and `purchase_expense_report` view over `purchases, expenses, suppliers, expense_categories`. | No row DML. | No table-policy change; view is `security_invoker=true`. No Auth trigger. | Depends on core/ERP tables. Invoker semantics still require source-table RLS and view grants to be reconciled. | REQUIRES REVIEW |
| [20261003091128_add_purchase_expense_report_summary.sql](./migrations/20261003091128_add_purchase_expense_report_summary.sql) | Creates `get_purchase_expense_report_summary(...)`. | No row DML. | No table RLS change; grants function to anon/auth. No Auth trigger. | Depends on report view. Anonymous report execution conflicts with the approved public-data policy. | BLOCKED |
| [20261004171822_add_discount_offer_management.sql](./migrations/20261004171822_add_discount_offer_management.sql) | Creates `discount_offers, customer_discount_offers, discount_offer_usage`; creates `get_customer_eligible_offers(...)`. | No initial row DML. FK cascades can remove assignments/usages when parents are deleted. | RLS with anon/auth true CRUD; eligibility RPC granted to anon/auth. No Auth trigger. | Depends on ERP customers/sales. Exposes customer offer/usage data and mutable discount state without tenant checks. | BLOCKED |
| [20261004171859_extend_pos_sale_with_offer.sql](./migrations/20261004171859_extend_pos_sale_with_offer.sql) | Replaces offer-aware `complete_pos_sale(...)`; affects `sales, sale_items, products, stock_movements, discount_offer_usage, discount_offers, customer_discount_offers`. | RPC body writes sale/line/stock/offer usage and counters only when called. | No table RLS change; explicitly grants SECURITY DEFINER overload to anon/auth. No Auth trigger. | Depends on financial POS function and discount tables. Replaces executable business logic and reopens anonymous transaction writes. | BLOCKED |
| [20261004174028_add_product_level_discounts.sql](./migrations/20261004174028_add_product_level_discounts.sql) | Alters `sale_items`; creates `customer_discount_history`; replaces POS/discount RPCs `complete_pos_sale`, `get_customer_discount_history`, `get_customer_discount_summary`. | Function bodies write sale/items/stock/discount history and counters when invoked; no migration-time data backfill identified. | Adds/replaces RLS policies; RPCs granted to anon/auth. No Auth trigger. | Depends on discounts and earlier POS function. Includes SECURITY DEFINER customer data/financial operations exposed to anon. | BLOCKED |
| [20261005102547_add_purchase_sales_management.sql](./migrations/20261005102547_add_purchase_sales_management.sql) | Replaces/creates `complete_purchase_order, cancel_purchase_order, cancel_sale`; affects `purchases, purchase_items, products, stock_movements, suppliers, customers, sales`. | Function bodies insert/update purchase/sales, stock and supplier/customer totals, and cancellation state when called. | No table RLS change; sensitive functions granted to anon/auth. No Auth trigger. | Depends on ERP, POS and return/financial schema. SECURITY DEFINER transaction operations lack tenant identity checks in this single-tenant design. | BLOCKED |
| [20261024150000_create_tenant_auth_foundation.sql](./migrations/20261024150000_create_tenant_auth_foundation.sql) | Creates `profiles, stores`; helpers `is_approved_super_admin, create_profile_for_auth_user, set_tenant_auth_updated_at`; triggers `create_profile_after_auth_signup, profiles_set_updated_at, stores_set_updated_at`. | Auth trigger function inserts a pending `store_owner` profile on future signup; migration itself creates no profile rows. | Adds profile/store RLS and grants. **Creates** `AFTER INSERT ON auth.users` trigger `create_profile_after_auth_signup -> create_profile_for_auth_user`. | Foundation requires Auth tables. Store columns `name/phone/address`; conflicts with later `store_name/store_phone/store_address` schema and later trigger-name preconditions. | SUPERSEDED |
| [20261024160000_implement_super_admin_approval.sql](./migrations/20261024160000_implement_super_admin_approval.sql) | Replaces `create_profile_for_auth_user()`; adds `set_store_owner_status(...)`. | Signup function would insert pending profile and pending store; approval RPC updates profile and `stores.status` when invoked. | No direct RLS/trigger DDL; existing foundation trigger would call replaced function. **Does not create a second trigger.** | Depends on 24150000 and stores columns `name/phone/address/status`. Later files replace this contract; schema differs from prior remote evidence. | SUPERSEDED |
| [20261024170000_add_store_tenant_isolation.sql](./migrations/20261024170000_add_store_tenant_isolation.sql) | Adds `store_memberships`; functions `is_super_admin, get_my_store_id, has_store_access, set_tenant_store_id, set_store_membership_updated_at`; triggers `store_memberships_set_updated_at` and dynamically attached `set_tenant_store_id` before-write triggers; alters 36 business tables, policies/grants, storage policies and composite FKs. | **BLOCKED BACKFILL:** hard-coded UUID `134a6c47-e059-431e-9beb-3b9e5e12c918`; may create a store for that profile, then dynamically updates every row whose `store_id IS DISTINCT FROM` the selected store and sets all 36 listed tables `store_id NOT NULL`. | Enables/forces RLS, revokes/regrants table privileges, dynamically drops every existing policy on those 36 tables and replaces them; replaces store/storage policies. No Auth trigger. | Depends on owner/profile/store and all 36 tables. Includes CASCADE FK actions and drops existing policy definitions; code assumes old store schema and approved owner. Detailed block below. | BLOCKED |
| [20261024180000_add_subscription_management.sql](./migrations/20261024180000_add_subscription_management.sql) | Creates `plans, subscriptions, payments`; functions `set_subscription_updated_at, has_active_subscription, manage_store_subscription, record_subscription_payment`; triggers for plans/subscriptions; RLS. | No migration-time seed identified. RPC bodies update/insert subscription/payment rows when invoked. | RLS with auth policies and grants; no Auth trigger. | Depends on store helpers/tenant schema. Requires confirmed prior function semantics and store ownership. | REQUIRES REVIEW |
| [20261024190000_add_store_employee_permissions.sql](./migrations/20261024190000_add_store_employee_permissions.sql) | Adds membership permissions and `store_invitations`; creates permission/invitation/team/member RPCs and product/discount update guard triggers; replaces `create_profile_for_auth_user()`. | Auth/invitation and RPC bodies update invitations and create/update profiles, stores and memberships only when invoked. Normal signup creates profile/store; invite branch creates pending employee profile/membership. | Adds membership/invitation RLS and storage/subscription policies. **Replaces the function called by the earlier Auth trigger; does not create an Auth trigger.** | Depends on tenant isolation, subscriptions, and employee membership schema. Uses earlier store columns/assumptions; invitation branch not supported by later 090/2600 handler. | BLOCKED |
| [20261025001500_fix_profiles_rls_recursion.sql](./migrations/20261025001500_fix_profiles_rls_recursion.sql) | Replaces `is_super_admin, is_approved_super_admin`; replaces `profiles` read/update policies. | No row DML. | Drops/recreates profile policies; no Auth trigger. | Depends on profiles/foundation. Superseded by subsequent profile RLS repair files; remote final policy attribution unknown. | SUPERSEDED |
| [20261025002000_repair_profiles_rls.sql](./migrations/20261025002000_repair_profiles_rls.sql) | Replaces Super Admin helpers; enables profile RLS, changes grants and dynamically drops/recreates all `profiles` policies. | No row DML. | Changes RLS/grants; no Auth trigger. | Depends on profile foundation and previous helper. Superseded by 25003000; dynamic policy removal changes access boundary. | SUPERSEDED |
| [20261025003000_secure_profiles_rls.sql](./migrations/20261025003000_secure_profiles_rls.sql) | Replaces Super Admin helpers; changes profile column grants and self/SA policies. | No row DML. | Changes RLS/grants, specifically denies client updates to role/status/identity columns; no Auth trigger. | Depends on profiles and earlier helper migrations. Target behavior is useful but exact live ACL/policies must be inventoried first. | REQUIRES REVIEW |
| [20261025004000_add_authenticated_profile_read.sql](./migrations/20261025004000_add_authenticated_profile_read.sql) | Creates `get_my_profile()`. | No row DML. | No table RLS change; grants function to authenticated only. No Auth trigger. | Depends on secure profile schema/helper conventions. | REQUIRES REVIEW |
| [20261025005000_add_authenticated_profile_lookup.sql](./migrations/20261025005000_add_authenticated_profile_lookup.sql) | Creates `get_authenticated_profile(uuid)`. | No row DML. | No table RLS change; authenticated-only function grant. No Auth trigger. | Depends on profiles/Auth. Function binds requested user ID to `auth.uid()`. | REQUIRES REVIEW |
| [20261025006000_repair_store_owner_approvals.sql](./migrations/20261025006000_repair_store_owner_approvals.sql) | Adds profile approval metadata; replaces `is_super_admin, get_store_owner_approvals, set_store_owner_status`. | Approval RPC updates profiles and stores when called. | No table RLS change; guarded SECURITY DEFINER RPC grants. No Auth trigger. | Depends on profiles/stores with `stores.name/status`; subsequently replaced and incompatible with reported live store schema. | SUPERSEDED |
| [20261025007000_show_all_pending_user_approvals.sql](./migrations/20261025007000_show_all_pending_user_approvals.sql) | Adds `get_pending_user_approvals`; replaces approval RPC; adds profiles to `supabase_realtime` publication if absent. | Function bodies update profiles/stores/memberships when called; publication membership is migration-time metadata change. | No table RLS change. No Auth trigger. | Depends on 24170000 membership objects plus stores/status columns. Later reconciler replaces portions; publication change needs remote publication review. | BLOCKED |
| [20261025008000_restore_active_subscription_check.sql](./migrations/20261025008000_restore_active_subscription_check.sql) | Replaces `has_active_subscription()`. | No row DML. | No table RLS change; authenticated function execution. No Auth trigger. | Depends on 24180000 subscription/store helpers; later 25009000 replaces it. | SUPERSEDED |
| [20261025009000_reconcile_store_schema_and_subscriptions.sql](./migrations/20261025009000_reconcile_store_schema_and_subscriptions.sql) | Reconciles profile/store columns and role constraint; creates membership/invitation, plans/subscriptions/payments if absent; replaces store/permission/subscription/approval functions; defines `handle_new_user_profile`; recreates timestamp triggers and policies. | Most DML is inside new/replaced functions and occurs later. Signup handler creates/reuses profiles/stores/memberships; subscription RPCs update/insert subscription/payment rows. Adding store columns with defaults gives existing stores the declared default values. Migration-time checks and schema constraint/FK changes occur. | Enables/forces RLS and changes policies/grants. **Requires** exactly one existing `auth.users` INSERT trigger named `on_auth_user_created` targeting `handle_new_user_profile`; it does not create that trigger. Recreates non-Auth timestamps triggers. | Depends on tenant + employee + subscription tables/helpers, but its Auth trigger precondition is not established by preceding local migration 24150000. Drops profile role constraints and selected policies/triggers; old store schema assumptions remain. | BLOCKED |
| [20261026000000_fix_client_signup_profile_role.sql](./migrations/20261026000000_fix_client_signup_profile_role.sql) | Validates role/store schema; adds `store_owner` role check, `profiles.store_id` FK, unique owner index if safe; replaces `handle_new_user_profile()`. | No business-row backfill. Future signup handler inserts/validates one pending owner profile/store and links profile `store_id`; advisory lock and unique owner index protect repeated signup. | No RLS/trigger DDL. **Requires** the same existing `on_auth_user_created -> handle_new_user_profile()` trigger; replaces handler only, no second trigger. | Depends on 25009000's columns/functions and exact audited trigger. Rejects employee-invite metadata. Alters profile role constraint and adds uniqueness/FK only after guards. | REQUIRES REVIEW |
| [20261027000000_repair_store_owner_approval_rpc.sql](./migrations/20261027000000_repair_store_owner_approval_rpc.sql) | Replaces `set_store_owner_status(...)`. | RPC updates profile approval/rejection fields when called; no signup trigger or store creation. | No table RLS or Auth trigger changes; authenticated RPC grant with approved SA helper. | Depends on 25009000 profiles/helper. Permits legacy `admin` as well as `store_owner`, and has no audit write; does not by itself meet the approved Owner-only/audited lifecycle contract. | REQUIRES REVIEW |

## Auth user-created trigger conflict

### Local history

1. **`20261024150000_create_tenant_auth_foundation.sql`** creates
   `create_profile_after_auth_signup`, an `AFTER INSERT ON auth.users` trigger
   invoking `public.create_profile_for_auth_user()`. The initial function
   creates a pending `store_owner` profile only.
2. **`20261024160000_implement_super_admin_approval.sql`** replaces
   `create_profile_for_auth_user()` in place. It requires `store_name`, inserts
   a pending owner profile and a pending store using the earlier `name`,
   `phone`, `address`, `status` store schema. It adds no trigger.
3. **`20261024190000_add_store_employee_permissions.sql`** again replaces
   `create_profile_for_auth_user()` to add an invitation-token branch and
   store creation. It adds no Auth trigger. Its normal signup path creates
   role `store_owner`; the later invitation branch creates a pending
   membership/profile.
4. **`20261025009000_reconcile_store_schema_and_subscriptions.sql`** requires
   exactly one `auth.users` INSERT trigger named
   `on_auth_user_created` targeting `public.handle_new_user_profile()`, then
   replaces that function. It does not create, rename, or remove the trigger.
5. **`20261026000000_fix_client_signup_profile_role.sql`** repeats a strict
   precondition for the same `on_auth_user_created` binding and replaces
   `handle_new_user_profile()` with a retry-guarded pending Owner/profile/store
   handler. It does not create another trigger. Employee invitation metadata
   is explicitly rejected.
6. **`20261027000000_repair_store_owner_approval_rpc.sql`** changes only the
   approval RPC; it does not affect Auth trigger/function binding.

Other local migrations reference `auth.users` only through profile foreign
keys/approval actor columns; they do not create or replace an Auth signup
trigger. Local search found no `CREATE TRIGGER on_auth_user_created` statement.
Thus the chronological local chain creates a trigger with one name/function,
but later migrations preflight a different name/function and never establish
that replacement binding. A fresh replay from the first migration is not a
valid proof that the later trigger precondition will pass.

### Intended final contract and decision

The latest local trigger preconditions and the prior read-only remote report
both identify this intended binding:

`auth.users AFTER INSERT -> public.handle_new_user_profile()`

The prior report says the remote catalog had exactly one
`on_auth_user_created` trigger calling that function. This remains historical
evidence, not a fresh check. The intended handler must be the single
server-side signup path, create the correct pending profile/store lifecycle,
be safe against retries/concurrency, and never authorize based on Auth
metadata. It must align with the approved role model and create no default
units. The current local `20261026000000` handler is the latest candidate
implementation; it is not approved for deployment because its trigger
precondition, store ownership state, role constraint, remote schema and
migration history remain unverified. The later approval RPC also allows legacy
`admin`, has no audit record, and does not provision/reconcile a store.

**Do not add a second Auth trigger. Do not drop or rename either trigger based
only on local source.** First capture all live non-internal triggers on
`auth.users`, their timing/events/functions/owners/ACLs, and function
definitions. Confirm whether the deployed trigger is the prior-reported
`on_auth_user_created` or the local-foundation
`create_profile_after_auth_signup`. Then verify signup behavior in isolated
staging. Only a reviewed, atomic replacement of the existing trigger target
with an equivalent-or-safer handler may be considered; avoid an interval with
zero or two provisioning handlers. If the expected live binding differs,
stop and design a guarded, one-trigger transition; do not force local
history to match by marking versions applied.

## Hard-coded tenant and ownership backfill findings

### BLOCKED migration

[20261024170000_add_store_tenant_isolation.sql](./migrations/20261024170000_add_store_tenant_isolation.sql)
contains the only hard-coded UUID literal found in the 32 migration files:
`134a6c47-e059-431e-9beb-3b9e5e12c918`, declared twice as `v_owner_id`.

The first DO block requires that exact profile to exist with role
`store_owner`; if it has no store, it inserts one from that profile using
`name/email/status`. A later block finds the store for the same owner, then
dynamically executes for every table below:

```sql
UPDATE public.<table>
SET store_id = <that store UUID>
WHERE store_id IS DISTINCT FROM <that store UUID>;

ALTER TABLE public.<table> ALTER COLUMN store_id SET NOT NULL;
```

This overwrites both `NULL` ownership and any existing different
`store_id`; it does not preserve prior assignments. It then adds per-table
indexes and composite relationships. The exact 36-table target set is:

`categories, brands, suppliers, products, customers, employees,
expense_categories, expenses, sales, sale_items, purchases, purchase_items,
stock_movements, settings, sale_returns, sale_return_items, purchase_returns,
purchase_return_items, customer_payments, supplier_payments, bank_accounts,
bank_transactions, cash_transactions, held_orders, customer_groups, users,
roles, barcode_history, units, product_variants, stock_reconciliations,
stock_adjustments, discount_offers, customer_discount_offers,
discount_offer_usage, customer_discount_history`.

The migration also changes all policies/grants for this set and introduces
composite foreign keys, some with `ON DELETE CASCADE` (including transaction
children, stock movements/variants, payment and discount rows). Those FK
actions are not an immediate migration-time delete, but make future parent
deletion capable of deleting related business history.

### Why blocked

- Prior evidence (not freshly revalidated) reported zero stores and zero
  `store_owner` profiles; the hard-coded owner prerequisite was therefore not
  met in that capture.
- All 36 tables would be assigned to one guessed owner, including the 16
  existing units, 28 products, customers, sales, purchases, financial ledgers,
  users and audit-like histories. No authoritative ownership mapping exists.
- Existing non-null `store_id` values, if any, would also be overwritten.
- It sets every listed `store_id` NOT NULL, preventing unmapped rows from being
  preserved as-is.
- The file expects store columns/status different from the later reconciled
  schema and creates `store_memberships` without the later permissions shape.
- Its broad dynamic policy removal and cascade relationships magnify the
  impact; the migration cannot be treated as a harmless schema-only change.

**Disposition: BLOCKED. Do not execute, edit into a replacement, mark applied,
or reproduce its owner UUID/backfill behavior.** No existing row should be
assigned by inference.

### Safe replacement strategy (design only)

1. Keep existing ownership columns nullable and existing rows untouched.
2. For each table, produce a separately reviewed ownership-map input containing
   the stable source row key, authoritative store ID, evidence/source, reviewer,
   and approval. Reject missing rows, duplicate keys, unknown stores, conflicting
   mappings, or a map not covering the specifically requested rows.
3. Validate the complete proposed mapping with read-only counts, FK/orphan
   checks and explicit conflict reports. Do not derive mappings from names,
   product descriptions, `unit='pcs'`, duplicate unit labels, profile role,
   creation order, or the hard-coded UUID.
4. Apply future schema migrations that add nullable keys and enforce
   same-store constraints for new, mapped writes without changing legacy rows.
   Quarantine/invisibility of `store_id IS NULL` rows is enforced through
   default-deny RLS and application behavior.
5. Only after authoritative mappings are approved, create a separately
   reviewed, table-specific, idempotent update migration with exact expected
   row counts and pre/postcondition guards. It must update only listed source
   IDs, never `IS DISTINCT FROM` every row. Abort on any mismatch.
6. Validate composite constraints only after referenced parent rows are
   mapped. Keep unowned units/products nullable and inaccessible until their
   maps are approved; no default units are provisioned for new stores.
7. Do not set tenant keys `NOT NULL` while unmapped legacy rows remain. Any
   later enforcement decision must account for the retained unmapped rows
   without deleting or rewriting them.

### Other unit/product writes found

- `20260917054040_enhance_product_management.sql` inserts eight shared default
  units. This conflicts with the approved no-default-units decision. It is not
  a store-ownership mapping, but must not be replayed as new-store provisioning.
- `20260810042844_rebrand_to_clothing_store.sql` seeds 28 example products with
  `unit='pcs'`; these are inserts, not a `unit_id` mapping.
- No local migration sets `products.unit_id`; `unit_id` does not appear in the
  migration SQL. No migration maps the 28 products to any of the 16 units.
- The tenant backfill dynamically assigns `store_id` on both `units` and
  `products`; it does not populate `unit_id`. No duplicate unit merge or
  canonical `Pc(s)` selection is present in migrations.
- `20261025009000` and `20261026000000` set `profiles.store_id` only inside
  future Auth signup handlers. These are function-body operations, not bulk
  backfills of existing business rows.

## Existing-row DML and destructive-operation inventory

### Migration-time row changes

1. `20260810042844_rebrand_to_clothing_store.sql`: overwrites matching
   existing `settings` rows where `store_name='FreshMart Grocery'`; inserts
   settings/catalog seed rows and 28 products. Existing settings must be
   snapshotted and compared before any decision to replay it.
2. `20260917054040_enhance_product_management.sql`: inserts eight unit seeds;
   no existing unit ownership mapping.
3. `20261001185741_repair_customer_sales_transactions.sql`: recalculates every
   existing `customers` row using `refresh_customer_financials`; this
   overwrites derived balances and must not be assumed harmless for financial
   records.
4. `20261024170000_add_store_tenant_isolation.sql`: hard-coded store creation
   and blanket assignment/NOT NULL operation on the 36 tables above. BLOCKED.
5. `20261025007000_show_all_pending_user_approvals.sql`: conditionally adds
   `public.profiles` to the `supabase_realtime` publication. This is publication
   metadata, not business-row DML.

The other `INSERT/UPDATE` statements found in migration source are primarily
inside function definitions or trigger handlers. They execute only when the
function/trigger is later invoked, not merely because `CREATE OR REPLACE
FUNCTION` ran. Important runtime writers include POS, purchase/cancel,
subscription/payment, approval, signup and invitation functions; each requires
its own identity/tenant/role review before retaining.

No local migration defines an `audit_logs` table or an audit-writing function
or trigger. The approved Super Admin unit-management audit requirement needs a
new database-side design, after verifying whether an equivalent object exists
remotely; do not assume an audit facility or allow client-forged audit records.

### DDL / access changes with destructive or lockout potential

- Source scan found **no executable `DELETE FROM`, `TRUNCATE`, `DROP TABLE`, or
  `DROP COLUMN` statement** in the local migration set.
- There are many `DROP POLICY` statements. Some migrations drop named policies;
  `20261024170000` dynamically drops every current policy for 36 tables, and
  `20261025002000` dynamically drops every policy on `profiles`. These do not
  delete rows but can abruptly remove access or erase security-policy intent.
- `DROP TRIGGER IF EXISTS` appears in the stock reconciliation migration,
  customer-financial migration, and subscription reconciliation migration.
  The trigger is recreated in those files, but the old definition must be
  compared before replacement. No local file proves that removing an Auth
  trigger would be equivalent or safer.
- `20261025009000` conditionally drops profile role-check constraints and
  recreates one; it also drops/recreates policies and three timestamp triggers.
  Constraint definitions and dependent data must be checked first.
- FK declarations include `ON DELETE CASCADE` and `ON DELETE SET NULL`. These
  do not delete rows during migration, but can delete child business/history
  rows or detach references on later deletes. Exact target FK actions must be
  reviewed before adding/enabling them.
- No `GRANT ALL` or `TRUNCATE` statement appears in the migration source.
  However, prior remote catalog evidence reported effective anon/auth
  TRUNCATE and broad grants on some tables. That is live-ACL evidence, not
  proven attributable to any particular local migration; recheck effective
  grants before writes. RLS does not constrain TRUNCATE.
- Replacing SECURITY DEFINER functions or granting/revoking EXECUTE can change
  business behavior without deleting rows. Historical migrations grant anon
  execution for sales, purchases, discount and reporting RPCs; these grants
  are incompatible with the approved model.

## Remote migration-history comparison

The prior [REMOTE_REMEDIATION_AUDIT.md](./REMOTE_REMEDIATION_AUDIT.md) recorded
the following read-only findings on 2026-10-26:

- `supabase_migrations.schema_migrations` was absent.
- `supabase migration list` showed no remote version for all local migration
  versions.
- Relevant remote tables/functions were only partially present; the report
  said `store_memberships`, `store_invitations`, and several tenant/subscription
  RPCs were absent, and core POS tables had no `store_id`.
- The prior report identified a remote Auth trigger named
  `on_auth_user_created` calling `handle_new_user_profile()`, while the local
  first Auth foundation migration creates the differently named
  `create_profile_after_auth_signup` trigger.

Those are prior captures, not current live evidence. Partial object presence
does not establish that an entire migration ran. No migration may be marked
applied based on matching table/function names, and no migration-history table
should be created/repaired to make the local sequence look consistent.
`supabase/config.toml` local `project_id` is not confirmation of the intended
remote project. This task made no fresh CLI or remote query.

## Proposed safe migration sequence (not executable SQL)

1. **Read-only target and history evidence.** Confirm exact project reference
   and Production/Staging designation independently. Inventory migration
   records, deployment records, all current table/column/constraint/index
   definitions, policies/grants/default privileges, function bodies/ACLs,
   Auth/public/storage/event triggers, Storage policies, and publication
   membership. Do not read credential values.
2. **Per-file reconciliation.** For each local file, compare its complete
   expected object/data fingerprint against remote definitions and records.
   Mark a version “known applied” only with trustworthy deployment/ledger
   evidence, never because some objects exist. Resolve partial runs separately.
3. **Quarantine historical source.** Preserve every filename and source file.
   Do not replay conflicting legacy migrations to fill gaps. Prepare a reviewed
   baseline statement showing what exists and what does not; do not repair the
   migration ledger yet.
4. **Explicit mapping evidence.** Obtain authoritative ownership maps for
   existing business rows to stores, especially the 16 units and 28 products.
   No inferred map. If unavailable, preserve them unmapped and defer any
   migration that requires their `store_id`/`unit_id` non-null.
5. **Design executable forward migrations only after steps 1-4.** Use
   guarded, additive schema changes; nullable ownership keys; same-store
   composite constraints; Auth-bound approved-role helpers; an in-place,
   verified single Auth trigger handler; and default-deny RLS/grants.
   Replace unsecured functions only after every caller/overload/dependency is
   inventoried.
6. **Close RLS/policy/grant changes atomically.** Remove/restrict existing
   permissive policies and anon grants in the same reviewed transaction as
   installing the intended Owner/Manager/Cashier policies. Preserve no
   unrestricted anon base-table access. Public access, if enabled, is only a
   disabled-by-default allowlisted catalog projection.
7. **Add lifecycle and per-store rows.** Ensure exactly one store per Owner,
   server-side approval and audit, per-store settings/customer groups, and no
   default units. Use a uniqueness guard and concurrency test; do not let the
   browser provision an approved store.
8. **Migrate mapped rows in explicit batches only.** Separate migration per
   approved table/map with exact IDs, expected affected counts, same-store
   relationship checks and before/after verification. Do not use a global
   owner fallback. Do not advance unit/product ownership until maps exist.
9. **Validate constraints and test in isolated staging.** Validate composite
   FKs only on mapped rows; keep unmapped rows inaccessible. Test every
   positive/negative role and cross-store operation and duplicate signup/store
   provisioning before production approval.

## Exact blockers

1. No independently confirmed target project reference or environment.
2. Prior remote migration ledger absent and all local versions unmatched;
   trustworthy deployment records/object fingerprints are not available in
   this local-only task.
3. Local Auth trigger chain is internally inconsistent; local history creates
   one trigger name but later migrations require a different binding without
   creating it. The actual live trigger and function must be rechecked.
4. The hard-coded tenant migration assigns all 36 listed tables to one
   unverified UUID and forces `store_id NOT NULL`; prior evidence says its
   owner prerequisite was absent. It remains **BLOCKED**.
5. No authoritative mapping exists for the existing 16 units and 28 products;
   no `unit_id` mapping is present in source. Do not backfill or merge them.
6. Earlier local migrations seed default units, broad product/category data,
   and globally shared defaults; this conflicts with current no-default and
   publication decisions.
7. Historical policies/RPC grants permit anonymous CRUD and calls to sensitive
   functions. Exact effective remote grants/policies are not freshly known.
8. Local migrations contain no audit-log table or audit-writing function or
   trigger; the live catalog must be checked before designing the required
   server-side Super Admin audit path.
9. The local app and database migration history contain schema-name and
   function-contract drift; a clean chronological replay is not demonstrated.

## Prerequisites before executable migrations can be created

- Exact target/project/environment confirmation and separate written
  authorization for any eventual remote write.
- Fresh, owner-authorized read-only migration-ledger and catalog evidence plus
  backup/recovery readiness; never reset the database or mark unknown versions.
- A version-by-version deployment record reconciliation and explicit resolution
  of partial/unknown migrations.
- Complete Auth trigger/function inventory and a reviewed single-trigger
  transition plan; no add/remove operation without proving the replacement
  behavior.
- Fresh table counts/constraint/orphan checks and an impact report for every
  statement that can change existing rows, privileges, policies, triggers, or
  FK delete behavior.
- Authoritative ownership mappings and per-table approved row counts before
  any ownership backfill or `NOT NULL` enforcement. Without maps, leave rows
  nullable and inaccessible.
- Reviewed role/permission and Super Admin audit semantics encoded in
  database-side checks, not client profile state.
- Disposable local/staging database with migrations and all role/RLS/RPC,
  public-catalog and duplicate-provisioning tests passing.
- Independent review of every migration in order and explicit production
  deployment approval. No deployment is authorized by this reconciliation.

## Stop conditions

Stop if the target or ledger cannot be verified; the live Auth trigger differs
from the reviewed precondition; any migration can delete, overwrite, or
arbitrarily assign business data; a row lacks authoritative ownership required
by a constraint; policies/grants cannot be reconciled; or required staging
tests fail. Do not reset Supabase, delete business data, merge duplicate units,
backfill `products.unit_id`, disable RLS, grant unrestricted anon access,
expose service-role credentials, or claim a deployment without evidence.
