# NioPOS Remote Reconciliation and Tenant Security Plan

Audit scope: read-only inspection of project `jlujbzfyobfskfepjkdt` on 2026-10-26, local migration source review, and app query/RPC search. No remote write was issued. The linked project is active and named `niopos`; the user did not provide an independent expected project reference, so intended-project identity still requires confirmation.

The complete per-table ownership, CRUD-role, FK/index, RLS, application-impact, RPC, and migration-order proposal is in [TENANT_AUTHORIZATION_DESIGN.md](TENANT_AUTHORIZATION_DESIGN.md). The prioritized findings, object inventory, RPC/trigger review, migration reconciliation checklist, and two-store test plan are in [TENANT_SECURITY_REVIEW.md](TENANT_SECURITY_REVIEW.md). Store-owned units are approved; remaining mapping and provisioning gates are in [UNITS_STORE_OWNERSHIP_PLAN.md](UNITS_STORE_OWNERSHIP_PLAN.md). Settings and customer-group scope remain open decisions.

The prepared catalog query inventory is [remote_catalog_inventory_read_only.sql](reviews/remote_catalog_inventory_read_only.sql); its manual handling steps are in [catalog_inventory_execution_guide.md](reviews/catalog_inventory_execution_guide.md), and its uncollected-evidence status matrix is [catalog_evidence_status.md](reviews/catalog_evidence_status.md). None was executed in the local-only review.

The current Phase 1 local gate, including target-project and owner-decision blockers, is [PHASE1_DEPLOYMENT_GATE.md](PHASE1_DEPLOYMENT_GATE.md).

## Decision

Do not push, repair migration history, or test signup against this project yet. The remote has no `supabase_migrations.schema_migrations` table, all local versions were unmatched by `supabase migration list`, a local tenant-isolation migration is incompatible with live schema and its hardcoded owner precondition, and the business tables/RPCs are currently open to anonymous access. The follow-up units audit read unit IDs/labels/status and product IDs/unit strings only; no product names, customer, sale, purchase, or credential rows were inspected.

The CLI showed four profiles (three approved `admin`, one approved `super_admin`) and zero stores. It showed zero `store_owner` profiles. No records were modified.

## Reconciliation

The remote migration ledger is absent. Therefore, “reflected” below means only that relevant objects or behavior were observed; it does not prove which migration created them or that the whole file ran. No migration is safe to mark applied on this evidence alone.

| Local migration | Live evidence | Classification |
| --- | --- | --- |
| `20260806074402_create_core_schema.sql` | Core POS table families exist. Broad `anon` and `authenticated` CRUD grants and `true` policies are live on most business tables. Exact full-column/policy parity was not fingerprinted. | Partially reflected; exact execution cannot be established. |
| `20260810042844_rebrand_to_clothing_store.sql` | This file updates/inserts settings and seed catalog rows. Seed data was not read or compared. | Cannot classify without data-level comparison. |
| `20260813034825_create_product_images_bucket.sql` | `product-images` bucket is public and the four bucket policies allow anon/authenticated read/write/delete. | Object footprint reflected; migration attribution unknown; access is too broad. |
| `20260907042516_add_pos_erp_features.sql` | Several declared extension columns are present, including customer/supplier fields and product ERP fields. Not every declaration was compared. | Partially reflected; exact execution cannot be established. |
| `20260913041549_add_barcode_management.sql` | `products.barcode_format` and `barcode_history` exist. Full index and policy definitions were not fingerprinted. | Partially reflected; exact execution cannot be established. |
| `20260917054040_enhance_product_management.sql` | `units` and `product_variants` exist. Units is currently unscoped, has broad anon/auth CRUD, and product unit references do not match the unit catalog. | Object footprint reflected; row ownership remains unresolved and unit references require approved mapping before constraints. |
| `20260918033021_create_stock_reconciliation.sql` | `stock_reconciliations` and `stock_adjustments` exist. Both have open anon/authenticated policies. | Object footprint reflected; current access is not tenant-safe. |
| `20261001182330_fix_reconciliation_rls_policies.sql` | Reconciliation tables have open anon/authenticated policies and broad table grants. | Intended broad-policy effect reflected; unsafe for the current multi-tenant direction. |
| `20261001185741_repair_customer_sales_transactions.sql` | Both customer financial trigger functions and the sales/customer-payment triggers are present. | Object footprint reflected; exact migration history unknown. |
| `20261001190222_restrict_customer_financial_functions.sql` | Internal refresh functions deny anon/authenticated execution; POS completion overloads still allow anon/authenticated execution. | Partially reflected; the POS grant is a verified exposure. |
| `20261003090642_add_purchase_expense_report_view.sql` | `purchase_expense_report` exists and reads purchases/expenses without a tenant predicate. Index parity was not checked. | View footprint reflected; current view requires tenant-safe execution semantics. |
| `20261003091128_add_purchase_expense_report_summary.sql` | `get_purchase_expense_report_summary(...)` exists and has default/public execution rights. | Function footprint reflected; authorization and tenant scope need remediation. |
| `20261004171822_add_discount_offer_management.sql` | Offer, assignment, and usage tables exist; their table policies/grants are broad. | Object footprint reflected; unsafe for tenant isolation. |
| `20261004171859_extend_pos_sale_with_offer.sql` | The offer-aware `complete_pos_sale(...)` overload exists, is SECURITY DEFINER, and is executable by anon. | Object footprint reflected; verified security blocker. |
| `20261004174028_add_product_level_discounts.sql` | Discount columns and `customer_discount_history` exist; related core tables remain globally accessible. | Partially reflected; exact constraints/indexes are not fully classified. |
| `20261005102547_add_purchase_sales_management.sql` | Purchase/sales extension columns and completion/cancellation functions exist. SECURITY DEFINER purchase/sale operations are executable by anon. | Object footprint reflected; verified security blocker. |
| `20261024150000_create_tenant_auth_foundation.sql` | `profiles`, `stores`, `is_approved_super_admin()`, and `create_profile_for_auth_user()` exist. Live Auth trigger instead targets `handle_new_user_profile()`. Live store columns use `store_name`/`store_phone`/`store_address`, not this file's original `name`/`phone`/`address`. | Partially reflected and subsequently changed; do not replay. |
| `20261024160000_implement_super_admin_approval.sql` | Approval function exists in later form, but live `stores` has no `status` column. | Partially reflected; the historical implementation is incompatible as written. |
| `20261024170000_add_store_tenant_isolation.sql` | `store_memberships`, `get_my_store_id()`, and `has_store_access(uuid)` are absent. POS tables lack `store_id`. Its hardcoded owner precondition is not met: live role counts show zero store owners. It expects old store columns and a store status absent from the live schema. | Not reflected and unsafe to run. It would fail preconditions/schema references. |
| `20261024180000_add_subscription_management.sql` | `plans`, `subscriptions`, and `payments` exist with store/plan FKs. `has_active_subscription()`, `manage_store_subscription(...)`, and `record_subscription_payment(...)` are absent. | Partially reflected; UI-required RPCs are missing. |
| `20261024190000_add_store_employee_permissions.sql` | Membership/invitation tables and team/invitation RPCs are absent. | Not reflected. Do not implement its signup branch without an approved employee design. |
| `20261025001500_fix_profiles_rls_recursion.sql` | `is_super_admin()` and `is_approved_super_admin()` exist as approved-status SECURITY DEFINER helpers. | Helper behavior reflected; execution history unknown. |
| `20261025002000_repair_profiles_rls.sql` | Same current helpers are present; exact policy changes from this file were not isolated. | Cannot distinguish from adjacent repairs without history/fingerprinting. |
| `20261025003000_secure_profiles_rls.sql` | Current helper definitions use approved Super Admin status; live profiles policies are self-read plus helper-based Super Admin read. | Partially reflected; exact attribution unknown. |
| `20261025004000_add_authenticated_profile_read.sql` | `get_my_profile()` exists with SECURITY DEFINER, empty search path, and row security off. | Function footprint reflected; migration attribution unknown. |
| `20261025005000_add_authenticated_profile_lookup.sql` | `get_authenticated_profile(uuid)` exists with SECURITY DEFINER and row security off. | Function footprint reflected; migration attribution unknown. |
| `20261025006000_repair_store_owner_approvals.sql` | `get_store_owner_approvals()` and approval metadata columns exist. | Partially reflected; later functions need review against live schema. |
| `20261025007000_show_all_pending_user_approvals.sql` | `get_pending_user_approvals()` exists. Current `set_store_owner_status()` still references missing `store_memberships` and nonexistent `stores.status`. | Partially reflected; current RPC is incompatible with live schema. |
| `20261025008000_restore_active_subscription_check.sql` | `has_active_subscription()` is absent. | Not reflected. |
| `20261025009000_reconcile_store_schema_and_subscriptions.sql` | Profile/store naming, `profiles.store_id`, approval metadata, and subscription tables exist. Membership/invitation tables, tenant columns on POS tables, and several access/subscription RPCs are absent. The remote migration ledger is also absent. | Partially reflected, but cannot be attributed or safely replayed. |
| `20261026000000_fix_client_signup_profile_role.sql` | Live role check excludes `store_owner`; current handler creates `admin` profiles and no store. | Not reflected. A corrected local draft is now prepared; do not apply pending baseline and security review. |
| `20261027000000_repair_store_owner_approval_rpc.sql` | New local draft only; no remote object was changed. | Proposed separately; not applied. |

## Signup Draft

`migrations/20261026000000_fix_client_signup_profile_role.sql` is a local draft only. It:

- Validates the audited profile/store columns, existing owner and Auth foreign keys, role constraint definition, existing profile/store links, and duplicate owner stores before changing schema.
- Adds `store_owner` to the role check, adds a nullable `profiles.store_id -> stores.id ON DELETE SET NULL` FK, and establishes a unique `stores.owner_id` index only if existing ownership is unambiguous.
- Verifies there remains exactly one Auth INSERT trigger with the audited name and target; it does not create a trigger.
- Replaces only `public.handle_new_user_profile()` using SECURITY DEFINER, empty `search_path`, row security off, and qualified public/pg_catalog objects.
- Creates/reuses only a matching `store_owner/pending` profile, uses `auth.users.id` for profile and owner IDs, reuses exactly one matching owned store, and raises on incompatible profiles, conflicting links, missing names, or multiple owned stores. Advisory transaction locking plus unique owner index and conflict handling protects retries/races.
- Explicitly rejects employee invite metadata because no live employee invitation backend exists.
- Does not bulk-update existing profiles or stores and does not replace `set_store_owner_status()`.

The draft's `ON CONFLICT (id) DO NOTHING` is followed by strict compatibility checks; it does not upgrade an existing `admin`, Super Admin, or approved profile. The role constraint edit and supporting index/FK are local migration proposals, not applied database changes.

## Approval RPC Draft

`migrations/20261027000000_repair_store_owner_approval_rpc.sql` is separate from signup. It checks required profile columns/helper, changes only profile status and approval/rejection metadata, and uses the approved Super Admin helper. It contains no references to `store_memberships` or `stores.status`. Review the exact eligibility policy before applying: the draft preserves the current behavior of permitting a Super Admin to update any non-Super-Admin profile's status.

## Table-by-Table Tenant Plan

Common target for tenant-owned base tables: authenticated-only grants; RLS forced; SELECT/INSERT/UPDATE/DELETE policies scoped to an approved store membership; insert/update must reject a client-supplied different `store_id`. Revoke anon and PUBLIC table privileges. For every direct `store_id`, create a B-tree index and a unique `(id, store_id)` key where another table must reference it. Child relations get composite `(parent_id, store_id)` foreign keys so a child cannot point across stores. Validate existing references before adding constraints. These are design targets, not a ready-to-run migration.

| Live table | Current ownership evidence | Required design and app impact |
| --- | --- | --- |
| `stores` | `owner_id -> profiles.id`; no unique owner index; no status column. | Keep as tenant root; unique owner index; policies use approved `is_super_admin()` or exact authenticated owner. Signup owns creation. Admin stores/subscription selectors query it. |
| `profiles` | `id -> auth.users.id`; nullable `store_id`, currently no FK. | Add validated nullable store FK; preserve self-read and approved-admin read; no self role/status/store assignment. Auth/user approval pages query profiles. |
| `categories` | No store key; parent category self-FK. | Direct store key; composite parent FK `(parent_id, store_id)`; category CRUD and POS/shop reads rely on RLS. |
| `brands` | No store key. | Direct store key; brands CRUD and product joins rely on RLS. |
| `suppliers` | No store key; parent of purchases and supplier payments. | Direct store key; composite FKs from purchases/payments; supplier CRUD/reports rely on RLS. |
| `products` | No store key; brand/category FKs. | Direct store key; composite FKs to brands/categories; POS, inventory, product, barcode, dashboard, and report queries rely on RLS. |
| `customers` | No store key; optional group relation. | Direct store key; composite group FK; POS/customer/payment/discount reads and writes rely on RLS. |
| `employees` | No store key; parent of sales. | Direct store key; composite sales employee FK; employee CRUD and sales joins rely on RLS. |
| `expense_categories` | No store key; parent of expenses. | Direct store key; composite expense category FK; expense/report selectors rely on RLS. |
| `expenses` | No store key; optional expense category. | Direct store key; composite category FK; expense/dashboard/report paths rely on RLS. |
| `sales` | No store key; customer/employee relations. | Direct store key; composite customer/employee FKs; POS completion/cancellation RPCs must require authenticated approved store membership and subscription. |
| `sale_items` | `sale_id -> sales`, nullable `product_id -> products`; no store key. | Direct store key plus composite sale/product FKs; POS/report/customer detail queries rely on RLS. |
| `sale_returns` | Links to original sale/customer; no store key. | Direct store key; composite nullable parent/customer FKs; preserve store identity if an optional parent is nulled. Return UI/RPCs rely on RLS. |
| `sale_return_items` | Links to return/product; no store key. | Direct store key; composite return/product FKs; return workflows rely on RLS. |
| `purchases` | Supplier relation; no store key. | Direct store key; composite supplier FK; purchase CRUD/complete/cancel and report RPCs must be authenticated and tenant-checked. |
| `purchase_items` | `purchase_id -> purchases`, nullable product. | Direct store key; composite purchase/product FKs; purchase details and inventory writes rely on RLS. |
| `purchase_returns` | Original purchase/supplier links. | Direct store key; composite nullable purchase/supplier FKs; preserve store identity if source is nulled. |
| `purchase_return_items` | Return/product links. | Direct store key; composite return/product FKs; return workflow relies on RLS. |
| `product_variants` | `product_id -> products`; no store key. | Direct store key plus composite product FK; variants CRUD and POS/product joins rely on RLS. |
| `units` | No store key; active units are selected by product management and the units page has CRUD. | Decide whether units are a shared catalog or store-specific. If store-specific, add a direct store key, store index, and tenant policies; update units CRUD and product unit references consistently. |
| `stock_movements` | Product relation; no store key. | Direct store key plus composite product FK; inventory/POS writes and history rely on RLS. |
| `stock_reconciliations` | Product/variant links; no store key. | Direct store key; composite product/variant FKs; reconciliation page reads/writes rely on RLS. |
| `stock_adjustments` | Product/reconciliation links; no store key. | Direct store key; composite parent FKs; reconciliation writes rely on RLS. |
| `barcode_history` | Nullable product relation; no store key. | Direct store key and composite nullable product FK; barcode pages rely on RLS. |
| `customer_payments` | Customer relation; no store key. | Direct store key plus composite customer FK; customer financial trigger and dashboard paths must stay within one store. |
| `supplier_payments` | Supplier relation; no store key. | Direct store key plus composite supplier FK; payments/reports rely on RLS. |
| `customer_groups` | No store key. | Direct store key; customer composite FK; groups management is not currently present in the app query scan. |
| `discount_offers` | No store key; offer assignments/usages refer to offers. | Direct store key; composite offer FKs; authenticated tenant policies. |
| `customer_discount_offers` | Customer/offer relations; no store key. | Direct store key; composite customer/offer FKs; customer/discount pages rely on RLS. |
| `discount_offer_usage` | Offer/customer/sale links; no store key. | Direct store key; composite nullable customer/sale and offer FKs; report/checkout functions must validate store. |
| `customer_discount_history` | Customer/sale/item/product links; no store key. | Direct store key; composite nullable FKs; SECURITY DEFINER history RPCs require auth/store checks. |
| `held_orders` | No store key. | Direct store key; POS held-order CRUD relies on RLS. |
| `settings` | Legacy global-looking settings row; no store key. | Decide whether settings are one-per-store or a global system record. If tenant-owned, add store key and unique store index; update settings page's `limit(1)` read/update to select the current store. |
| `bank_accounts` | No store key. | Direct store key; bank transaction composite parent FK; authenticated tenant policies. |
| `bank_transactions` | `account_id -> bank_accounts`; no store key. | Direct store key plus composite account FK; validate current data relationships before applying. |
| `cash_transactions` | No store key. | Direct store key; authenticated tenant policies. |
| `audit_logs` | `user_id -> auth.users`; no store key. | Decide store context and retention. Keep private; admin/service-only access until tenant scope and caller are validated. |
| `roles` | Global-looking permission catalog; no store key; no direct app table query found. | Keep private/global unless a reviewed requirement says otherwise; revoke anon/authenticated CRUD and expose only an approved API if needed. |
| `users` | Legacy table includes `password_hash`; no direct app table query found. | Treat as sensitive; revoke all Data API access and investigate dependencies. Do not read or delete its rows as part of this remediation. |
| `plans` | Global plan catalog; no store key. | Keep global; anon access absent, authenticated currently has access. Restrict management to approved Super Admin and expose only required plan reads. |
| `subscriptions` | Has `store_id` and `plan_id` FKs. | Already store-keyed; validate indexes/constraints and restrict reads/writes to owning store or approved Super Admin. App selector/management currently depends on missing RPCs. |
| `payments` | Has `store_id`/`subscription_id` FKs. | Already store-keyed; validate composite subscription/store integrity and indexes; retain authenticated owner/admin-only policies. |
| `purchase_expense_report` (view) | Derived from purchases, suppliers, expenses, expense categories; no store key. | Use security-invoker semantics and tenant-scoped base RLS or a tightly authorized function; report page and summary RPC must use store scope. |

The current schema has zero stores. Read-only checks found 16 unit rows, 8 duplicated label/code groups, and 28 products whose single grouped unit value is `pcs`, with no case-insensitive match in `units.short_name` (`Pc(s)`). The unit IDs/labels were read; no product IDs/names or other row values were returned, and nothing was modified. Store ownership, duplicate-row disposition, and the product-to-unit mapping remain unresolved; do not add constraints until those maps are approved.

This audit did not inspect or backfill other POS rows. Before any tenant migration, take a reviewed backup, obtain table row counts and relationship-integrity results, decide how each existing row maps to a store, and abort on any ambiguous or orphaned relationship. Never assign every old row to a new store as a shortcut.

## Verified Access and Authorization Findings

- Most business base tables have RLS enabled but broad `true` policies and table privileges for both `anon` and `authenticated`, including select/insert/update/delete. This includes sales, sale items, purchases, purchase items, products, customers, expenses, suppliers, returns, discount data, inventory, settings, and other operational tables.
- The `users` table contains a `password_hash` column and is granted broad table privileges; it also has broad policies. The application scan found no direct `users` table query. Keep it inaccessible until its purpose is reviewed.
- Public storage bucket `product-images` allows anonymous SELECT/INSERT/UPDATE/DELETE in the bucket. Public read may be needed by the storefront, but public writes/deletes are not justified by the app. Decide a safe public-read/authenticated-owner-write path.
- The live `stores` SELECT/UPDATE policies include a direct profile check for `role = 'super_admin'` without approved `status`. Replace only after policy overlap/grant review; use the approved `public.is_super_admin()` helper. Existing profile policies call the approved helper.
- Authenticated clients have profile SELECT access subject to RLS and UPDATE column grants only for `full_name` and `phone`; they cannot update profile role, status, or `store_id` through those grants. The stores table has broad anon column grants, although the current owner predicate compares `owner_id` to `auth.uid()`. Revoke anon grants during reviewed remediation rather than relying on that predicate as the permission boundary.
- The live helper `public.is_super_admin()` is SECURITY DEFINER, `search_path = ''`, `row_security = off`, and checks role plus approved status. That helper is not the weakness; the direct stores policy and open business policies are.
- App approval/stores/subscription pages check `role = 'super_admin'` and approved status. General admin layout gates pending/rejected/suspended users and subscription access, but client routing is not a database security boundary.
- The approvals page confirms the Auth user ID matches the profile ID and requires an approved Super Admin profile. The legacy employees CRUD page also offers an employee `role = 'super_admin'` string; it writes to the legacy `employees` table and does not create or authorize an Auth Super Admin.
- `complete_pos_sale` (both overloads), `complete_purchase_order`, `cancel_sale`, `cancel_purchase_order`, `get_customer_discount_history`, and `get_customer_discount_summary` are SECURITY DEFINER and executable by anon. Their definitions contain no `auth.uid()`, `get_my_store_id`, or `has_active_subscription` check. They must be reviewed and replaced with authenticated, tenant-scoped implementations before POS is reopened.
- The app calls missing `get_my_store_id`, `has_active_subscription`, `get_my_permissions`, `manage_store_subscription`, and `record_subscription_payment` RPCs. The employee panel calls missing team/invitation RPCs. Do not treat these workflows as database-backed.

## Read-Only Verification SQL

Run only against the confirmed intended project. These statements are SELECT/catalog reads; do not paste migration DDL into the SQL editor.

```sql
-- Auth trigger names, targets, definitions, security settings, and grants.
SELECT t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid, true) AS trigger_definition,
       p.oid::regprocedure AS target_function,
       pg_get_functiondef(p.oid) AS function_definition,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       p.proacl AS execute_acl
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_proc AS p ON p.oid = t.tgfoid
WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Live profile/store columns with types, nullability, and defaults.
SELECT table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('profiles', 'stores')
ORDER BY table_name, ordinal_position;

-- Profile/store constraints and FK definitions.
SELECT c.relname AS table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('profiles', 'stores')
ORDER BY c.relname, con.conname;

-- All policies on profiles, stores, and store/subscription objects.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'stores', 'store_memberships', 'store_invitations',
                    'plans', 'subscriptions', 'payments')
ORDER BY tablename, policyname;

-- All current public-table policies, including permissive overlaps.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Column-level profile/store grants.
SELECT table_name, column_name, grantee, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
   AND table_name IN ('profiles', 'stores')
   AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, column_name, privilege_type;

-- Effective CRUD table privileges and current RLS state for public base tables.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
       has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
       has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- Public SECURITY DEFINER function execution surface.
SELECT p.oid::regprocedure AS signature, p.proconfig AS settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY p.proname, p.oid::regprocedure::text;

-- Migration history and required employee/subscription RPC presence.
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_history_table,
       to_regclass('public.store_memberships') AS store_memberships,
       to_regclass('public.store_invitations') AS store_invitations,
       to_regprocedure('public.get_my_store_id()') AS get_my_store_id,
       to_regprocedure('public.has_active_subscription()') AS has_active_subscription,
       to_regprocedure('public.get_my_permissions()') AS get_my_permissions,
      to_regprocedure('public.manage_store_subscription(uuid,uuid,uuid,text,date,date)') AS manage_subscription,
      to_regprocedure('public.record_subscription_payment(uuid,uuid,numeric,text,text,text,timestamptz,text,text)') AS record_payment;

   -- Current profile role/status distribution (no user details).
   SELECT role, status, count(*)
   FROM public.profiles
   GROUP BY role, status
   ORDER BY role, status;

   -- Tenant keys currently present on operational tables.
   SELECT table_name, column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name = 'store_id'
   ORDER BY table_name;

-- Store/profile link anomalies; aggregate only.
SELECT (SELECT count(*) FROM public.profiles) AS profile_count,
       (SELECT count(*) FROM public.stores) AS store_count,
       (SELECT count(*) FROM public.profiles p WHERE p.store_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p.store_id)) AS dangling_profile_links,
       (SELECT count(*) FROM public.profiles p WHERE p.store_id IS NULL
          AND EXISTS (SELECT 1 FROM public.stores s WHERE s.owner_id = p.id)) AS unlinked_store_owners,
       (SELECT count(*) FROM (SELECT owner_id FROM public.stores GROUP BY owner_id HAVING count(*) > 1) d) AS multiple_store_owners;
```

The actual remote CLI inspection also used `supabase projects list`, `supabase migration list --linked --project-ref jlujbzfyobfskfepjkdt`, and SELECT-only `supabase db query --linked --project-ref ...`. `supabase migration list` showed all local versions with blank remote versions. It did not write migration history.

## Commands Not Yet Safe to Run

- `supabase db push`
- `supabase db reset`
- `supabase migration repair --status applied` (for any version, especially all local versions)
- Any direct remote `CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, `INSERT`, `UPDATE`, or `DELETE`
- Signup tests or POS/RLS writes against this production project

## Decisions Requiring Approval

1. Confirm `jlujbzfyobfskfepjkdt` is the intended production project.
2. Approve a migration-baseline investigation. The missing remote ledger must be reconciled migration-by-migration using schema fingerprints and deployment records; do not mark all versions applied.
3. Approve how existing rows (if any) map to a store and how to handle orphans, shared catalog records, and global settings. Zero live stores means no blanket backfill target exists.
4. Decide whether tenant ownership is stored directly on every operational table (recommended for policy/index clarity) while enforcing composite parent FKs, or whether a smaller parent-root design is desired and proven safe for each query.
5. Use the approved store-owned `units` model. Resolve unit row ownership, duplicate IDs/codes, all product mappings, and the default catalog for new stores before introducing any unit FK; also decide whether `settings` and `customer_groups` are global or store-owned.
6. Decide public storefront behavior: replace anonymous base-table access with limited public views/RPCs or require authenticated access. Do not leave unrestricted anon CRUD as compatibility behavior.
7. Approve authenticated-only, tenant-checked replacements for SECURITY DEFINER POS/purchase/discount RPCs and the effective subscription gate.
8. Decide treatment of the legacy `users.password_hash`, `roles`, audit logs, and public product-image bucket.
9. Decide whether employee invitations are in scope. If yes, approve a separate schema/API design first; current live tables/RPCs do not support them.
10. Review whether the separate approval draft may update all non-Super-Admin profiles, or only store-owner profiles.
11. After migration history and security design are approved, review SQL syntax and staged execution/rollback procedure before any remote write.
