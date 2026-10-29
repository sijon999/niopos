# NioPOS Tenant Authorization Implementation Plan

Status: local implementation design, 2026-10-26. No remote Supabase connection,
query, migration, or application release was performed for this plan. The
workspace at `niopos-main` has no `.git` directory. Existing migrations and
prior review documents were inspected as repository evidence; remote findings
in those documents are historical and must be revalidated after the production
project is identified.

This plan supersedes unresolved choices in
[TENANT_AUTHORIZATION_DESIGN.md](TENANT_AUTHORIZATION_DESIGN.md) and
[TENANT_SECURITY_REVIEW.md](TENANT_SECURITY_REVIEW.md). It does not authorize
production deployment. The migration entries below are an ordered design, not
executable migration files; no app code or tests were changed in this planning
pass. The contradictory historical migration/trigger assumptions and
unconfirmed remote baseline must be resolved before producing deployable SQL.

## 1. Approved policy decisions

- New stores receive no default units.
- Keep the existing 16 unit rows and 28 products unmapped. Do not select an
  owner, merge duplicate units, or populate `products.unit_id` without an
  authoritative row-to-store/unit mapping.
- Store Owner, Manager, and Cashier permissions follow this matrix. Anything
  not listed is denied:

  | Role | Allowed capabilities |
  | --- | --- |
  | Owner | All capabilities for their own approved store, including settings, units, employees, billing, expenses, and financial management. |
  | Manager | POS, products/catalog, sales, purchases, customers, reports, and inventory. Employee management only when explicitly granted by the Owner. |
  | Cashier | POS, customers, and sales. Reports only when explicitly granted. |
  | Super Admin | Super Admin functions only. Cross-store unit management is the sole cross-store business-data exception and is performed only through audited server-side functions. |

- Settings and customer groups are per-store.
- Public catalog access is disabled for every store by default. A narrow public
  projection may expose only explicitly published store catalogs.
- RLS and composite tenant relationships enforce store boundaries at the
  database; UI checks and client-supplied `store_id` are never authorization.
- Pending, rejected, and suspended profiles have no operational store access.
- Signup and approval code is server-side. An approved Owner is linked to
  exactly one store; duplicate provisioning is prevented by a unique owner
  relationship and a transactional approval function.
- Client code uses verified Supabase Auth identity and database authorization.
  Zustand/localStorage may hold presentation/cart state only.

## 2. Repository evidence and object map

### Tables and views

The checked-in SQL defines or refers to the following business tables. Scope is
per-store unless marked global or identity. Add tenant keys to store-owned rows;
existing rows with no authoritative owner remain `store_id IS NULL` and
invisible to tenant users until mapped. New writes derive or validate
`store_id` from `auth.uid()` and an approved database membership.

| Database object | Scope / target authorization |
| --- | --- |
| `profiles` | Identity. User may read only their own permitted profile fields; approved Super Admin may read approval fields. No client role/status/store assignment. |
| `stores` | Tenant root. Owner and approved Super Admin read; owner updates limited details; approval/provisioning changes use guarded functions. Unique `owner_id`. |
| `store_memberships`, `store_invitations` | Per-store. Owner and explicitly authorized Manager manage staff; no direct client writes. Pending membership is denied. |
| `categories`, `brands`, `products`, `product_variants` | Per-store catalog. Owner/Manager manage; Cashier reads only where the matrix permits. Public reads only from published-catalog projection. |
| `units` | Per-store. Owner manages own units. Approved Super Admin cross-store operations use audited functions; no general cross-tenant unit table mutation. |
| `customers`, `customer_groups` | Per-store. Customer-group membership uses a composite `(group_id, store_id)` relationship. Customer data is never public. |
| `employees` | Per-store staff directory; distinct from Auth memberships. Owner/Manager scope only. |
| `suppliers`, `purchases`, `purchase_items`, `purchase_returns`, `purchase_return_items`, `supplier_payments` | Per-store purchasing. Owner/Manager; writes that affect balances or stock are transactional RPC operations. |
| `sales`, `sale_items`, `sale_returns`, `sale_return_items`, `customer_payments`, `discount_offers`, `customer_discount_offers`, `discount_offer_usage`, `customer_discount_history` | Per-store transactions/promotions. Reads by the approved matrix; checkout, returns, and financial writes use identity-bound RPCs. |
| `expenses`, `expense_categories`, `bank_accounts`, `bank_transactions`, `cash_transactions` | Per-store finance. Owner/Manager only unless a more specific approved permission is present. Financial records are not directly deletable. |
| `stock_movements`, `stock_reconciliations`, `stock_adjustments`, `barcode_history`, `held_orders` | Per-store inventory/POS data. Role permission required; ledger mutations use checked functions. JSON references in `held_orders` require server-side validation. |
| `settings` | Per-store, at most one row per store. UI must query/update the current database-derived store, never `limit(1)` across tenants. |
| `audit_logs` | Internal append-only audit data. No arbitrary client inserts/updates/deletes. Approved Super Admin read is scoped to required audit fields. |
| `users` | Legacy table containing `password_hash`; retain data, revoke Data API access, and do not query or return credential values. |
| `roles` | Global authorization metadata; no client-side authority and no client writes. |
| `plans` | Global. Active-plan read as needed; approved Super Admin manages plans. |
| `subscriptions`, `payments` | Per-store. Owner reads own store; Super Admin billing operations are guarded and audited. |
| `purchase_expense_report` | Invoker-security view; retain only when base RLS and its grants are verified. Anonymous access denied. |
| `storage.objects` / `product-images` | Object path includes store identity; authenticated writes are authorized against that store. Anonymous write/update/delete denied. Public image read is allowed only for explicitly published catalog images. |

The prior catalog report counted 42 public base tables and one view; the local
migrations additionally define the membership/invitation surfaces. That
historical count is not a current remote catalog guarantee. Before production,
reconcile the exact object set and all table policies/triggers against the
confirmed project.

The local migration `20260917054040_enhance_product_management.sql` inserts
unit seed rows. Preserve existing seed/business rows as unmapped; do not rerun
or use that insert as a provisioning template for new stores.

### RPCs, triggers, and authorization obligations

The app call-site scan found these RPCs. Each needs a database-side identity,
approval, role, tenant, and (where operational) active-subscription check.
Revoke `PUBLIC`/`anon` execution unless the function is a deliberately narrow
public catalog projection.

| RPC | Calling surface | Required behavior |
| --- | --- | --- |
| `get_my_permissions`, `has_active_subscription`, `get_my_store_id` | Admin layout, login, subscription-expired, brands/products pages | Derive identity and store from Auth/database; fail closed; never return an authorization result for caller-supplied user/store identity. |
| `complete_pos_sale` (both overloads) | POS | Cashier/Manager/Owner as permitted; active subscription; same-store customer/products/offer; atomic sale, stock, discount, and payment writes. |
| `complete_purchase_order`, `cancel_purchase_order` | Purchases | Owner/Manager; active subscription; same-store supplier/products; transactional stock/financial effects and audited cancellation. |
| `cancel_sale` | Sales | Owner/Manager only; audited void/reversal, not destructive deletion. |
| `get_customer_discount_history`, `get_customer_discount_summary` | Customer detail | Authenticated store permission; reject a foreign customer; return only current-store data. |
| `get_customer_eligible_offers` | `lib/discount.ts` and POS | Authenticated store/customer validation; no customer-specific anonymous results. |
| `get_purchase_expense_report_summary` | Purchase/expense report | Authenticated report permission; constrain every source row to current store. |
| `set_store_owner_status` | Approval actions | Approved Super Admin only; transition only eligible pending `store_owner` profiles; create/activate exactly one store in the same transaction; audit the decision. Legacy `admin` profiles are not silently converted. |
| `get_authenticated_profile` | `lib/auth-profile.ts` | Bind requested profile ID to `auth.uid()`; return only safe profile fields. |
| `create_store_invitation`, `get_store_invitations`, `get_store_team_members`, `manage_store_member`, `revoke_store_invitation` | Employee panel | Enforce Owner/Manager employee permissions and same-store membership. Apply the approved optional Manager/Cashier permission rules. |
| `manage_store_subscription`, `record_subscription_payment` | Subscription page | Approved Super Admin server-side checks, store/subscription consistency, audit; never accept an arbitrary caller identity. |
| New `admin_*_unit` RPCs | Units page | Approved Super Admin check, explicit target store and unit, same transaction as an append-only audit row. Only these RPCs grant cross-store unit mutation. |
| New public-catalog projection/RPC | Landing/shop | Return only explicitly published stores and allowlisted product/category/image fields. Never expose base-table CRUD. |

The SQL migration history identifies the Auth trigger
`on_auth_user_created -> handle_new_user_profile()` in prior evidence. Replace
its function body only after confirming the live trigger inventory; do not add
a second Auth trigger. Signup must create a pending `store_owner` profile and a
pending store application. The approval RPC locks the profile/application,
creates the single store, links it to the profile, creates per-store settings,
records audit, and commits approval atomically. It seeds no units. Replays
must be idempotent or fail without creating another store.

Known trigger families in local SQL include updated-at triggers, customer
financial refresh triggers on sales/customer payments, the Auth profile
trigger, and an RLS event-trigger function. The complete public and event
trigger catalog was not captured; enumerate every trigger binding, owner,
definition, function ACL, `SECURITY DEFINER` setting, and fixed `search_path`
before editing any trigger/function.

The trigger names/bindings visible in local migrations are:

| Trigger | Target / event | Required treatment |
| --- | --- | --- |
| `create_profile_after_auth_signup` | Local foundation migration: `auth.users` insert -> `create_profile_for_auth_user()` | Conflicts with later migrations' expected trigger contract; do not replay without reconciling and choose one verified trigger. |
| `on_auth_user_created` | Later migration preconditions: `auth.users` insert -> `handle_new_user_profile()` | Historical expected binding only, not confirmed live for this task. Preserve exactly one verified Auth insert trigger. |
| `profiles_set_updated_at`, `stores_set_updated_at` | Profile/store updates | Trigger-only; no client execution; retain only after function and owner review. |
| `store_memberships_set_updated_at` | Membership updates | Trigger-only; membership is active only with approved profile/store and permission checks. |
| `plans_set_updated_at`, `subscriptions_set_updated_at` | Plan/subscription updates | Trigger-only; preserve billing scope and function grants. |
| `trigger_reconciliations_updated_at` | Stock-reconciliation updates | Timestamp only; direct data access remains governed by RLS. |
| `sales_refresh_customer_financials` | Sales changes -> customer financial refresh | Verify same-store customer and transactional recalculation. |
| `customer_payments_refresh_financials` | Customer-payment changes -> customer financial refresh | Verify same-store customer and transactional recalculation. |
| `sale_returns_refresh_customer_financials` | Sale-return changes -> customer financial refresh | Verify same-store return/customer and transactional recalculation. |
| `products_enforce_pos_update` | Product updates | Preserve intentional POS/stock protections; ensure it does not substitute for RLS or permit a cross-store update. |
| `discount_offers_enforce_pos_update` | Discount-offer updates | Preserve intentional POS protections; enforce store and role independently. |
| `set_tenant_store_id` | Local tenant migration attaches before insert/update to its business-table list | Do not reuse its Super Admin bypass for general writes; inspect exact list and replace with validated ownership/role behavior. |
| `rls_auto_enable` | Prior remote review reports an event-trigger function; binding not captured | Inventory `pg_event_trigger`; do not disable or replace without dependency review. |

The checked-in history is internally inconsistent: the foundation migration
creates `create_profile_after_auth_signup`, while later migration preflights
require `on_auth_user_created -> handle_new_user_profile()`. This, the
hard-coded tenant backfill, and differences in store columns mean migration
filenames alone cannot establish a safe baseline.

### Routes and UI operations

These are the checked-in application database surfaces found by scanning
`.from(...)` and `.rpc(...)`. Direct table calls can remain only where RLS,
grants, tenant FKs, and role policies enforce the operation. Client route
guards are presentation only.

| Route/file | Existing operations | Required integration |
| --- | --- | --- |
| `/`, `/shop` (`app/page.tsx`, `app/shop/page.tsx`) | Anonymous direct `products`/`categories` reads and cart additions | Stop base-table reads. Use only the published-catalog projection; until available, show no catalog. |
| `/admin/layout` | Client gates on profile role; calls permissions/subscription RPCs | Remove client-only Super Admin bypass/`*` authority; fetch DB-calculated capabilities, fail closed, and retain routing only as UX. |
| `/admin/pos` | Catalog/customer/held-order reads; `complete_pos_sale` | RLS read scope; all writes and stock effects through authenticated transactional RPC. |
| `/admin/products`, `/admin/categories`, `/admin/brands` | Product/catalog CRUD, variants, units, image upload | Include `unit_id`; same-store constraints; product/brand/category CRUD gated by database permission; storage key and policies scoped. |
| `/admin/units` | Global unit select/insert/update/delete; product usage checked by legacy text | Use current-store units for Owner; Super Admin uses audited cross-store RPCs; do not infer usage from legacy text; preserve unowned units. |
| `components/import-csv-dialog.tsx` | Direct product insert/update and separate stock movement writes | Resolve unit within current store; transactional server operation for product/stock changes; report errors instead of partial-success UX. |
| `/admin/inventory`, `/admin/stock-reconciliation`, barcode routes | Product, stock movement, reconciliation, adjustment, history operations | Store permission in RLS/RPC; immutable ledger writes; validate parent/product store equality. |
| `/admin/customers`, `/admin/customers/[id]` | Customer CRUD, group/offer reads and customer discount RPCs | Store-scoped customer/group relationships; guarded RPCs; no foreign customer access. |
| `/admin/employees` | Membership/invitation RPC panel and employee directory | Use database permission result; direct staff/membership mutations prohibited. |
| `/admin/purchases`, `/admin/suppliers` | Supplier CRUD; purchase reads/items; complete/cancel RPCs | Same-store FKs; Manager/Owner permission; RPC-only financial and stock mutation. |
| `/admin/sales` | Sales reads and cancellation RPC | Store-scoped reads; Owner/Manager cancellation RPC only. |
| `/admin/expenses`, `/admin/reports`, `/admin/reports/purchase-expense`, `/admin/dashboard` | Store finance/report table reads and report RPC/view | Require report/finance capability; tenant-filtered base RLS; anonymous report access denied. |
| `/admin/settings` | `settings.limit(1)` and direct update | Query/update exactly the database-derived store's settings row. |
| `/admin/stores`, `/admin/users`, `components/admin/account-status-actions.tsx` | Direct profile/store approval reads; status RPC | Approved Super Admin reads through narrow RPCs; all approval/provisioning state changes through audited server-side RPC. |
| `/admin/subscriptions` | Plan/store/subscription/payment reads and billing RPCs | Approved Super Admin RPC authorization and store/subscription integrity. |
| `/login`, `/subscription-expired` | `has_active_subscription` and Auth state | Database-derived status; pending/rejected/suspended users denied independently of route redirects. |
| `lib/auth-profile.ts`, `components/providers.tsx` | Auth `getUser`, own profile query and secure-profile fallback | Keep as UI/session context only; never make context or cached profile the database authorization source. |
| `lib/discount.ts`, `store/pos-store.ts` | Offer RPC; client cart state | Fix silent RPC error fallback; cart state is not identity/permission and is cleared on account/store change. |

No app query was found for the legacy `users` credential table. No app-owned
test files or test script were found. Remaining route pages without a direct
database call inherit the parent layout and do not grant database authority.

## 3. Required schema changes

1. Add unique `stores(owner_id)` and a validated profile/store ownership
   relationship. The creation must abort if duplicate owners exist; do not
   resolve them automatically.
2. Add nullable `store_id` to each store-owned table, including
   `customer_groups`, `settings`, and `units`; add indexes and unique
   `(id, store_id)` keys where referenced. Keep nullable legacy rows inaccessible
   until they receive a signed-off map. Do not set `NOT NULL` until preflight
   proves every row is mapped.
3. Add composite foreign keys for all tenant relationships (for example
   product/category/brand/unit; sale/customer/items/products; purchase/
   supplier/items/products; group/customer; account/transactions; parent/child
   ledgers). Use `NOT VALID` only where it preserves legacy rows while enforcing
   new writes; validate only after mapping and orphan checks.
4. Add `products.unit_id` nullable and composite FK to
   `units(id, store_id)`. Retain legacy `products.unit` during compatibility.
   No unit/product backfill is part of this plan.
5. Add per-store settings uniqueness and one-row provisioning for newly
   approved stores. Existing settings are not assigned to a store without an
   authoritative mapping.
6. Add per-store customer-group uniqueness and composite customer/group FK.
   Existing groups/customers stay unmapped until mapped.
7. Add an owner application/provisioning relation if signup must preserve
   proposed store details while the account is pending; add approval actor/time
   fields and an append-only authorization audit relation.
8. Add store-level public-catalog publication state defaulting to false and a
   security-invoker view or guarded RPC exposing only allowlisted fields.
9. Restrict Data API privileges on every public table/view/storage operation;
   enable and force RLS where supported; replace permissive policies with
   role-specific default-deny policies.
10. Harden every business `SECURITY DEFINER` function: empty/fixed safe search
    path, qualified names, row-security handling justified per function,
    Auth-bound actor, tenant checks, narrow `EXECUTE`, and explicit
    subscription/permission checks.

## 4. Ordered migration design

The current migration chain is not a safe baseline. In particular,
`20261024170000_add_store_tenant_isolation.sql` contains a hard-coded owner UUID,
updates every listed business table to that store, and sets each `store_id`
`NOT NULL`. It must not be run against unmapped data. Other historical
migrations explicitly grant sensitive RPC execution to `anon`. Do not edit
historical migrations to hide this evidence and do not blindly replay them.

Once production/staging migration history and catalog have been reconciled,
create the following new forward-only migrations in this order. The names are
proposed versions after the current local sequence; verify timestamp uniqueness
before adding them. None may backfill existing business rows. The initial
phases can add nullable keys and fail-closed policies without choosing legacy
owners; any migration that validates non-null ownership remains blocked until
all authoritative maps are approved.

| Order | Proposed migration | Contents / guard |
| --- | --- | --- |
| 1 | `20261028000000_tenant_ownership_primitives.sql` | Guard expected profiles/stores and exact role/status constraints; add approval/application/audit structures, owner uniqueness, publication flag default false, tenant indexes, nullable `store_id`/`unit_id`. Abort on owner duplicates or unexpected schema. No data update or default unit seed. |
| 2 | `20261028001000_tenant_composite_relationships.sql` | Add `(id,store_id)` candidate keys and same-store composite FKs for every parent/child relation, including product/unit, settings/store, and customer-group/customer. Preserve null legacy rows; abort on incompatible existing constraints. |
| 3 | `20261028002000_secure_identity_and_lifecycle.sql` | Define canonical approved Super Admin, approved membership, current-store, permission, and active-subscription helpers; update the existing Auth trigger function in place; server-side pending signup and transactional Owner approval/store provisioning; one-store uniqueness and approval audit. No client role/status write. |
| 4 | `20261028003000_default_deny_rls_and_grants.sql` | Revoke `PUBLIC`/`anon` and unnecessary `authenticated` privileges, including `TRUNCATE`; enable/force RLS; replace all existing permissive policies after exact catalog preflight; role-specific SELECT/INSERT/UPDATE/DELETE policies. Keep global `users` private and `roles` server-managed. |
| 5 | `20261028004000_secure_business_rpcs_and_triggers.sql` | Replace POS, purchase, cancel, customer discount, report, employee, and subscription functions with Auth-bound, tenant-safe implementations; revoke anon/default execution; preserve/repair only verified trigger bindings and make ledger writes transactional. |
| 6 | `20261028005000_store_units_and_super_admin_unit_rpc.sql` | Enforce store-owned units/products for new rows; no default units; keep existing unit/product rows unmapped; add same-store uniqueness; add approved-SA unit list/create/update/delete RPCs that bind actor, target store, and append-only audit event in one transaction. No direct SA cross-store table writes. |
| 7 | `20261028006000_store_settings_groups_and_public_catalog.sql` | Provision one settings row for newly approved stores; enforce per-store settings/customer groups and composite links; create publication-gated allowlisted catalog projection; grant read only to `anon` on that projection, never base tables. |
| 8 | `20261028007000_validate_tenant_ownership.sql` | Separate post-mapping validation only. Validate constraints and optionally enforce non-null tenant keys after every existing row has an authoritative owner. Do not create/apply until complete owner mappings are delivered and reviewed. |

Before each migration, use a read-only preflight against the confirmed target.
Migration 8 is intentionally blocked for the 16 units, 28 products, and any
other row lacking authoritative ownership. It is not replaced by a guess or
single-owner fallback.

## 5. Application integration worklist

The minimum application changes after the database contract is staged are:

- `app/admin/layout.tsx`: remove profile-context-based `['*']` and subscription
  bypass; use database-derived capability responses and fail closed.
- `app/page.tsx`, `app/shop/page.tsx`: replace base-table reads with the
  publication-gated projection and render no catalog while disabled.
- `app/admin/units/page.tsx`: use store-filtered Owner CRUD and audited
  Super-Admin RPC operations; eliminate legacy `products.unit` delete checks.
- `app/admin/products/page.tsx`, `components/import-csv-dialog.tsx`,
  `types/index.ts`: read/write `unit_id`, use current-store units, and avoid
  separately committing product and stock ledger changes.
- `app/admin/settings/page.tsx`: scope by database-derived store ID and handle
  missing settings explicitly; remove arbitrary `limit(1)`.
- `app/admin/customers/page.tsx`, `app/admin/customers/[id]/page.tsx`,
  `app/admin/pos/page.tsx`, `lib/discount.ts`: store-specific groups, customer
  lookups, and checked offer RPC; propagate RPC errors rather than returning a
  success-shaped empty array.
- `app/admin/users/page.tsx`, `app/admin/stores/page.tsx`,
  `components/admin/account-status-actions.tsx`: use guarded approval RPC
  results; do not surface legacy `admin` as a provisioned Owner.
- Employee, purchase, sales, inventory, barcode, report, dashboard, and
  subscription pages: preserve direct reads only where RLS provides the
  approved role/store scope; route transaction/ledger writes through secure
  RPCs.
- `lib/auth-profile.ts`, `components/providers.tsx`: retain verified Auth
  identity/profile context for UI only; no authorization decision may trust
  it as a database boundary.
- `store/pos-store.ts`: cart data remains non-authoritative and should be
  cleared when Auth identity changes; never store role, approval, or store
  authorization there.

## 6. Required database tests

Add `supabase/tests/tenant_authorization.test.sql` using isolated test users,
two stores, memberships, and rows. Use Supabase's local test database or a
dedicated staging project only; do not seed production. Test Auth claims and
SQL role grants, not mocked client state.

| Test | Required assertion |
| --- | --- |
| Owner access | Owner A reads/writes only allowed rows in store A; Owner B data is invisible. |
| Manager restrictions | Allowed matrix operations succeed; settings, unit management, billing, and ungranted employee operations fail. |
| Cashier restrictions | POS/customer/sales permissions work; product/setting/unit/employee/billing operations fail; reports fail unless granted. |
| Pending user denial | Pending, rejected, and suspended profiles cannot read or mutate store rows or call operational RPCs. |
| Cross-store SELECT | A cannot select B rows by ID, filter, join, or public table API. |
| Cross-store INSERT | A cannot set B's `store_id` or reference B's parent/product/unit. |
| Cross-store UPDATE | A cannot update B's row or move A's row to B. |
| Cross-store DELETE | A cannot delete B's row. |
| Unauthorized RPC | Anonymous, pending, wrong-role, wrong-store, and unsubscribed calls are denied without side effects. |
| Super Admin unit management | Approved SA may target a specified store only through the unit RPC; every mutation writes an audit row; direct cross-store DML is denied. Pending/rejected/suspended SA fails. |
| Public catalog restrictions | Disabled stores return nothing; enabled stores return only approved fields/catalog rows; unpublished and other store data are absent; anon cannot read base tables or write. |
| Duplicate provisioning | Concurrent/replayed approval creates exactly one store and settings row; duplicate owner rows cause a safe failure and are never silently reconciled. |
| Legacy unit/product rows | Existing 16 units and 28 products remain unchanged and unmapped; they are invisible to tenant/public reads. |

## 7. Remaining blockers

1. Exact intended Supabase project reference and Production-vs-Staging identity
   are not confirmed for this task. `supabase/config.toml` and local env
   variable names are not proof of target identity.
2. Remote migration ledger was historically absent and local migration
   versions were historically unrecorded. The entire migration baseline must
   be reconciled from deployment records and live object fingerprints; no
   migration may be marked applied based only on object presence.
3. No authoritative ownership map exists for the existing 16 units and 28
   products. Do not backfill either; product/unit features for those rows stay
   unavailable until mapped.
4. Prior evidence described three approved legacy `admin` profiles and zero
   stores/`store_owner` profiles. Revalidate current state. Do not promote or
   attach legacy profiles/business rows without an authoritative mapping.
5. A complete current remote inventory of tables, functions, grants, table
   policies, storage policies, triggers, and event triggers is required before
   migration SQL is finalized. Current repository migration history is not
   proof of current remote state.
6. Local migration history has conflicting Auth trigger names/functions and
   store schemas; the new migration preconditions cannot be finalized until
   the actual remote baseline is known.
7. The local project has no app-owned test suite or configured test command.
   Supabase local DB/Docker availability and pgTAP support must be confirmed
   before executing the database tests.
8. No production deployment is authorized by this plan.

## 8. Production deployment prerequisites (all required)

Before any remote write:

1. The operator explicitly confirms the exact Supabase project reference and
   labels it Production or Staging; verify the Dashboard project ref and
   environment independently of config files and credentials.
2. Obtain an approved backup/recovery plan and a fresh read-only catalog/data
   inventory with row counts, constraints, policies, grants, function bodies,
   trigger/event-trigger bindings, storage policies, and migration records.
   Do not read or export `users.password_hash` values or service credentials.
3. Reconcile every historical migration against the remote ledger and object
   definitions. Do not reset, blanket repair history, or mark unknown
   migrations applied.
4. Review every new migration in order against the confirmed schema and
   migration history. Enumerate all data-affecting statements. Stop if any
   statement can delete, overwrite, blanket-update, or arbitrarily assign
   business rows. Prefer additive DDL and forward corrective changes.
5. Supply and approve authoritative row mappings for every row requiring a
   non-null store/unit relationship. If any mapping remains unresolved, stop
   before the ownership-validation/backfill stage.
6. Apply the exact migration set first in a disposable local/staging database;
   run every positive and negative database test and app type/build checks.
   Confirm there are no cross-store reads, writes, RPC side effects, or public
   catalog leaks.
7. Review rollout/rollback behavior, lock impact, RLS/grant changes, audit
   retention, application/database compatibility, and a tested restore path.
8. Obtain separate explicit production-write approval. Deploy only via the
   reviewed migration workflow; verify applied versions and live policies,
   grants, functions, triggers, and tests afterward. Report deployment only
   with actual evidence.

Never reset Supabase, delete business data, assign stores arbitrarily, merge
duplicate units, backfill `products.unit_id` without a map, disable RLS, grant
unrestricted anonymous access, expose service-role credentials, or claim a
deployment succeeded without verification.
