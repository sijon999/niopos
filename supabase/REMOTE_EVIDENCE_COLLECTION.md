# NioPOS Remote Evidence Collection Runbook

Status: **read-only inspection executed** against the operator-confirmed
Production project `jlujbzfyobfskfepjkdt` using Supabase MCP on 2026-10-26.
The catalog queries and supplemental `SELECT`s below were run; no remote
write, migration, application RPC, or deployment was performed. This runbook
also records the evidence needed for a later complete reconciliation.

## Captured read-only evidence (2026-10-26)

- **Target:** Supabase MCP reports project `niopos`, ref
  `jlujbzfyobfskfepjkdt`, active/healthy, PostgreSQL 17.11; the operator
  confirmed this is Production. Q01 returned database `postgres` and role
  `postgres`. The role has `BYPASSRLS`, so this metadata/admin inspection is
  not an application-role RLS behavior test. No credentials were read.
- **Migration state:** Supabase MCP `list_migrations` returned an empty list.
  Q17 returned `NULL` for
  `supabase_migrations.schema_migrations`; a direct read failed because the
  relation does not exist. The remote migration baseline remains unresolved;
  no version was marked applied.
- **Schema:** 42 public base tables and one view were inventoried. RLS is
  enabled on all 42 public base tables, but forced on none. The targeted
  ownership columns query found `store_id` only on `payments`, `profiles`,
  and `subscriptions`; no public table has `unit_id`. `settings` and
  `customer_groups` have no `store_id`.
- **Constraints and indexes:** The public schema has 13 CHECK, 46 FOREIGN
  KEY, 42 PRIMARY KEY, and 5 UNIQUE constraints; all reported constraints
  were validated. Public index inventory returned 98 indexes, all valid and
  ready, including 50 unique indexes. No unique owner constraint exists on
  `stores.owner_id`; there is no per-store uniqueness constraint for
  `settings` or `customer_groups`.
- **Authorization:** Catalog policies include broad `anon`/`authenticated`
  CRUD policies on 36 public tables. RLS being enabled does not make these
  policies tenant-safe. Effective grants include anon/authenticated
  `TRUNCATE` on `products`, `units`, `settings`, `customer_groups`, and
  `stores`; `TRUNCATE` is not constrained by RLS. Ten public SECURITY
  DEFINER routines were confirmed executable by `anon`, including purchase
  and POS operations. `audit_logs` exists and has broad direct table
  privileges; its insert policy permits authenticated users to supply
  arbitrary row content under a weak check. Do not treat it as trusted
  server-side audit evidence.
- **Other catalog coverage:** Read-only catalog summaries covered schema,
  relation, column, sequence, function, and default ACLs; role memberships
  and role attributes; user-defined types; and event triggers. The initial
  ACL aggregate queries had a SQL grouping error; corrected SELECT-only
  versions completed. No catalog query changed data or privileges.
- **Auth:** One enabled non-internal `auth.users` trigger,
  `on_auth_user_created`, binds to `public.handle_new_user_profile()`.
  The function is SECURITY DEFINER with an empty `search_path`; its effective
  execute ACL includes `PUBLIC`, `anon`, and `authenticated`. The inspected
  handler inserts profiles with the legacy `admin` role and pending status,
  ignores duplicate profile IDs, and does not provision stores. Its exact
  source was redacted for string literals in tool output; no trigger was
  added, removed, or changed.
- **Ownership state:** 0 stores, 4 profiles (3 approved legacy `admin`, 1
  approved `super_admin`), 16 units, and 28 products. All four profiles have
  NULL `store_id`. Units and products have no `store_id`; products have no
  `unit_id`, and all 28 use legacy unit text `pcs`. The 16 units consist of
  eight duplicated name/short-name pairs, each appearing twice. No mapping
  was inferred. `stores.owner_id` has a foreign key to profiles with
  `ON DELETE CASCADE` but no unique constraint; `settings` and
  `customer_groups` have only their primary keys among the inspected
  constraints.
- **Storage:** `storage.buckets` and `storage.objects` exist. The
  `product-images` bucket is public; its policies allow anon/authenticated
  select, insert, update, and delete in that bucket.
- **Limitations:** These results are a current catalog snapshot, not proof of
  deployment history, application-level authorization behavior, authoritative
  ownership, or complete data correctness. Policy/function results collected
  as `postgres` do not replace tests under anon/authenticated identities.

**Disposition: NO-GO.** The unsafe tenant backfill remains blocked; the
remote migration baseline and authoritative row ownership mappings remain
unresolved. No SQL migration was executed.

## Safety and execution rules

1. Before opening SQL Editor, independently confirm the exact project reference
   in the Supabase Dashboard and record whether it is **Production** or
   **Staging**. The project reference is not returned by PostgreSQL queries.
   If either value is uncertain, stop.
2. Use the Dashboard for that confirmed project and an authorized
   read-only-capable database role. Run the statements manually, one at a time,
   in the order below. Do not run `supabase db push`, `supabase db reset`, or
   any migration command.
3. The reviewed source is
   [remote_catalog_inventory_read_only.sql](reviews/remote_catalog_inventory_read_only.sql).
   It contains catalog `SELECT` statements only. It does not call application
   RPCs. Calls such as `pg_get_functiondef`, `pg_get_triggerdef`,
   `has_table_privilege`, `has_function_privilege`, `to_regclass`, and
   `to_jsonb` are metadata/formatting functions; they do not execute the
   application functions whose definitions they inspect.
4. Q06 and Q20 each contain two separate `SELECT` statements. Run each
   separately. Run Q20 only after Q19 reports the Storage objects and the
   chosen role can read them.
5. Stop on an error and record the exact query number, error, role, project,
   and time. A failed, empty, or permission-filtered result is **unknown**,
   not proof that an object or permission is absent. Do not work around access
   controls by elevating privileges without authorization.
6. Keep outputs access-controlled. Function definitions, policies, addresses,
   and profile identifiers can be sensitive. Do not publish credentials or
   unnecessary personal data. Redact secrets if any are unexpectedly present.
7. All supplemental statements below are read-only `SELECT`s. Run only when
   their prerequisite catalog evidence confirms the referenced object and
   columns. If names differ, first resolve the actual schema from Q02/Q03;
   do not treat a failed hard-coded relation name as proof of absence.
8. Run in this exact order: manually record the Dashboard target/environment;
   Q01; Q02-Q16 in source order; Q17; the supplemental ledger version query
   if Q17 and permissions permit; Q18; the supplemental all-membership query
   (version-appropriate form below); Q19; Q20 only if permitted; Q21; then
   supplemental E1-E6 after confirming relations/columns in Q02/Q03. The
   tables below map evidence groups to source query numbers; they do not change
   this execution order.

## A. Target

| Source query | What it proves | If missing or failed |
|---|---|---|---|
| Before SQL: Dashboard project reference/environment | Identifies the exact Supabase project and whether it is Production or Staging. | Stop. SQL cannot establish the operator's intended target or environment. |
| Q01 | Returns database name/role, PostgreSQL `server_version`, search path, and server address/port. Use `server_version` for the database version. | Failure means target/session facts are unavailable. A successful result still does not prove project reference or environment; match it to the Dashboard. |

## B. Migration state

| Source query | What it proves | If missing or failed |
|---|---|---|---|
| Q17 | Checks whether `supabase_migrations.schema_migrations` resolves to a relation. It does not alter or repair the ledger. | A `NULL` result is not by itself proof that no ledger exists: schema visibility, permissions, naming, or a different history mechanism may explain it. A query error is unknown. Stop and obtain authorized catalog/deployment evidence. |
| Supplemental ledger version SELECT below; only if Q17 identifies the relation and the role is authorized | Lists the recorded remote versions for comparison with the 32 checked-in migration versions listed below. | Failure, missing expected columns, or partial output is unknown. Do not create/repair the ledger or infer that an unlisted migration is unapplied. Request deployment records and an authorized read-only inspection. |
| Q02-Q16, as detailed below | Provides catalog fingerprints to compare expected effects against each local file and identify absent, complete, partial, or drifted object sets. | Matching objects alone do not prove a migration ran. Incomplete/filtered catalog output leaves affected versions unknown. |

Supplemental ledger statement (run only after Q17 confirms the relation):

```sql
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

Compare the returned values exactly against these **32 local migration
versions and filenames**. Record each as ledger-present, ledger-absent, or
unknown; then separately compare catalog fingerprints and deployment records.
A missing ledger row is not permission to mark a version applied or replay it.

| Local version | Checked-in migration filename |
|---|---|
| 20260806074402 | `20260806074402_create_core_schema.sql` |
| 20260810042844 | `20260810042844_rebrand_to_clothing_store.sql` |
| 20260813034825 | `20260813034825_create_product_images_bucket.sql` |
| 20260907042516 | `20260907042516_add_pos_erp_features.sql` |
| 20260913041549 | `20260913041549_add_barcode_management.sql` |
| 20260917054040 | `20260917054040_enhance_product_management.sql` |
| 20260918033021 | `20260918033021_create_stock_reconciliation.sql` |
| 20261001182330 | `20261001182330_fix_reconciliation_rls_policies.sql` |
| 20261001185741 | `20261001185741_repair_customer_sales_transactions.sql` |
| 20261001190222 | `20261001190222_restrict_customer_financial_functions.sql` |
| 20261003090642 | `20261003090642_add_purchase_expense_report_view.sql` |
| 20261003091128 | `20261003091128_add_purchase_expense_report_summary.sql` |
| 20261004171822 | `20261004171822_add_discount_offer_management.sql` |
| 20261004171859 | `20261004171859_extend_pos_sale_with_offer.sql` |
| 20261004174028 | `20261004174028_add_product_level_discounts.sql` |
| 20261005102547 | `20261005102547_add_purchase_sales_management.sql` |
| 20261024150000 | `20261024150000_create_tenant_auth_foundation.sql` |
| 20261024160000 | `20261024160000_implement_super_admin_approval.sql` |
| 20261024170000 | `20261024170000_add_store_tenant_isolation.sql` |
| 20261024180000 | `20261024180000_add_subscription_management.sql` |
| 20261024190000 | `20261024190000_add_store_employee_permissions.sql` |
| 20261025001500 | `20261025001500_fix_profiles_rls_recursion.sql` |
| 20261025002000 | `20261025002000_repair_profiles_rls.sql` |
| 20261025003000 | `20261025003000_secure_profiles_rls.sql` |
| 20261025004000 | `20261025004000_add_authenticated_profile_read.sql` |
| 20261025005000 | `20261025005000_add_authenticated_profile_lookup.sql` |
| 20261025006000 | `20261025006000_repair_store_owner_approvals.sql` |
| 20261025007000 | `20261025007000_show_all_pending_user_approvals.sql` |
| 20261025008000 | `20261025008000_restore_active_subscription_check.sql` |
| 20261025009000 | `20261025009000_reconcile_store_schema_and_subscriptions.sql` |
| 20261026000000 | `20261026000000_fix_client_signup_profile_role.sql` |
| 20261027000000 | `20261027000000_repair_store_owner_approval_rpc.sql` |

## C. Auth

| Source query | What it proves | If missing or failed |
|---|---|---|---|
| Q14 | Lists visible non-system table triggers, including `auth.users` when visible, with trigger name/state/definition, exact trigger function signature, function security settings/ACL, and function definition. Check specifically for `on_auth_user_created` and record every trigger on `auth.users`, not just the expected name. | No matching row is not proof of no Auth trigger if the role cannot see `auth` catalog entries or results are filtered. Query failure is unknown. Obtain a role with authorized catalog visibility; do not add/drop/replace a trigger. |
| Q13 | Lists definitions and effective execute flags for routines that are `SECURITY DEFINER` or executable by client/service roles; use it to inspect profile/signup/approval functions and their privileges. | A missing function may be outside Q13's filter, hidden, or named differently. Do not conclude it does not exist. Continue with Q14's bound trigger function and the supplemental targeted function lookup below. |
| Q15 | Lists event triggers and exact event-trigger function bindings. These are DDL hooks, not Auth user-created triggers. | Empty or failed results are only meaningful if the role can read event-trigger metadata. This query does not substitute for Q14. |

Supplemental targeted function lookup (read-only). Run after Q14 identifies the
actual Auth trigger target. Substitute the exact schema and function name from
Q14; include any profile-creation helper names discovered in the returned
definitions. Do not guess a binding from local migration source.

```sql
SELECT n.nspname AS schema_name,
       p.proname AS routine_name,
       p.oid::regprocedure AS signature,
       pg_get_userbyid(p.proowner) AS owner_name,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       p.proacl AS routine_acl,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = '<schema_from_Q14>'
  AND p.proname = '<function_name_from_Q14>'
ORDER BY p.oid::regprocedure::text;
```

If the query errors because a role name is unavailable, a function is
overloaded, or catalog access is restricted, preserve the error and request
authorized evidence. This query inspects definitions; it does not invoke them.
The definitions and settings are required to resolve the local trigger
conflict. Do not add a duplicate Auth trigger or remove/rename a live trigger.

## D. Security and schema

Query numbers refer to comments in the existing SQL file. Run them in the
global sequence in Safety rule 8; this table groups their evidence by topic.

| Source query | What it proves | If missing or failed |
|---|---|---|---|
| Q02 | Visible tables, partitions, views, materialized views, foreign tables, sequences, owners, RLS flags/options, and view definitions. | Missing objects may be outside visibility or differently named/schema-qualified. Failure or filtered results do not establish absence. |
| Q03 | Visible column names/types, nullability, defaults, and generated/identity properties. | Missing columns/tables may be hidden or named differently. Do not design constraints or data queries until the schema is confirmed. |
| Q04 | Constraints and definitions, validation and deferral state. | Missing rows can mean no visible constraints or incomplete catalog access; verify permissions and affected relations. |
| Q05 | Foreign keys, child/parent relations, validation and referential-action codes/definitions. | No row does not prove there are no logical relationships enforced in code. Errors/filtered rows leave relationships unknown. |
| Q06 (both SELECTs) | Index definitions plus validity/readiness, uniqueness, predicates, expressions, and replica identity. | Failed query or absent index rows do not prove index absence unless relation/catalog visibility is confirmed. |
| Q07 | RLS enabled/forced flags and visible policies with command, roles, mode, `USING`, and `WITH CHECK`. | No policy row can mean no policy or insufficient visibility. Empty policy output is not proof of safe/default-deny behavior. |
| Q08 | Schema ACL entries and effective `USAGE`/`CREATE` for `anon` and `authenticated`. | Missing role or ACL errors are unknown; do not assume no grant. |
| Q09 and Q09b | Relation/sequence ACLs, including `PUBLIC`, plus configured default privileges. | Errors or absent rows can reflect visibility. Compare explicit ACLs with effective privilege results in later queries. |
| Q10 | Effective `anon`/`authenticated` relation privileges, including `TRUNCATE` (which RLS does not protect). | Missing role/query failure is unknown, not denial. |
| Q11 | Column-level table grants. | Empty/failed output is not proof that column grants do not exist if visibility is incomplete. |
| Q12 | Sequence ACLs and effective `anon`/`authenticated` sequence privileges. | Missing sequences or failed privilege checks are unknown until schema and role visibility are verified. |
| Q13 | Security-definer status, settings, owner, definition/ACL and effective client/service execution for relevant routines. | It is a filtered routine inventory, not proof that unreturned routines do not exist. See Auth supplemental lookup when needed. |
| Q14 | Trigger inventory and each trigger function binding/definition. | Permission-filtered trigger results cannot establish absence. |
| Q15 | Event-trigger inventory and function binding. | Permission-filtered results cannot establish absence. |
| Q16 | User-defined types and enum labels that may constrain roles/statuses. | Missing type rows can mean no visible type or inadequate access; cross-check Q03/Q04. |
| Q18 plus supplemental role-membership SELECT below | Q18 reports memberships directly involving common Supabase roles; the supplemental query returns all catalog role-membership edges, including custom roles that may participate transitively in effective grants. | Q18 requires PostgreSQL 16+ for `inherit_option`/`set_option`. If Q18 fails, retain the error and use only the version-compatible supplemental result; if the all-membership query fails or is filtered, memberships remain unknown. |
| Q21 | Relevant role attributes, including `SUPERUSER` and `BYPASSRLS`. | Missing roles or filtered rows are unknown; distinguish role absence from catalog access failure. |

Q13 retrieves function definitions as catalog text and Q14/Q15 retrieve trigger
definitions; none of these statements calls those application functions.
Function definitions can contain sensitive literals, so restrict and review
the output before sharing. Repeat the supplemental Auth function lookup for
the trigger function and each helper discovered in its body, following the
call chain as far as the definition reveals; Q13's filter alone is not proof
that unreturned helpers do not exist.

Supplemental role-membership query (run immediately after Q18). For PostgreSQL
16 or later, use:

```sql
SELECT parent.rolname AS granted_role,
       member.rolname AS member_role,
       grantor.rolname AS grantor_role,
       m.admin_option,
       m.inherit_option,
       m.set_option
FROM pg_auth_members AS m
JOIN pg_roles AS parent ON parent.oid = m.roleid
JOIN pg_roles AS member ON member.oid = m.member
JOIN pg_roles AS grantor ON grantor.oid = m.grantor
ORDER BY parent.rolname, member.rolname;
```

For an older PostgreSQL version, use the same SELECT but omit
`m.inherit_option` and `m.set_option`.

This returns all membership edges, not just the standard API roles. It is
catalog-only and does not change memberships. A failure or filtered result
leaves role inheritance unknown.

## E. Data ownership and relationships

The existing Q01-Q21 file is a catalog inventory; it does **not** count or
return business rows. First use Q02/Q03 to confirm actual schema/table/column
names. Then run the following read-only supplemental queries, one at a time.
The examples use known expected `public` relation names and JSON field
extraction so a missing optional column such as `store_id` or `unit_id` yields
`NULL` rather than causing a column-reference error. Run each only if Q02
confirms the relation exists. If a relation is in another schema, substitute
that schema after confirming it in Q02.

| Source query | What it proves | If missing or failed |
|---|---|---|---|
| Supplemental E1 counts | Exact current row counts for stores, profiles, units, and products. | Run only for relations confirmed by Q02. Error or missing relation is unknown, not a zero count. |
| Supplemental E2 stores | Minimal store IDs, owner IDs, names and status-like values, where those fields exist. | A NULL extracted field may mean the column is absent or NULL; use Q03 to distinguish. Never infer ownership from a name. |
| Supplemental E3 profiles | Profile IDs, role/status/approval fields and store linkage where present; avoids selecting email/phone/password fields. | Same missing-column caveat. A missing profile row or empty result is not proof of no owner unless the count/query visibility is verified. |
| Supplemental E4 units | Unit IDs, labels/codes, `store_id`, and `unit_id`-like fields where present; exposes duplicate labels/codes for review without merging. | It records state only; duplicates do not identify a canonical row. Empty/failed output is unknown. |
| Supplemental E5 products | Product IDs, labels, legacy unit text, `unit_id`, and `store_id` where present. | It records state only; `pcs` does not establish a particular unit mapping. Empty/failed output is unknown. |
| Supplemental E6 product grouping | Counts by current legacy unit text and ownership/unit identifiers to identify nulls and existing relationship patterns. | Missing fields appear as NULL; verify column existence in Q03. This is not an ownership mapping or authorization. |

**E1 — row counts** (run each `SELECT` only for the corresponding confirmed
relation):

```sql
SELECT count(*) AS stores_row_count FROM public.stores;
SELECT count(*) AS profiles_row_count FROM public.profiles;
SELECT count(*) AS units_row_count FROM public.units;
SELECT count(*) AS products_row_count FROM public.products;
```

**E2 — stores:**

```sql
SELECT to_jsonb(r)->>'id' AS id,
       to_jsonb(r)->>'owner_id' AS owner_id,
       to_jsonb(r)->>'name' AS name,
       to_jsonb(r)->>'status' AS status
FROM public.stores AS r
ORDER BY to_jsonb(r)->>'id';
```

**E3 — profiles:** only these minimal identity/authorization fields are
requested; do not select credential or unnecessary contact fields.

```sql
SELECT to_jsonb(r)->>'id' AS id,
       to_jsonb(r)->>'role' AS role,
       to_jsonb(r)->>'status' AS status,
       to_jsonb(r)->>'approval_status' AS approval_status,
       to_jsonb(r)->>'store_id' AS store_id
FROM public.profiles AS r
ORDER BY to_jsonb(r)->>'id';
```

**E4 — units:**

```sql
SELECT to_jsonb(r)->>'id' AS id,
       to_jsonb(r)->>'name' AS name,
       to_jsonb(r)->>'code' AS code,
       to_jsonb(r)->>'store_id' AS store_id,
       to_jsonb(r)->>'unit_id' AS unit_id
FROM public.units AS r
ORDER BY to_jsonb(r)->>'id';
```

**E5 — products:**

```sql
SELECT to_jsonb(r)->>'id' AS id,
       to_jsonb(r)->>'name' AS name,
       to_jsonb(r)->>'unit' AS unit,
       to_jsonb(r)->>'unit_id' AS unit_id,
       to_jsonb(r)->>'store_id' AS store_id
FROM public.products AS r
ORDER BY to_jsonb(r)->>'id';
```

**E6 — product unit/tenant relationship counts:**

```sql
SELECT to_jsonb(r)->>'unit' AS legacy_unit,
       to_jsonb(r)->>'unit_id' AS unit_id,
       to_jsonb(r)->>'store_id' AS store_id,
       count(*) AS product_count
FROM public.products AS r
GROUP BY to_jsonb(r)->>'unit',
         to_jsonb(r)->>'unit_id',
         to_jsonb(r)->>'store_id'
ORDER BY legacy_unit, unit_id, store_id;
```

Compare these rows with Q04/Q05 for declared constraints and foreign keys.
Catalog state can reveal existing relationships and missing/null references,
but it cannot prove that an ownership assignment is authoritative. That
requires separately supplied business records or owner-approved mapping
evidence. Do not assign a store ID, map `pcs`, merge duplicate units, or
backfill either table during evidence collection. Keep the previously known
16 units and 28 products unmapped absent authoritative evidence.

## F. Storage

| Source query | What it proves | If missing or failed |
|---|---|---|---|
| Q19 | Checks whether `storage.buckets` and `storage.objects` resolve to relations. | A NULL or error does not prove Storage is absent if schema visibility/permissions are limited. |
| Q20 (both SELECTs), only when Q19 and permissions permit | Reads bucket metadata and visible policies in schema `storage`. | Do not run if the relation is unavailable. Failed or filtered results are unknown, not proof that no bucket or policy exists. |

The existing package does not inspect Storage object row contents. This
evidence request is limited to catalog-visible Storage relations, bucket
metadata, and policies.

## Evidence recording and stop rules

For every result, record the query number, exact project reference,
Production/Staging designation, capture timestamp/time zone, database role,
PostgreSQL version, success/failure, and unmodified result location. Record
permission errors and empty results as **unknown** until resolved. Do not
convert query failure into “object absent,” “no grants,” “no trigger,” or “no
data.”

Stop and seek review if the confirmed target does not match, the database role
cannot provide complete authorized evidence, an expected relation/schema
differs, the ledger is absent or inconsistent, the Auth binding is not proven,
or any result suggests existing data could be overwritten or assigned without
authoritative mapping. Do not modify migration history or run migrations.

**This package is read-only evidence collection only. No deployment is
claimed.**

CURRENT STATUS: NO-GO — REMOTE BASELINE AND OWNERSHIP MAPPING UNRESOLVED
