# NioPOS Prioritized Tenant-Security Review

Mode: local review only. This artifact consolidates the previously captured read-only audit; no remote query or database change was made for this review. It does not claim tenant isolation is implemented or verified. The source evidence is in [REMOTE_REMEDIATION_AUDIT.md](REMOTE_REMEDIATION_AUDIT.md), [TENANT_AUTHORIZATION_DESIGN.md](TENANT_AUTHORIZATION_DESIGN.md), [UNITS_STORE_OWNERSHIP_PLAN.md](UNITS_STORE_OWNERSHIP_PLAN.md), and the non-executable [store-owned units draft](drafts/store_owned_units.sql).
The exhaustive query checklist and evidence labels are in [catalog_evidence_status.md](reviews/catalog_evidence_status.md), with prepared SELECT-only SQL in [remote_catalog_inventory_read_only.sql](reviews/remote_catalog_inventory_read_only.sql).

This review did not run the query file or connect to Supabase.

## Evidence Boundaries

- Prior CLI/catalog inspection identified project ref `jlujbzfyobfskfepjkdt` as active project `niopos`; no independent expected reference was provided.
- The migration ledger table is absent; `supabase migration list` showed no remote version for any local migration. Object presence is not proof a complete migration ran.
- The captured public catalog has 42 base tables and one view (`purchase_expense_report`). `store_memberships`, `store_invitations`, and team/invitation RPCs are absent.
- The captured schema has zero stores; four profiles (three approved legacy `admin`, one approved `super_admin`); no approved `store_owner` rows.
- All captured data findings below are from read-only evidence. No cross-store behavior test, Auth signup test, or policy-negative test has run.
- A complete public-trigger inventory and a fresh definition/grant snapshot of all functions were not captured. The trigger/function entries below distinguish verified entries from evidence gaps. Re-run the read-only catalog queries in the linked audit before implementation.

## Priority Findings

| Priority | Finding | Evidence and consequence | Required gate |
| --- | --- | --- | --- |
| P0 | Anonymous and authenticated open CRUD on operational data | Most POS, finance, inventory, customer, supplier, discount, and support tables have `true` policies and broad grants. Unauthorized users can cross tenant boundaries; several tables include anon TRUNCATE privileges, which RLS does not guard. | Revoke PUBLIC/anon privileges, use authenticated least-privilege grants, forced RLS, and role/store predicates. Test each verb as anon and owner A/B. |
| P0 | Anon-executable SECURITY DEFINER transaction RPCs | POS completion (both overloads), purchase completion, sale/purchase cancellation, and customer discount summary/history are executable by anon and have no captured `auth.uid()`, store helper, or subscription check. | Replace with identity-derived store checks, approval/subscription gates, parent/store validation, and narrowly granted execution. Test direct RPC calls, not only the UI. |
| P0 | `users.password_hash` exposed by table grants/policy | Legacy `users` table has broad anon/auth access and `password_hash`; application scan found no direct `users` query. | Revoke Data API access immediately in a reviewed migration; inventory dependencies without reading credential values. Never drop data as part of remediation. |
| P0 | No store ownership keys on core POS tables | Products, sales, purchase, customer, supplier, expense, catalog, stock, discount, return, and child tables have no `store_id`; current stores count is zero. | Establish a row-level ownership map first. Add root keys and composite parent FKs; abort on ambiguous/orphaned rows. |
| P0 | Migration history is absent | No `supabase_migrations.schema_migrations` table and no remote version evidence. Historical migrations contain incompatible assumptions and a hard-coded tenant owner. | Reconstruct from deployment evidence and schema fingerprints. Do not push, reset, repair, or mark versions en masse. |
| P1 | Super Admin policy inconsistency | `is_super_admin()` correctly checks approved role/status, but stores SELECT/UPDATE and audit-log SELECT policies use role-only checks. | Use the approved helper in every cross-store policy/RPC; test approved vs pending/rejected/suspended Super Admin. |
| P1 | Current approval RPC references absent objects | `set_store_owner_status` references absent memberships and nonexistent `stores.status` for some roles. | Replace separately with a guarded profile-only RPC; test only eligible owner profiles; do not invent employee schema. |
| P1 | View and storage expose public surfaces | `purchase_expense_report` is security-invoker but has anon/auth grants; base policies are open. `product-images` is public with anon read/insert/update/delete policies. | Keep public access only through approved read-only fields; revoke anonymous writes/deletes; test view and storage independently. |
| P1 | Subscription and permission RPCs missing | UI calls missing `get_my_store_id`, `has_active_subscription`, `get_my_permissions`, `manage_store_subscription`, and `record_subscription_payment`. | Fail closed. Implement and test DB checks before POS access. |
| P1 | Units rows and products cannot be mapped | 16 units have eight duplicate label/code pairs; 28 products have `unit='pcs'`, not matching `Pc(s)`; no store/unit keys exist and there are zero stores. | No `unit_id` backfill or duplicate choice without an owner-approved mapping. |
| P2 | App-side authorization/query scope is incomplete | Product, unit, POS, import, purchase, report, and admin pages issue direct client queries; client routing cannot replace RLS/RPC checks. | Update app only in a separately authorized task after database contracts are approved. |

## Table, View, and Storage Inventory

Access shorthand:

- **OPEN CRUD**: captured RLS policies allow `true` for `anon` and `authenticated`; corresponding broad table privileges exist. This is current behavior, not desired behavior.
- **STORE POLICY**: current store policies are scoped by owner ID, but the Super Admin branch checks role only and grants exist broadly to anon; RLS predicate presently filters anonymous calls, but privilege grants should still be removed.
- **AUTH-OWNER-SELECT**: authenticated owner/Super Admin reads only; writes are Super Admin policy/RPC only, where noted.
- **PROFILE**: authenticated self/Super Admin RLS, column-level profile update grants limited to `full_name` and `phone`.
- **SA-ONLY**: authenticated grants plus Super Admin helper policy.

Desired store checks always derive caller identity from `auth.uid()`, require the approved profile and correct active store membership, and reject client-supplied mismatched `store_id`. Managers/cashiers remain denied until membership schema and permissions are approved. The active-subscription requirement applies to operational access per current app gate; exceptions require explicit product approval.

| Object | Captured current access | Ownership enforcement and role checks required | Required negative/positive test |
| --- | --- | --- | --- |
| `profiles` | PROFILE; authenticated UPDATE only on `full_name`, `phone`. | Self-read; approved SA read. Auth ID must equal profile ID. No client role/status/store assignment. | A reads own only; A cannot update role/status/store_id; pending SA cannot read all users. |
| `stores` | STORE POLICY; broad anon column grants; owner predicate and role-only SA predicate. | Owner authenticated and approved; SA through `is_super_admin()` only. Unique owner relationship after duplicate check. | Owner A cannot read/update B's store; role=SA with unapproved status denied. |
| `categories` | OPEN CRUD. | Per-store key, self-parent composite FK, approved store RLS. Public reads only via approved projection. | A cannot list/create/move/update/delete B's categories; anon denied. |
| `brands` | OPEN CRUD. | Per-store key and product composite FK; owner/authorized staff only. | A cannot read/write B's brand or reference it from A's product. |
| `suppliers` | OPEN CRUD. | Per-store key; composite purchase/payment FKs. | Cross-store supplier reads/writes and purchase references denied. |
| `products` | OPEN CRUD. `store_id` and `unit_id` absent. | Per-store key; composite brand/category/unit FKs; owner/authorized staff; no hard delete of historical products. | A cannot read/write B products; A cannot assign B unit/category/brand; anon denied. |
| `customers` | OPEN CRUD. | Per-store key; composite group/sale/payment/discount FKs. | Cross-store customer access and forged customer IDs in RPCs denied. |
| `employees` | OPEN CRUD; legacy table, not Auth membership. | Per-store row scope; never treat employee `role='super_admin'` as Auth authorization. | A cannot read/write B employee; employee row cannot grant Super Admin. |
| `expense_categories` | OPEN CRUD. | Per-store key and composite expense FK. | A cannot use B category for expense. |
| `expenses` | OPEN CRUD. | Per-store financial record; authenticated owner/staff; corrections should be audited, not deletion. | Cross-store read/write denied; anon denied. |
| `sales` | OPEN CRUD; POS RPCs separately exposed. | Store key; authenticated approved role; active subscription; RPC derives store and validates every referenced row. | A cannot read/write B sale; anonymous and pending RPC calls rejected without side effects. |
| `sale_items` | OPEN CRUD. | Store key; composite sale/product FKs; writes through secured sale RPC. | A cannot attach item to B sale/product; direct writes denied. |
| `sale_returns` | OPEN CRUD. | Store key; composite nullable original sale/customer FKs; secured return RPC. | Cross-store return references rejected; original store persists if nullable parent is cleared. |
| `sale_return_items` | OPEN CRUD. | Store key; composite return/product FKs. | A cannot add item to B return/product. |
| `purchases` | OPEN CRUD; completion/cancel RPCs anon-executable. | Store key; active subscription; approved owner/authorized staff; supplier in same store; RPC transaction. | Direct anon RPC denied; A cannot complete/cancel B purchase or use B supplier/product. |
| `purchase_items` | OPEN CRUD. | Store key; composite purchase/product FKs; writes through secured purchase RPC. | A cannot attach B product to A purchase or write B purchase item. |
| `purchase_returns` | OPEN CRUD. | Store key; composite optional purchase/supplier FKs; audited return RPC. | Cross-store references denied. |
| `purchase_return_items` | OPEN CRUD. | Store key; composite return/product FKs. | Cross-store child row rejected. |
| `product_variants` | OPEN CRUD. | Store key; composite product FK. | A cannot query or modify B's variant or attach variant to another store's product. |
| `units` | OPEN CRUD plus anon TRUNCATE grant. | Approved store-owned design; per-store uniqueness; database check ties caller to `units.store_id`; product composite unit/store FK. Approved SA only via helper. | A cannot read/update/delete/assign B unit; A cannot truncate; same code across stores allowed, same-store duplicate rejected. |
| `stock_movements` | OPEN CRUD. | Store key; composite product FK; immutable, written by secured inventory/POS RPC. | A cannot read/write B movement or create movement for B product. |
| `stock_reconciliations` | OPEN CRUD. | Store key; composite product/variant FKs; approved inventory permission. | A cannot view/create reconciliation for B. |
| `stock_adjustments` | OPEN CRUD. | Store key; composite product/reconciliation FKs; write through reconciliation RPC. | Cross-store adjustment and direct mutation denied. |
| `barcode_history` | OPEN CRUD. | Store key; composite nullable product FK. | A cannot read/write B history or attach B product. |
| `customer_payments` | OPEN CRUD; refresh trigger exists. | Store key; composite customer FK; approved payment RPC; trigger preserves same-store totals. | Cross-store customer payment denied; trigger cannot update other tenant totals. |
| `supplier_payments` | OPEN CRUD. | Store key; composite supplier FK; authorized payment RPC. | Cross-store supplier payment denied. |
| `customer_groups` | OPEN CRUD; ownership is undecided. | Owner must choose global catalog vs store-owned; then enforce matching FK and role policy. | Until decision, deny client writes and verify no cross-store group/customer association. |
| `discount_offers` | OPEN CRUD; discount RPCs exposed. | Store key; approved store; composite offer/customer/sale references. | A cannot read/manage B offer or use B offer in sale. |
| `customer_discount_offers` | OPEN CRUD. | Store key; composite customer/offer FKs. | Cross-store assignment denied. |
| `discount_offer_usage` | OPEN CRUD. | Store key; immutable; composite offer/customer/sale FKs; sale RPC only. | A cannot read/write B usage or create cross-store usage. |
| `customer_discount_history` | OPEN CRUD; SECURITY DEFINER history RPCs anon-executable. | Store key; composite references; RPC requires authenticated store context. | Anon and A requesting B customer history denied. |
| `held_orders` | OPEN CRUD. | Store key; validate IDs inside persisted JSON server-side. | A cannot read/restore B held order or submit B references in JSON. |
| `settings` | OPEN CRUD; ownership undecided; UI uses first row. | Owner must choose global vs store-owned; change page from arbitrary `limit(1)` to scoped lookup. | A cannot alter B settings; global mode only SA write. |
| `bank_accounts` | OPEN CRUD. | Store key; composite bank transaction FK; authorized finance role. | A cannot access B account. |
| `bank_transactions` | OPEN CRUD. | Store key; composite account FK; immutable authorized write RPC. | Cross-store transaction/account denied. |
| `cash_transactions` | OPEN CRUD. | Store key; authorized finance/POS RPC. | A cannot access B transaction; direct anonymous writes denied. |
| `audit_logs` | Broad grants; authenticated insert check accepts any authenticated user; read policy checks SA role only, not approved status. | Trusted server/trigger writes; store context; approved SA reads only; no client update/delete. | User cannot forge another user's log; unapproved SA denied; no cross-store log reads. |
| `roles` | OPEN CRUD. | Global permission metadata; server-owned writes; no client authorization from this table. | Anon/auth cannot modify permissions or grant roles. |
| `users` | OPEN CRUD; contains `password_hash`; no app query found. | Revoke Data API access; keep private pending dependency/retention review. | Anon/auth SELECT/CRUD denied; no credential row values fetched. |
| `plans` | SA-ONLY: authenticated; active-plan SELECT or SA; admin management via helper. | Global catalog; approved SA manages; owners read only active plan fields if required. | Owner cannot alter plan; pending SA cannot manage. |
| `subscriptions` | AUTH-OWNER-SELECT plus SA management; current helpers/policies exist. | Store FK; approved owner and correct `profiles.store_id`; SA RPC manages; active/trial validity. | A cannot read/change B subscription; pending owner denied; expired subscription blocks operational RPCs. |
| `payments` | AUTH-OWNER-SELECT plus SA management; current helper/policies exist. | Store/subscription composite integrity; owner read, SA RPC write; no anon. | A cannot access B payment; forged subscription/store pair rejected. |
| `purchase_expense_report` view | `security_invoker=true`, but anon/auth view grants; current base tables are open. | Keep invoker semantics; tenant predicates from base RLS; preferably scoped authorized report RPC/view. | A report excludes B; anon denied; view must not bypass base RLS. |
| `storage.objects` / `product-images` | Public bucket; anon/auth SELECT/INSERT/UPDATE/DELETE policy on bucket. | Decide public image read separately; authenticated owner writes only store-prefixed path with DB authorization; anon write/delete denied. | A cannot overwrite/delete B image; anon upload/delete denied; approved public image read only if approved. |

`store_memberships`, `store_invitations`, and five employee-team RPCs are absent, so no manager/cashier grants or membership tests can pass until a separate design and migration are approved.

## RPC, Function, and Trigger Inventory

| Priority / object | Captured current access or behavior | Required checks and remediation | Test |
| --- | --- | --- | --- |
| P0 `complete_pos_sale(jsonb,uuid,numeric,text,numeric)` | SECURITY DEFINER; anon and authenticated EXECUTE; no captured `auth.uid()`, store or subscription checks; `search_path=public`. | Revoke anon/PUBLIC; fixed empty search path and qualified names; require approved O/M/C + active subscription; derive store from identity; validate cart products, customer and stock; single transaction. | Anon, pending, unapproved, unsubscribed, foreign product/customer and foreign store calls all fail without writes. |
| P0 `complete_pos_sale(jsonb,uuid,numeric,text,numeric,uuid)` | Same, offer overload. | Same plus offer belongs to same store/customer and is eligible. | Foreign/inactive/expired offer fails; valid own-store sale succeeds in staging. |
| P0 `complete_purchase_order(...)` | SECURITY DEFINER; anon/auth EXECUTE; no captured identity/store/subscription checks; `search_path=public`. | Revoke anon; O/M approved and active subscription; derive store; validate supplier/products, totals and stock; transaction. | Anon/pending/B supplier/product rejected; own valid order works in staging. |
| P0 `cancel_sale(uuid)` | SECURITY DEFINER; anon/auth EXECUTE; no store/auth/subscription checks. | Revoke anon; authorized store role; audited void/reversal and immutable financial history. | A cannot cancel B; anon denied; repeat cancellation idempotency verified. |
| P0 `cancel_purchase_order(uuid)` | Same exposure. | Revoke anon; authorized store scope; stock/payments reversal policy. | A cannot cancel B; repeated or completed order follows approved behavior. |
| P0 `get_customer_discount_history(...)` | SECURITY DEFINER; anon/auth EXECUTE; no auth/store check. | Revoke anon; approved store; constrain customer and returned sales to caller's store. | Anon/B-customer request denied; A result contains no B data. |
| P0 `get_customer_discount_summary(uuid)` | Same exposure. | Revoke anon; authenticated customer/store ownership check. | Foreign customer and anon rejected. |
| P1 `get_purchase_expense_report_summary(...)` | Invoker security; default/PUBLIC execution; no captured tenant filter. | Revoke anon/PUBLIC; require authenticated scope; filter every base table by current store. | A report excludes B; anon rejected. |
| P1 `get_customer_eligible_offers(uuid,numeric)` | Invoker security; default/PUBLIC execution. | Decide public eligibility use; never return customer-specific info to anon; check customer/store before returning offers. | Anonymous generic result only if approved; customer/offer cross-store denied. |
| P1 `set_store_owner_status(uuid,text)` | SECURITY DEFINER; authenticated only; current body references absent memberships and `stores.status` in branches. | Approved SA helper; owner-role allowlist; update profile metadata only unless schema is approved; no missing objects. | Pending/ordinary caller denied; approved SA updates only eligible target; no store-status side effects. |
| P1 `get_pending_user_approvals()` | SECURITY DEFINER, auth-only; current helper guard. | Keep approved-SA check and minimal fields. | Pending/rejected SA denied; approved SA sees pending only. |
| P1 `get_store_owner_approvals()` | SECURITY DEFINER, auth-only; current helper guard. | Approved-SA check, role/status filter, no broad listing. | Non-SA denied. |
| P1 `get_authenticated_profile(uuid)` | SECURITY DEFINER, auth-only, row security off. | Bind expected ID to `auth.uid()` or approved SA; narrow columns. | A cannot request B profile. |
| P1 `get_my_profile()` | SECURITY DEFINER, auth-only, row security off. | Return only `auth.uid()` profile. | Self only; no unauthenticated access. |
| P1 `handle_new_user_profile()` | Current Auth target; SECURITY DEFINER, empty path; creates pending `admin`, no store; broad execute ACL. | Preserve sole existing trigger; create role/pending profile and store atomically; retry-safe; no invite objects; no direct client execute. Provision units only after approved catalog and map. | New test signup yields exactly one profile/store/unit seed version; retries do not duplicate; ordinary signup never gains SA. |
| P1 `create_profile_for_auth_user()` | SECURITY DEFINER; anon/auth EXECUTE; not current Auth trigger target. | Inventory dependencies; revoke direct execution; do not attach another trigger. | Client direct RPC denied; existing Auth flow unaffected. |
| P1 `is_super_admin()` | SECURITY DEFINER, auth-only, empty path/row_security off; checks approved role/status. | Canonical helper for all SA policies/RPCs. | Approved returns true; pending/rejected/suspended role=SA returns false. |
| P1 `is_approved_super_admin()` | SECURITY DEFINER; delegates to `is_super_admin()`. | Remove duplicate helper only after dependencies verified; preserve approved predicate. | Same role/status matrix. |
| P1 `refresh_customer_financials(uuid)` | SECURITY DEFINER; client execute revoked. | Internal trigger only; validate same-store input through calling transaction. | Direct client call denied; trigger updates only same store totals. |
| P1 `refresh_customer_financials_from_sales()` | SECURITY DEFINER trigger function; client execute revoked. | Trigger only; preserve grants and store-aware parent links. | Direct call denied; sales/payment trigger cannot affect another store. |
| P1 `rls_auto_enable()` | SECURITY DEFINER event-trigger return type; anon/auth execute privilege observed. Actual event-trigger row/name was not captured. | Re-read `pg_event_trigger`; restrict execution to owner/platform context; don't alter event trigger until dependency verified. | Client cannot invoke; DDL event still maintains intended RLS. |
| P2 `set_subscription_updated_at()` | Trigger function used by plans/subscriptions update triggers; not SECURITY DEFINER. | Trigger-only, no client execute; no tenant writes of its own. | Direct call denied; normal update only timestamps target row. |
| P2 `update_updated_at_column()` | Non-SECURITY DEFINER trigger function exists; its complete trigger attachment list was not in the captured inventory. | Re-read all trigger bindings; keep trigger-only and fixed/qualified search path where compatible; it must not broaden row access. | Direct function call denied; updates only the current row timestamp. |
| P2 `refresh_customer_financials_from_sales()` triggers | Captured triggers on sales and customer_payments: after insert/update/delete. | Preserve after rewrites and test for tenant-scoped totals. | A's sale/payment does not affect B's totals. |
| P2 `on_auth_user_created` | Verified sole `auth.users` AFTER INSERT trigger calling `handle_new_user_profile()`. | Preserve exactly one trigger; change target function in place only after precondition review. | Catalog check confirms one trigger and expected function; signup atomic rollback on failure. |
| P2 plan/subscription updated-at triggers | Captured `plans_set_updated_at` and `subscriptions_set_updated_at`. | Preserve only after reviewing table policies and RPC changes. | timestamp trigger updates only targeted row. |

The earlier trigger query was scoped to auth.users and selected public tables. It did not establish a complete public-table trigger inventory. Before implementation, run read-only scans of `pg_trigger` and `pg_event_trigger`, including function body, ACL, `prosecdef`, `proconfig`, trigger definition, event, and table for every returned object.

## Two-Store Security Test Plan

Run only in an isolated non-production Supabase project after approved migrations and app changes. Create stores A and B with separate approved owners; seed one same-code unit per store with distinct IDs; use distinct products and subscriptions. Employee tests are conditional on a separately approved membership design. Never use production sales or accounts.

| Test | Actor/action | Expected result |
| --- | --- | --- |
| Baseline ownership | Owner A queries units/products with own auth; Owner B does same. | Each sees only own rows; equal labels across stores are valid but IDs/store IDs differ. |
| Cross-store read | A selects B unit/product by ID, filters by B `store_id`, joins via product unit. | Zero rows or authorization error; no data leaked. |
| Cross-store create | A inserts unit/product with B `store_id`; A inserts product with B `unit_id` and own store; anonymous attempts either. | RLS denies forged store; composite FK rejects mismatched unit/store; anon denied. No row is created. |
| Cross-store mutation | A updates/deletes B's unit/product by ID; A changes own unit `store_id` to B; A changes product `unit_id` to B's unit. | Updates/deletes affect zero rows or fail; changed ownership fails `WITH CHECK`/FK; B rows unchanged. |
| Duplicates | Create same normalized code in A and B; create same code twice in A with casing/whitespace variants. | A/B duplicate accepted; same-store normalized duplicate rejected by unique index. |
| CRUD/truncate grants | Anonymous and ordinary authenticated caller attempt each granted verb; inspect effective role privileges. | No anon base-table access. No TRUNCATE privilege; RLS cannot be used as its protection. Owner permitted only approved own-store CRUD. |
| Unit deletion | Delete unreferenced own unit; attempt delete referenced unit; try deleting B unit. | Own unused delete succeeds if role allows; referenced unit blocked by `ON DELETE RESTRICT`; B delete denied. |
| Approval state | Try as pending, rejected, suspended owner and Super Admin. | All denied. Approved owner may access only after all configured account/store conditions pass. |
| Subscription | Approved owner with no subscription, expired, inactive, and active subscription. | Unit/product access follows explicitly approved subscription rule; operational RPCs fail closed without active/trial subscription. |
| Super Admin | Approved SA queries/acts cross-store; toggle only in test data to pending/rejected/suspended. | Approved SA receives only explicitly authorized cross-store access; unapproved status loses it even if role remains `super_admin`. |
| RPC authorization | Call each POS, purchase, cancel, discount, approval, subscription, and profile RPC as anon, A, B, pending user, and approved SA. Forge target IDs/store args. | Anon/unauthorized/foreign IDs rejected without side effects; own scoped operations work; approved SA only gets documented admin operations. |
| Duplicate provisioning | Call same store/catalog version twice; call concurrently; call same provision keys with changed seed payload; edit a unit between calls. | Exactly one row per `(store_id,provision_key)` and one marker; same version is no-op and does not overwrite customization; inconsistent pre-marker state aborts; two stores get distinct unit IDs. |
| Signup and store creation | New account signup, retry after transactional failure, authorized SA-created store. | One profile/store; no duplicate trigger; provisioning is same transaction; no store/unit is assigned from `pcs` text. |
| Dependent workflows | CSV import, product form, barcode, inventory, POS and purchase selection/display; report/view; image paths. | Only same-store units/products are selectable; import rejects unknown/ambiguous values; historical quantities preserved. |
| Public surface | Anonymous base-table/view/storage read and write attempts. | No operational base-table access; only separately approved public projection/image reads; no anonymous writes or deletes. |

Capture expected and actual status codes/counts, function definitions, ACLs, policies, grants, FK/index definitions, and before/after row counts. Do not call a test passed from client UI behavior alone.

## Migration-History Reconciliation Checklist

1. Confirm target project ref independently; do not rely only on local `.temp/project-ref` or project name.
2. Preserve the current remote snapshot and obtain deployment records, SQL editor history/change logs, backups, CI logs, and any prior `migration list` output. The ledger is currently absent; do not create or repair it in this review.
3. Produce a per-file manifest of each local migration: objects changed, data effects, policies/grants, function definitions, triggers, preconditions, and destructive/backfill behavior.
4. Collect a complete read-only remote schema fingerprint: columns/defaults/nullability, constraints/FKs/indexes, RLS flags/policies, effective grants, all routines/ACLs/search paths/security definer settings, all triggers/event triggers, views, storage policies, and migration-related schemas.
5. Compare each migration against evidence and classify as `exactly evidenced`, `partially reflected`, `not reflected`, or `indeterminate`. Object coincidence alone is partial evidence; seed/data migrations require deployment evidence or safe aggregate/data comparison.
6. For partial/indeterminate history, identify unversioned/manual changes and dependencies. Do not run historical files over a live schema. Prepare forward-only, idempotent migrations with exact preconditions.
7. Have a second reviewer verify the manifest and migration order. Record only versions whose exact SQL execution is evidenced. Do not use `supabase migration repair`, `supabase db push`, reset, or bulk marking in this procedure.
8. After a separately approved production change, retain exact SQL hash, operator, target ref, execution result, and resulting schema fingerprint; only then decide how to record that specific version.

## Owner Decisions Still Required

1. **Target project and test environment:** confirm the production ref and provide/approve an isolated staging project for behavior tests.
2. **Authoritative row map:** identify which real store owns each existing unit and product. Current remote has zero stores and no ownership keys, so external records/owner evidence are required. Do not infer from unit text.
3. **Duplicate dispositions:** say whether the two identical unit rows per label are separate store catalogs or same-store duplicates; if same-store, explicitly approve canonical/inactive/alias handling. No ID is selected here.
4. **Product mapping:** confirm whether all `pcs` products mean Piece/`Pc(s)` and provide a specific store and unit ID for each product. No `unit_id` is filled in.
5. **New-store catalog:** approve no defaults vs a v1 catalog; if seeded, approve exact names/codes/descriptions and provisioning behavior. The historic eight rows are candidates only.
6. **Unit constraints:** approve case-insensitive trimmed `short_name` uniqueness and whether display `name` must also be unique per store. Decide alias semantics if multiple units share a display name.
7. **Authorization policy:** confirm unit management requires active subscription; confirm whether only owners manage units or approved managers with inventory permission may do so; confirm approved Super Admin cross-store CRUD scope.
8. **Related scope:** decide whether settings and customer groups are global or store-owned, whether legacy `admin` profiles map to stores, and whether historical transaction rows need unit snapshots.
9. **Migration baseline:** approve an evidence-based reconciliation investigation, not history mutation. Keep employee invitations out of scope until schema/API design is approved.

## Local Review Checks

This review changes documentation only. No SQL, remote queries, tests, or application commands were run in this task. Prior audit artifacts contain earlier local typecheck/lint/build results; those do not test database behavior. No tenant isolation, RPC authorization, provisioning behavior, migration history, or cross-store access is implemented or verified.
