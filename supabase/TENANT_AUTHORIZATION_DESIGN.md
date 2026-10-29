# NioPOS Tenant Ownership and Authorization Design

Status: design proposal with a store-isolation deployment update dated 2026-10-29. The catalog evidence and proposals below were captured on 2026-10-26 and are historical; they do not describe the current remote schema in every detail.

## Store-isolation deployment update (2026-10-29)

For project `jlujbzfyobfskfepjkdt`, the `enforce_store_data_isolation` migration added `store_id` ownership, forced RLS, and same-store foreign-key validation to 36 business tables. Approved `admin` and `store_owner` accounts resolve only to their own store; Super Admin can manage store/account records but has no operational store-data scope. Sensitive transaction and discount RPCs now execute as the caller so table RLS applies. Signup-created stores are linked to their owner profiles.

Existing business rows were deliberately not assigned to a store because their original owner was not identified. Their new `store_id` values remain NULL and RLS keeps them inaccessible until an authorized owner mapping is provided. Do not backfill those rows by guessing.

The `product-images` bucket remains public for storefront image delivery. Anonymous image writes, updates, and deletes are disabled, and authenticated uploads/changes are restricted to the caller's store-ID folder. Public image reads are not private tenant data.

Read with [REMOTE_REMEDIATION_AUDIT.md](REMOTE_REMEDIATION_AUDIT.md), which contains the full migration reconciliation, repeatable read-only SQL, and prohibited commands.

## Role Model

- `SA`: authenticated profile with `role = 'super_admin' AND status = 'approved'`. Cross-store administration must use specific RPCs; no general client-side role check grants database access.
- `O`: authenticated, approved `store_owner` whose `profiles.id = stores.owner_id` for the row's store. Existing approved `admin` profiles are legacy and must not silently become owners without a reviewed mapping.
- `M`: approved manager with a matching store membership and the needed permission. Membership schema and RPCs are absent; do not grant this access until separately designed and approved.
- `C`: approved cashier with a matching store membership and the needed permission. Same blocker as `M`.
- `Svc`: trusted database trigger/backend service only, never a browser role.
- `Anon`: no direct base-table access. Public storefront access, if retained, is through a limited read-only projection.

CRUD below is ordered `SELECT / INSERT / UPDATE / DELETE`; a role omitted from an operation is denied. Super Admin is not implicitly granted all operational data: grant cross-store reads only on rows specifically marked `SA`, and use audited RPCs for privileged mutations. `O/M/C` entries for managers/cashiers are future authorization targets only; currently only owner and approved Super Admin access can be supported. No table below should retain broad `anon` CRUD.

## Complete Live Table Inventory

The remote public schema contains the following base tables plus `purchase_expense_report` view. Every table is included; scope choices marked `DECISION` must be approved before schema changes.

| Table | Scope and ownership representation | Required keys, FKs, and indexes | Target CRUD roles (S/I/U/D) | RLS rule and app/query impact |
| --- | --- | --- | --- | --- |
| `profiles` | Identity row; `id = auth.users.id`; nullable `store_id` currently has no FK. | Keep Auth FK; add nullable `store_id -> stores.id ON DELETE SET NULL`; index store_id if queried. Store linkage must agree with `stores.owner_id`. | Self + SA / Svc trigger / self `full_name,phone` and SA approval RPC / none (Auth lifecycle only). | Self-read and approved SA read; no client role/status/store_id update. Login, approvals, stores, subscriptions pages read profiles. |
| `stores` | Tenant root; `owner_id -> profiles.id`; owner index is non-unique; zero live rows. No `status` column. | Unique `owner_id` only after duplicate-owner preflight; retain owner FK; unique id already PK. | O + SA / Auth trigger or SA RPC / O limited fields or SA RPC / none direct. | Authenticated owner or approved SA only; use `is_super_admin()`, not role-only subquery. Signup, approval, Stores and subscription selector queries. |
| `categories` | Store-owned catalog; currently no store key; self-parent relation. | `store_id -> stores`; `(id,store_id)` unique; index store_id; `(parent_id,store_id)` composite FK, nullable parent must preserve store on SET NULL. | O/M/C / O/M / O/M / O. M/C unavailable until membership design. | Approved store context; public shop must move to a published read-only projection. Categories CRUD, POS, shop, product joins. |
| `brands` | Store-owned catalog; no store key. | Store FK/index and `(id,store_id)` unique; product composite FK. | O/M/C / O/M / O/M / O. | Same tenant RLS; brands CRUD, product form joins, image uploads. App already calls missing `get_my_store_id()` in parts of this flow. |
| `suppliers` | Store-owned counterparties; purchases and supplier payments reference it. | Store FK/index, `(id,store_id)` unique; composite purchase/payment FKs. | O/M / O/M / O/M / O only if no dependent records; otherwise archive. | Approved store; suppliers CRUD, purchases, reports, dashboards. |
| `products` | Store-owned catalog/inventory root; brand/category FKs; `unit` is free text. | Store FK/index, `(id,store_id)` unique; composite brand/category FKs; add `unit_id` and composite unit/store FK after approved mapping. | O/M/C / O/M / O/M / none direct; soft archive by O/M. | Store-scoped RLS. POS, inventory, products, barcode, dashboards, returns, variants and public shop queries must be scoped or moved to view. |
| `customers` | Store-owned customer records; optional customer group; referenced by sales, returns, payments, discounts. | Store FK/index, `(id,store_id)` unique; composite group/sale/payment/discount relationships. | O/M/C / O/M/C at POS / O/M / none direct; preserve financial history. | Approved store; cashier reads and may create customer only through approved POS path. Customer list/detail, POS, reports, discount pages. |
| `employees` | Store-owned staff directory; sales may reference employee. Not Auth membership. | Store FK/index, `(id,store_id)` unique; composite sales FK. | O/M / O/M / O/M / O/M. | Approved store; remove `super_admin` as an employee-role choice (it is not Auth authorization). Employee CRUD page changes. |
| `expense_categories` | Store-owned chart of expense categories. | Store FK/index, `(id,store_id)` unique; composite expense FK. | O/M / O/M / O/M / O/M only when unused. | Approved store; expense and report category selectors. |
| `expenses` | Store-owned financial entries. | Store FK/index, `(id,store_id)` unique; composite optional category FK. | O/M / O/M / O/M / none direct; corrections via audited void/reversal. | Approved store; expense CRUD, dashboard and report reads. |
| `sales` | Store-owned financial transaction root. | Store FK/index, `(id,store_id)` unique; composite customer/employee/return references. | O/M/C / O/M/C via secured RPC / O/M via secured cancel/void RPC / none. | Require authenticated identity, approved store role, active subscription, store-scoped cart/customer/product checks, and transactional stock updates. POS, sales, dashboard, reports. |
| `sale_items` | Child of `sales`; optional product. | Store FK/index, `(id,store_id)` unique; composite `(sale_id,store_id)` and nullable `(product_id,store_id)` FKs. | O/M/C / sale RPC only / none direct / none direct. | Inherit and verify parent sale's store; POS and reports. |
| `sale_returns` | Store-owned return root linked to original sale/customer. | Store FK/index, `(id,store_id)` unique; composite nullable parent/customer FKs; preserve store_id when nullable parent is nulled. | O/M/C read / O/M via secured return RPC / O/M via secured return RPC / none. | Same approved store and subscription as sales; no current return pages observed in app query scan. |
| `sale_return_items` | Child of return; optional product. | Store FK/index; composite return/product FKs. | O/M/C read / return RPC / none direct / none direct. | Parent return store must match; app return workflow requires review. |
| `purchases` | Store-owned purchasing root; supplier FK. | Store FK/index, `(id,store_id)` unique; composite supplier/return FKs. | O/M / O/M via secured RPC / O/M via secured RPC / none direct. | Require Auth identity, approved owner/manager, active subscription, and supplier scope; purchase CRUD/list/detail, completion/cancellation. |
| `purchase_items` | Child of purchase; optional product. | Store FK/index; composite purchase/product FKs. | O/M read / purchase RPC / purchase RPC only / none direct. | Parent store and product store must match. Purchase page and inventory updates. |
| `purchase_returns` | Store-owned return root; optional purchase/supplier. | Store FK/index, `(id,store_id)` unique; composite nullable purchase/supplier FKs. | O/M read / O/M return RPC / O/M return RPC / none. | Same store; app workflow requires review. |
| `purchase_return_items` | Child of purchase return; optional product. | Store FK/index; composite return/product FKs. | O/M read / return RPC / return RPC / none. | Parent store must match. |
| `product_variants` | Child of product. | Store FK/index; composite `(product_id,store_id)` FK; unique `(id,store_id)`. | O/M/C read / O/M / O/M / O/M subject to history. | Same product store. Product editor and POS joins. |
| `units` | Store-owned per approved decision; current 16 rows have no store key and products have neither `store_id` nor `unit_id`. | Add `store_id -> stores.id` and `products.store_id`; add `products.unit_id -> units.id` with composite `(unit_id,store_id) -> units(id,store_id)`; unique `units(id,store_id)`; case-insensitive per-store unique indexes for `name` and `short_name`; store and product indexes. All after approved row mapping. | O / O / O / O when unreferenced; approved SA cross-store management. Managers/cashiers denied until membership design. | Authenticated approved owner with an active subscription; DB helper checks owner/store/subscription; RLS `USING` and `WITH CHECK` on units and products; no anon. `units` page, product forms, CSV import, stock displays require later app changes to send/read store and unit IDs. |
| `stock_movements` | Store-owned inventory ledger; product FK. | Store FK/index; composite product FK; immutable history. | O/M read / trusted inventory/POS RPC / none direct / none. | Same product/store; inventory and POS mutations via checked functions. |
| `stock_reconciliations` | Store-owned reconciliation root; product and optional variant. | Store FK/index, `(id,store_id)` unique; composite product/variant FKs. | O/M read / O/M / O/M / none. | Approved store; reconciliation page queries/writes. |
| `stock_adjustments` | Child/ledger for reconciliation and product. | Store FK/index; composite product/reconciliation FKs. | O/M read / reconciliation RPC / none direct / none. | Same store as reconciliation and product. |
| `barcode_history` | Store-owned record; optional product. | Store FK/index; composite nullable product FK. | O/M read / O/M / none / none. | Same store; barcode generate/history pages. |
| `customer_payments` | Store-owned customer financial ledger. | Store FK/index; composite customer FK and customer-financial trigger validation. | O/M/C read / O/M/C secured payment RPC / none direct / none. | Customer/store match and Auth context; dashboard/customer detail/financial functions. |
| `supplier_payments` | Store-owned supplier financial ledger. | Store FK/index; composite supplier FK. | O/M read / O/M secured RPC / none direct / none. | Supplier/store match; reports/dashboard. |
| `customer_groups` | **DECISION REQUIRED** whether store-specific or global segmentation. No direct management page found; customers reference it. | Global option: unique global ID. Tenant option: store FK/index, `(id,store_id)` unique, composite customer FK. | Global: O/M/C read / SA manage / SA manage / SA if unused. Tenant: O/M/C / O/M / O/M / O if unused. | Select one model before constraint/backfill. No direct client CRUD until approved. |
| `discount_offers` | Store-owned promotion; assignments/usages reference offer. | Store FK/index, `(id,store_id)` unique; composite offer FKs. | O/M/C read / O/M / O/M / O/M if unused. | Approved store; discounts page and sale RPCs must scope offer. |
| `customer_discount_offers` | Store-owned customer/offer assignment. | Store FK/index; composite customer/offer FKs. | O/M/C read / O/M / O/M / O/M. | Both parents must share store. Customer/discount pages. |
| `discount_offer_usage` | Store-owned immutable usage, optional customer/sale. | Store FK/index; composite offer and nullable customer/sale FKs. | O/M read / secured sale RPC / none / none. | Sale customer, offer, and store must match; checkout/history RPCs. |
| `customer_discount_history` | Store-owned financial/audit history, nullable customer/sale/item/product. | Store FK/index; composite nullable parent FKs. | O/M read / secured sale RPC / none / none. | Auth and store check in history/summary RPCs. Customer details and reports. |
| `held_orders` | Store-owned POS draft/order. | Store FK/index; validate any referenced customer/product IDs if persisted in JSON. | O/M/C / O/M/C / O/M/C / O/M/C. | RLS must check store; validate JSON members server-side. POS held-order list/save/retrieve. |
| `settings` | **DECISION REQUIRED.** Current table has no store key; UI reads/updates the first row via `limit(1)`. | Global option remains one system row and is SA-only. Store option adds store FK/index and unique `store_id`; each UI read/update selects current store. | Global: SA / SA / SA / none. Tenant: O/M read / O/M / O/M / none. | Do not tenant-enable while page addresses arbitrary first row. |
| `bank_accounts` | Store-owned financial accounts; bank transactions reference account. | Store FK/index, `(id,store_id)` unique; composite transaction FK. | O/M read / O / O / none. | Approved store; no current app page found. |
| `bank_transactions` | Child ledger of bank account. | Store FK/index; composite account FK. | O/M read / secured O/M RPC / none / none. | Account/store must match; no current app page found. |
| `cash_transactions` | Store-owned cash ledger. | Store FK/index. | O/M read / secured O/M RPC / none / none. | Approved store; no current app page found. |
| `audit_logs` | Store-aware audit entry; current only `user_id -> auth.users`, no store key. | Add optional/required store reference only after event attribution design; index `(store_id,created_at)` and `(user_id,created_at)`. | SA read / Svc only / none / none. | Current insert check permits any authenticated user to insert any non-null-user log; current read predicate checks `role=super_admin` without approved status. Replace with trusted audit writer and approved SA read. |
| `roles` | Global permission catalog; no direct app table query found. | Keep global; unique role name; no tenant FK. | SA read / backend only / backend only / none. | Remove broad anon/auth CRUD; do not use table data as a client-side authorization decision. |
| `users` | Legacy credential-like table with `password_hash`; no app query found. | No tenant migration until purpose/dependencies reviewed; retain data, do not expose. | Svc only / Svc only / Svc only / none. | Revoke anon/auth table access; investigate authentication dependencies before any other change. |
| `plans` | Global subscription catalog; active plan SELECT and SA management policies are present. | Global PK; check active/billing fields; no store FK. | O read active + SA / SA RPC / SA RPC / none (deactivate instead). | Authenticated only; current RLS helper uses approved SA. Subscription page queries plans. |
| `subscriptions` | Store-owned; `store_id -> stores`, `plan_id -> plans`. | Store FK/index; composite `(id,store_id)` unique; payments composite FK `(subscription_id,store_id)`. | O/SA read / SA RPC / SA RPC / none. | Current read policy checks approved owner/profile link; management is SA-only. App depends on missing management/active-check RPCs. |
| `payments` | Store-owned; `store_id -> stores`, `subscription_id -> subscriptions`. | Store FK/index; enforce composite subscription/store consistency. | O/SA read / SA RPC / SA RPC / none. | Current read policy checks approved owner/profile link; write policy is SA-only. Subscription page depends on missing payment RPC. |
| `purchase_expense_report` (view) | Derived view over purchases/suppliers/expenses/expense_categories; no tenant key; `security_invoker=true`. | Keep derived; base rows need store keys/composite FKs; add store filter to report RPC. | O/M read via authorized report API / none / none / none. | Currently anon/auth have view privileges; with invoker semantics base RLS controls. Replace direct view exposure with authenticated scoped query/RPC. |

`store_memberships`, `store_invitations`, and team/invitation RPCs are absent from the live schema. They are not included as existing tables and must not be referenced by signup, approval, or RLS migrations until an employee-access design is approved.

The current database has zero stores. The read-only unit snapshot returned all 16 unit IDs/labels/status and grouped product unit values; a separate query returned only product IDs and their unit strings (28 products use `pcs`). No product names or other operational rows were returned. Eight `short_name` groups are duplicates. Other operational rows were not profiled; obtain counts and relationship-integrity results before any backfill.

Repeatable read-only unit integrity check:

```sql
SELECT (SELECT count(*) FROM public.units) AS unit_count,
			 (SELECT count(*) FROM public.products) AS product_count,
			 (SELECT count(*) FROM (
					SELECT short_name FROM public.units
					GROUP BY short_name HAVING count(*) > 1
				) duplicate_codes) AS duplicate_short_name_groups,
			 (SELECT count(*) FROM public.products p
				WHERE p.unit IS NOT NULL AND btrim(p.unit) <> ''
					AND NOT EXISTS (
						SELECT 1 FROM public.units u
						WHERE lower(u.short_name) = lower(p.unit)
					)) AS products_with_unmatched_unit,
			 (SELECT count(*) FROM (
					SELECT DISTINCT p.unit FROM public.products p
					WHERE p.unit IS NOT NULL AND btrim(p.unit) <> ''
						AND NOT EXISTS (
							SELECT 1 FROM public.units u
							WHERE lower(u.short_name) = lower(p.unit)
						)
				) unmatched_values) AS distinct_unmatched_unit_values;
```

## Security-Sensitive Function Inventory

The following live public functions are `SECURITY DEFINER` (effective grants were read from the catalog). Requirements below are targets, not claims that current implementations satisfy them.

| Function | Current access / issue | Required identity and scope |
| --- | --- | --- |
| `complete_pos_sale(jsonb,uuid,numeric,text,numeric)` | `anon` and `authenticated` EXECUTE; no `auth.uid()`, store helper, or subscription check. | Authenticated O/M/C, approved profile and active subscription; derive store server-side; validate every product/customer/offer; update stock and sale atomically. Revoke anon. |
| `complete_pos_sale(jsonb,uuid,numeric,text,numeric,uuid)` | Same exposure for offer overload. | Same checks plus offer belongs to same store and customer eligibility. Revoke anon. |
| `complete_purchase_order(uuid,jsonb,numeric,numeric,numeric,text,text,text)` | `anon` and `authenticated` EXECUTE; no identity/store/subscription check. | Authenticated O/M; active subscription; supplier and every product in store; transactionally update inventory/payments. Revoke anon. |
| `cancel_sale(uuid)` | `anon` and `authenticated` EXECUTE; no identity/store/subscription check. | Authenticated O/M with store scope and policy for immutable accounting (void/reversal, not delete). Revoke anon. |
| `cancel_purchase_order(uuid)` | Same exposure. | Authenticated O/M with matching store and audited reversal; revoke anon. |
| `get_customer_discount_history(...)` | `anon` and authenticated EXECUTE; no identity/store check. | Authenticated O/M; requested customer and all returned sale rows must belong to current store. Revoke anon. |
| `get_customer_discount_summary(uuid)` | Same exposure. | Authenticated O/M; customer must be current-store customer. Revoke anon. |
| `get_authenticated_profile(uuid)` | Authenticated-only EXECUTE, SECURITY DEFINER. | Require `expected_user_id = auth.uid()` or approved SA; return only approved profile fields. Verify source before retaining. |
| `get_my_profile()` | Authenticated-only, SECURITY DEFINER with row security off. | Authenticated only; hard-bind result to `auth.uid()`. |
| `get_pending_user_approvals()` | Authenticated-only SECURITY DEFINER. | Approved SA only; no anon; current source has helper guard. |
| `get_store_owner_approvals()` | Same. | Approved SA only; no anon; current source has helper guard. |
| `set_store_owner_status(uuid,text)` | Authenticated-only SECURITY DEFINER; current function updates profile metadata but also references missing memberships and `stores.status` in role branches. | Approved SA only; target only approved eligible owner roles; update profile state/metadata; no missing schema references. Candidate repair is separate and limits to legacy `admin`/`store_owner`. |
| `is_super_admin()` | Authenticated-only SECURITY DEFINER; empty search path, row security off; checks approved role/status. | Retain as non-disclosing boolean helper; use it consistently in policies, never role-only predicates. |
| `is_approved_super_admin()` | Authenticated-only SECURITY DEFINER; delegates to `is_super_admin()`. | Keep one canonical helper after dependency review; avoid duplicate policy logic. |
| `handle_new_user_profile()` | Auth trigger target; SECURITY DEFINER, empty search path; current body creates pending `admin`, no store; executable ACL includes anon/authenticated but trigger function cannot be used as an ordinary RPC. | Trigger-only atomic creation, role `store_owner/pending`, same Auth/profile UUID, exactly one owned store, fail on incompatible or ambiguous existing rows. Revoke direct EXECUTE from client roles. Never create another Auth trigger. |
| `create_profile_for_auth_user()` | SECURITY DEFINER, anon/authenticated EXECUTE; not current Auth trigger target. | Verify dependencies; revoke public client execution or remove only in a separately reviewed migration. Do not add a trigger. |
| `refresh_customer_financials(uuid)` | SECURITY DEFINER; anon/authenticated execution is already revoked. | Trigger/internal only; must recalculate within same store. Preserve current revokes. |
| `refresh_customer_financials_from_sales()` | Trigger function; anon/authenticated execution is already revoked. | Trigger/internal only; preserve current revokes and ensure changes are store-consistent. |
| `rls_auto_enable()` | SECURITY DEFINER event-trigger function; anon/authenticated EXECUTE catalog privilege exists. | Platform event-trigger only; revoke client EXECUTE where supported and verify the event trigger remains owner-managed. |

Additional app-facing functions are security-sensitive even when not SECURITY DEFINER:

- `get_purchase_expense_report_summary(...)` is invoker-security but public/anon executable; require authenticated store scope or replace it with a checked RPC.
- `get_customer_eligible_offers(uuid,numeric)` is invoker-security and default-public executable; validate whether anonymous offer discovery is intended and never expose customer-specific data to anon.
- Missing app RPCs include `get_my_store_id()`, `has_active_subscription()`, `get_my_permissions()`, `manage_store_subscription(...)`, and `record_subscription_payment(...)`. The app must fail closed until secure implementations exist.
- Employee RPCs `get_store_team_members`, `get_store_invitations`, `create_store_invitation`, `manage_store_member`, and `revoke_store_invitation` are also missing. Do not implement invitation signup until schema and invitation-token lifecycle are approved.

All SECURITY DEFINER RPCs must use an empty/fixed safe `search_path`, schema-qualified objects, narrow `EXECUTE` grants, authenticated identity checks, and explicit tenant checks. UI routing is supplementary only. POS/purchase/discount operations additionally require subscription rules; profile/store admin RPCs do not inherit that requirement unless product policy says otherwise.

## Units Ownership Decision

Store-owned units are approved. Every unit will belong to exactly one store; same labels may recur across stores. The live schema cannot yet enforce this: `units.store_id`, `products.store_id`, and `products.unit_id` do not exist, and there are zero stores for an authoritative backfill. The SQL draft is outside the migrations directory and its DDL is commented out.

The approved ownership model uses a stable UUID relationship rather than treating unit text as an authorization key: add `products.unit_id` and enforce `(unit_id, store_id)` to `(units.id, store_id)`. Keep legacy `products.unit` during a compatibility release, map it to the canonical short name only from an approved row map, and do not authorize from text. Enforce case-insensitive trimmed uniqueness of both `name` and `short_name` within each store only after duplicates are resolved.

Do not use the current 16 rows to infer a store owner, select one duplicate unit ID, or assign a default. The live database has zero stores, so store-owned backfill cannot be inferred. New stores need an approved initial-catalog provisioning rule.

The exact row inventory, duplicate groups, product value counts, code paths, SQL draft, and mapping gates are in [UNITS_STORE_OWNERSHIP_PLAN.md](UNITS_STORE_OWNERSHIP_PLAN.md).

Other ownership decisions also needed: whether `settings` and `customer_groups` are global or store-owned; whether public visitors need product/category browsing and which fields may be exposed; whether existing `admin` profiles are store owners; and whether manager/cashier membership should be designed now or remain disabled.

## Ordered Migration Plan (No Writes Yet)

1. Confirm project reference and take a verified backup/snapshot plan. Capture full schema, grants, policies, function definitions, dependency inventory, table row counts, FK violations, and storage policy output. Do not inspect or export credential values.
2. Reconstruct migration history from deployment records plus object-level fingerprints. Ledger is absent and `migration list` showed no remote versions. Mark no local file applied solely because some objects exist. Do not use `db push`, reset, or blanket migration repair.
3. Use the approved store-owned units model; approve existing-row mappings, case-insensitive uniqueness resolution, and default catalog provisioning. Also decide settings/customer-group scope, public storefront behavior, existing `admin` mapping, employee membership scope, and allowed CRUD/financial reversal rules.
4. Prepare app compatibility changes and a staged release plan. Public pages currently read base `products`/`categories`; authenticated pages issue unscoped reads and writes. Migrate these to store-filtered queries or safe public views/RPCs before removing anonymous access.
5. Prepare additive schema migration: unique store owner key; validated profile store FK; add nullable store_id to approved tenant-owned roots/children; add `(id,store_id)` unique keys and indexes; avoid role/status or existing data rewrites beyond approved migration. Leave unresolved global tables alone.
6. Run read-only integrity profiling for every table: row counts, orphaned parents, parent/child store derivations, conflicting IDs, and duplicate natural keys. Current remote has zero stores; any existing business rows therefore have no verified store owner. Stop until an approved data map exists. Backfill roots only from an authoritative mapping; derive child store IDs from validated parents; abort on missing/multiple parents.
7. Add composite FKs as `NOT VALID` only after all backfill checks; validate them, then add NOT NULL constraints and supporting indexes in separately reviewed steps. For nullable parent deletes, null only the parent column, never `store_id`.
8. Replace database functions/RPCs: fail closed for missing subscription/permission helpers; add identity/store/subscription checks; revoke anon/PUBLIC execution from operational SECURITY DEFINER functions; keep trigger/helper grants narrow; repair approval without `stores.status` or membership references.
9. Install authenticated-only base table grants, forced tenant RLS, store owner/member policies, server-side insert/update store enforcement, and minimal public projections if approved. Replace the stores role-only branch and audit_logs role-only read predicate with approved helper checks.
10. Deploy app query/RPC changes and validate with new isolated test accounts/stores: pending approval, plan requirement, each CRUD permission, cross-store reads and writes, public visitor surface, all RPCs, storage operations, and legacy/admin Super Admin paths. Do not use production sales or accounts for negative tests.
11. Record a migration as applied only after that exact SQL's successful execution is evidenced and reviewed. Reconcile remote history one version at a time; never assume partial schema means the whole historical migration ran.

## Rollback and Safety

Prefer additive columns, indexes, and `NOT VALID` constraints before enforcing them. Keep all existing rows. If app rollout fails, roll back the app release while retaining safe additive schema; use a reviewed forward corrective migration for database changes. Do not restore broad anon CRUD as rollback. Keep private data revoked, preserve old columns/tables until dependencies and retention obligations are reviewed, and do not drop memberships (if introduced later), stores, sales, payments, or migration metadata. Revalidate policy behavior after every security migration; do not call isolation fixed until authenticated cross-store reads/writes and unauthenticated access are tested against the deployed database.
