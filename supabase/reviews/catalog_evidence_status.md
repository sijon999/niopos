# Catalog Evidence Status

Purpose: compare the existing `REMOTE_REMEDIATION_AUDIT.md` and `TENANT_SECURITY_REVIEW.md` claims with the catalog evidence already captured before preparing an implementation. This file adds no new live evidence. The companion [read-only inventory queries](remote_catalog_inventory_read_only.sql) are prepared for a later, manually authorized inspection and were **not executed**.

Status meanings:

- **VERIFIED**: the cited prior read-only output or local repository source directly supports the statement.
- **CONTRADICTED**: a positive claim is disproved by captured evidence.
- **UNVERIFIED**: prior evidence is incomplete, only partial, or a behavior test is required.

No status here means a production remediation has been applied.

## Evidence Matrix

| Finding/claim | Status | Existing evidence | Evidence still needed |
| --- | --- | --- | --- |
| Remote ref `jlujbzfyobfskfepjkdt` is accessible and project is active/name `niopos`. | VERIFIED | Prior `supabase projects list` output. | Independently confirm this is the intended production project before any future connection/write. Q01 cannot establish Supabase ref. |
| The linked ref is definitely the intended project. | UNVERIFIED | User did not supply an independent expected ref. Local `config.toml` has `project_id = "niopos-main"`, which is local CLI config and not proof of remote identity. | Owner confirmation against Supabase dashboard/organization/project. |
| Remote migration history table exists or contains the local migration versions. | CONTRADICTED | Prior `to_regclass('supabase_migrations.schema_migrations')` returned NULL; `supabase migration list` showed blank remote versions for all local versions. | Deployment records/backups may explain history, but do not mutate it during evidence phase. Q17 is a safe presence recheck. |
| Existing schema object presence identifies which complete local migration ran. | CONTRADICTED | Multiple local files partially match live objects; remote ledger is missing and some expected objects/functions are absent. | Per-file source-to-live fingerprint plus deployment evidence. Q02-Q18 provide inventory, not migration attribution. |
| Remote public schema had 42 base tables and one `purchase_expense_report` view in the prior capture. | VERIFIED | Earlier full information_schema table inventory. | Reconfirm current count/list with Q02 because catalog can change after the prior audit. |
| Remote PostgREST exposes exactly the schemas in local config (`public`, `graphql_public`). | UNVERIFIED | Local `supabase/config.toml` lists those schemas; it is not proof of remote API configuration. | Confirm the target project's API schema configuration through owner-approved dashboard evidence. |
| `units` has UUID PK only; `name`/`short_name` text; no store key, unit uniqueness, or unit FK. | VERIFIED | Prior units column/index/constraint query: `units_pkey` only. | Reconfirm with Q02-Q06; Q04/Q05 separate the constraints/FKs. |
| Products has neither `store_id` nor `unit_id`; `unit` is nullable text default `pcs`. | VERIFIED | Prior full columns and unit-specific schema result. | Reconfirm with Q03-Q05. |
| Products-to-units referential integrity exists today. | CONTRADICTED | Product `unit` is text; no `unit_id` and no FK to units. | Q04-Q05. |
| Case-insensitive matching of all product unit strings to unit short names resolves existing products. | CONTRADICTED | Prior grouped values: all 28 use `pcs`; live code is `Pc(s)`; no case-insensitive match. | Recheck with the read-only mapping query in `UNITS_STORE_OWNERSHIP_PLAN.md` if needed. No mapping is authorized. |
| The 16 live unit rows include eight duplicate label/code groups, all active. | VERIFIED | Prior read-only unit catalog rows and grouped duplicate output. | Q03/Q04/Q06 plus existing mapping report; no row dispositions approved. |
| Ownership for units/products can be inferred from `store_id` or existing store rows. | CONTRADICTED | Both tables lack store IDs and live store count is zero. | Authoritative external ownership map for each of 16 units and 28 products. Q03-Q05 can confirm schema only, not business ownership. |
| The eight duplicate unit pairs can be safely merged or a `Pc(s)` row chosen. | UNVERIFIED | IDs/labels are identical, but no ownership, external references, or canonical-row evidence was collected. | Owner-approved per-row disposition and dependency/reference inventory. No merge/choice has been made. |
| Unit RLS is enabled, but its four policies allow `true` for anon/authenticated. | VERIFIED | Prior `pg_policies` output for units and RLS flag. | Q07 confirms current policy command/roles/expressions; behavior still requires tests after approved changes. |
| Anon/authenticated have broad units privileges, including TRUNCATE, REFERENCES, and TRIGGER. | VERIFIED | Prior `information_schema.role_table_grants` output showed all seven privileges for each role. | Q08-Q12, Q09b, and Q18 recheck ACLs, effective grants, default ACLs, and role memberships. RLS does not constrain TRUNCATE. |
| Most operational tables have RLS enabled and this means cross-store access is prevented. | CONTRADICTED | Prior table-wide policy/grant audit showed broad `true` anon/auth policies on operational tables; many have no store_id. | Q02/Q07-Q12 current catalog; actual identity-based RLS behavior requires two-store tests. |
| All public-table grants/policies have been exhaustively and freshly rechecked in this session. | UNVERIFIED | Prior query returned a table-level summary and broad policy output; no query was executed in this local-only task. | Execute Q07-Q12 and Q18 only in an authorized read-only review after confirming target. |
| `users.password_hash` exists and its table is broadly accessible. | VERIFIED | Prior public-column inventory plus table policy/grant result. No credential values were read. | Q02/Q07-Q12. Dependency/privacy review must occur before remediation; do not select credential rows. |
| `purchase_expense_report` is `security_invoker=true`, but anon/auth view grants exist. | VERIFIED | Prior `pg_class.reloptions`, view definition, and grants output. | Q02/Q07-Q10 recheck; test that tenant RLS applies through the view after design. |
| Product-images bucket is public with anon/auth SELECT/INSERT/UPDATE/DELETE policies. | VERIFIED | Prior `storage.buckets` and `pg_policies` output. | Q19/Q20 recheck; define public-read vs authenticated-store-write policy before changes. |
| `public.is_super_admin()` uses approved role and status with SECURITY DEFINER, empty search path, and row security off. | VERIFIED | Prior direct `pg_get_functiondef`, settings, ACL output. | Q13 recheck full body/ACL and Q14 policy use. No proof all policies call it. |
| Stores SELECT/UPDATE policies use a role-only Super Admin branch without approval status. | VERIFIED | Prior exact `pg_policies` expressions. | Q07/Q13 recheck; test an unapproved Super Admin after policy change. |
| Audit-log read policy checks role only, and insert predicate permits any authenticated user. | VERIFIED | Prior `pg_policies` output for `audit_logs`. | Q07 recheck; test forged attribution after approved writer design. |
| Profile clients can update their own role/status/store_id. | CONTRADICTED | Captured authenticated profile column grants allow UPDATE only on `full_name` and `phone`; profile RLS is self row only. | Q10/Q11 recheck. SECURITY DEFINER paths still need separate review. |
| Exactly one `auth.users` INSERT trigger exists: `on_auth_user_created` -> `handle_new_user_profile()`, AFTER INSERT, SECURITY DEFINER, empty search path. | VERIFIED | Prior direct `pg_trigger`/`pg_get_functiondef` result; previous count was one. | Q14 rechecks complete triggers and function binding. Trigger uniqueness does not prove no other Auth events/triggers exist; Q14 enumerates them. |
| The complete public/auth/storage trigger and event-trigger inventory is known. | UNVERIFIED | Prior query was scoped to Auth INSERT or selected public tables; review documents explicitly mark full inventory missing. | Q14 and Q15; inspect every trigger function, binding, timing/event, `tgenabled`, security settings, and ACL. |
| Current Auth handler creates pending `admin` profile and no store; function body uses conflict-do-nothing. | VERIFIED | Prior full `pg_get_functiondef` output. | Q13/Q14 recheck; determine all call dependencies before a future replacement. |
| Current `set_store_owner_status()` references absent `store_memberships` and `stores.status` branches. | VERIFIED | Prior direct function definition plus `to_regclass` absence for membership table and `information_schema` stores columns. | Q03/Q04/Q13 and Q14; a function body can refer to absent relations without being invoked. No RPC execution performed. |
| SECURITY DEFINER POS/purchase/cancel/discount functions are anon-executable and lack captured auth/store/subscription checks. | VERIFIED for the listed functions | Prior effective EXECUTE ACLs plus source-body token scan for `auth.uid`, `get_my_store_id`, `has_active_subscription`, and `store_id`, all absent on the listed functions. | Q13 full current definitions, dynamic SQL/manual branch analysis, dependencies, nested helpers, role membership, and behavior tests. Token absence alone is not a full proof of no equivalent authorization. |
| Every current SECURITY DEFINER function and dynamic SQL path has been inspected. | UNVERIFIED | Prior inventory identified names/grants, but full source for every function and every non-system schema was not captured. | Q13 returns full definitions and source for all non-system definer/client-executable routines; manually inspect EXECUTE/format/dynamic calls and dependencies. |
| `get_my_store_id`, `has_active_subscription`, `get_my_permissions`, subscription-management RPCs, and membership/invitation RPCs are present remotely. | CONTRADICTED | Prior `to_regprocedure`/public function inventory showed them absent; membership/invitation tables also absent. | Q02/Q13 recheck. Do not reference them in policies until evidence shows they exist. |
| Refresh functions have anon/auth execution revoked and are trigger-only in the current design. | VERIFIED as ACL evidence | Prior effective privilege output showed both `refresh_customer_financials` functions deny anon/auth. Trigger bindings were only partially queried. | Q13-Q15 confirm current ACLs and exact trigger attachment list. |
| Trigger inventory includes `sale_returns_refresh_customer_financials`. | UNVERIFIED | Local migration source declares it; previous remote trigger query omitted `sale_returns`. | Q14 current remote trigger list; local migration source is not live evidence. |
| `rls_auto_enable()` is an event-trigger function and has client EXECUTE privilege. | VERIFIED for function ACL/type; event binding is UNVERIFIED | Prior public routine inventory showed event_trigger return and anon/auth execute; event-trigger catalog rows were not queried. | Q13-Q15 confirm function source/ACL and actual `pg_event_trigger` binding. |
| Cross-store reads/writes are denied in live behavior. | UNVERIFIED | No isolated two-store behavioral test has been run; no stores exist. | Create isolated test project/stores only after approved migrations; execute the test matrix in `TENANT_SECURITY_REVIEW.md`. |
| Signup, duplicate unit provisioning, or migration backfill is retry-safe in production. | UNVERIFIED | Draft SQL exists locally, is unexecuted, and mapping/defaults are unresolved. | Reviewed SQL, staging execution, concurrency/retry tests, then approved deployment evidence. |

## Evidence Needed to Close Gaps

The exact prepared inventory is `remote_catalog_inventory_read_only.sql`, Q01-Q21 (including Q09b default ACLs). It has not been executed. In particular:

- Q02-Q06: confirm every relation, view definition, column, constraint/FK action, and index.
- Q07-Q12 and Q18: confirm RLS/policy overlap, effective schema/table/column/sequence grants, default ACLs, and role memberships.
- Q13: inspect all non-system SECURITY DEFINER and client/service-executable functions, including exact ACL, search path, body, dynamic SQL, and auth/store/subscription enforcement.
- Q14-Q15: complete trigger and event-trigger bindings, including public/auth/storage and exact trigger functions.
- Q16: capture all custom enum/domain types and values that may be migration prerequisites.
- Q17: safely check migration-ledger relation existence only. If absent, do not select from or create it.
- Q19-Q20: verify storage relation presence, bucket visibility, and policies; run Q20 only when Q19 reports the relations exist.
- Q21: inspect API-role SUPERUSER/BYPASSRLS and login attributes.

For project identity, compare `supabase projects list` output to the owner-confirmed target outside this SQL file. The local `supabase/config.toml` value `project_id = "niopos-main"` is not proof of the intended remote project. Do not use the inventory file with a write-capable workflow or paste any DDL into the SQL editor.
