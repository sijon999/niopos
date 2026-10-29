# NioPOS Production Migration Plan

Status: **DRAFT — AWAITING OPERATOR APPROVAL; NO PRODUCTION WRITE AUTHORIZED
YET**. Target: Supabase project `jlujbzfyobfskfepjkdt`, which the operator
confirmed is Production. Project metadata reports PostgreSQL 17.11.

This is a reviewed implementation sequence, not executable SQL. No migration
has been created or applied as part of this plan. No production data, schema,
policy, grant, trigger, or application code has been changed.

## 1. Write-tool and permission verification

- Supabase MCP `apply_migration` is available and is the supported tool for
  applying DDL migrations. It has not been called.
- Supabase MCP project lookup and read-only SQL calls succeeded. Read-only SQL
  ran as database role `postgres`; that role has `BYPASSRLS`.
- The MCP migration-list endpoint returned an empty list, and the SQL catalog
  check found no `supabase_migrations.schema_migrations` relation.
- **The account's permission to call `apply_migration` is not verified.**
  Project lookup/read-only SQL access does not prove migration-write
  authorization. There is no safe no-op permission probe. The first approved
  migration call is the only supported way to verify it; if the tool rejects
  that call, stop and report the exact permission/API error. Do not probe with
  a dummy DDL or data write.
- Tool-call approval settings cannot be inspected from the available MCP
  metadata. No approval flow will be bypassed. The operator must approve this
  plan before an apply call, and the reviewed migration content must be
  approved before its production execution.

## 2. Current evidence and hard constraints

Fresh read-only catalog checks on 2026-10-26 found:

- 42 public base tables and one public view; RLS is enabled on all 42 tables,
  forced on none.
- `store_id` exists only on `payments`, `profiles`, and `subscriptions`;
  no public table has `unit_id`. `settings` and `customer_groups` are not
  store-scoped in the current schema.
- 0 stores; 4 profiles (3 approved legacy `admin`, 1 approved
  `super_admin`); 16 units; 28 products. All profile `store_id` values are
  NULL. All 28 products use `pcs`; the 16 units are eight duplicate
  name/short-name pairs.
- There is one enabled `auth.users` trigger,
  `on_auth_user_created -> public.handle_new_user_profile()`. The current
  SECURITY DEFINER handler creates pending profiles with legacy `admin` role
  and does not provision stores.
- The remote migration ledger is absent/unlisted. Existing objects therefore
  must be treated as an unmanaged live baseline, not as proof that the 32
  checked-in migrations are applied or safe to replay.
- Broad anon/authenticated CRUD policies and anon-executable SECURITY DEFINER
  business functions exist. Effective `TRUNCATE` privileges exist on
  business tables. The product-image bucket is public with anon/authenticated
  write/delete policies.

Non-negotiable:

- Preserve every existing row. No `DELETE`, `TRUNCATE`, blanket `UPDATE`,
  inferred ownership, duplicate-unit merge, or historical migration replay.
- The 16 units and 28 products remain unmapped; do not assign a store or
  `products.unit_id`.
- Because ownership is unresolved for legacy rows generally, add ownership
  columns as nullable and leave existing rows unchanged. Default-deny policies
  must make unmapped legacy rows inaccessible to tenant users until
  separately approved mapping evidence exists.
- Never set tenant ownership `NOT NULL` while legacy rows remain unmapped.
- New stores receive no default units. Public catalog remains disabled by
  default and only an explicit allowlisted projection may be public.
- Preserve the existing Auth trigger binding; never create a duplicate Auth
  trigger or remove it without proving a safe atomic replacement.
- Do not reset the Production database or fabricate migration-ledger entries.

## 3. Ordered implementation sequence

All names below are descriptive work packages, not reserved migration
filenames. Timestamp/version IDs will be assigned only after baseline
reconciliation and approval. Each SQL migration is forward-only, reviewed
against the live catalog, and followed by schema/data-count verification and
the corresponding security tests before the next migration.

### Gate 0 — Baseline reconciliation (read-only; not a migration)

1. Capture and retain the complete read-only evidence set for the confirmed
   project: all relation/column/constraint/index/policy/grant/function/trigger
   definitions, role memberships, Storage state, and row counts.
2. Reconcile all 32 local migration versions against the empty MCP migration
   list, absent SQL ledger, deployment records, and exact remote object
   fingerprints. Classify effects as present, absent, partial, or drifted.
   Do not mark any historical version applied or replay any historical file.
3. Record pre-change row counts and protected identifiers for all existing
   public business tables and Storage objects. Collect no credential values.
4. Stop on unknown function dependencies, incomplete permissions/evidence,
   data-count mismatch, or an unexplained schema difference.

**Exit:** reviewed baseline report and before-state evidence. Current status:
not complete; the remote history is unresolved.

### Gate 1 — Isolated staging and test identities (no Production migration)

1. Establish an isolated staging database with a schema-compatible baseline
   and synthetic fixtures. Do not copy Production business data or credentials.
2. Confirm how the empty remote migration ledger and existing schema will be
   represented in staging; do not replay the 32 legacy files as a shortcut.
3. Create controlled test identities for approved Owner, Manager, Cashier,
   Super Admin, pending/rejected users, and a second store. Keep these out of
   Production.

No staging branch/project is currently listed. Do not create one without
confirming availability, cost/approval, and a safe baseline strategy.

**Exit:** staging test harness and repeatable restore/recovery process are
available. Current status: not met.

### Migration 1 — Additive nullable tenant foundation

1. Add `store_id` as nullable, with no default and no backfill, to the
   store-owned operational tables identified from the confirmed live schema,
   including products, units, settings, customer groups, and transactional
   tables. Preserve existing `profiles.store_id` values as-is.
2. Add nullable `products.unit_id`; retain the legacy `products.unit` text.
3. Add the membership/invitation and permission structures needed for
   database-derived per-store roles, subject to the approved RBAC matrix.
   Keep global authorization metadata distinct from store-owned data.
4. Add required `(id, store_id)` unique keys/indexes and supporting indexes
   after checking current duplicates and exact dependencies.
5. Do not insert default units, create a store for a guessed user, update any
   existing business row, set ownership `NOT NULL`, or populate unit mappings.

**Post-check:** catalog diff; exact unchanged row counts; all old ownership
values remain NULL/unchanged; no writes to business rows. Run staging schema
and migration-replay checks.

### Migration 2 — Tenant-safe relationships and write derivation

1. Add same-store composite relationships for every confirmed tenant-owned
   FK. Use `NOT VALID` where necessary to preserve legacy unmapped rows while
   enforcing new/updated mapped relationships. Resolve all dependency edges
   from catalog evidence before authoring.
2. Derive/validate `store_id` server-side from the authenticated user and
   approved membership for new writes. Reject caller-supplied mismatches and
   cross-store parent references. No general Super Admin bypass.
3. Ensure a store owner can own at most one store with a unique owner
   constraint after duplicate preflight. Existing store count is zero, but
   constraint creation must still have an explicit guard.
4. Existing rows with NULL tenant keys remain untouched and fail closed under
   later RLS. Do not validate legacy constraints against an inferred mapping.

**Post-check:** composite FK inventory, validated/not-valid state, orphan
counts, and two-store positive/negative write tests in staging.

### Migration 3 — Signup, approval, store lifecycle, and trusted audit

1. Replace the body of the existing
   `public.handle_new_user_profile()` function in place, preserving exactly
   one `on_auth_user_created` trigger. Do not create a second trigger.
2. Signup creates only a pending profile with the approved pending owner
   lifecycle; Auth metadata cannot grant roles, approval, or store ownership.
   It creates no store and no units.
3. Replace/secure the approval RPC so only a database-verified approved Super
   Admin can approve/reject. Approval and creation of exactly one store occur
   transactionally and are concurrency-safe. Pending/rejected/suspended users
   receive no store access.
4. Add an append-only, database-controlled audit path for approval and
   privileged operations. Remove direct client audit forgery; preserve all
   existing audit rows. Do not treat current `audit_logs` contents as trusted.
5. Do not promote the three legacy `admin` profiles or assign any profile to
   a store without authoritative owner decisions.

**Post-check:** exactly one Auth trigger/function binding; no second
provisioner; lifecycle/approval audit; duplicate approval concurrency test;
pending/rejected denial tests.

### Application compatibility release (between additive foundation and
authorization cutover)

1. Update the application to use verified Auth identity and database-derived
   permissions; remove client profile/localStorage/Zustand authorization
   assumptions.
2. Update all existing direct CRUD/RPC surfaces to use tenant-scoped queries
   and guarded database functions. Cover POS, purchases, inventory, customers,
   settings, customer groups, approvals, units, reports, and storage uploads.
3. Fail closed on missing profile/permission/RPC errors. Do not expose the
   legacy `users.password_hash` table.
4. Keep unmapped legacy rows hidden. Handle unavailable/unmapped records
   without silently assigning or overwriting them.

**Post-check:** application type/build/tests and staging smoke tests pass
against the additive schema before RLS/grant cutover.

### Migration 4 — Default-deny RLS, grants, and business RPC hardening

1. In one reviewed, atomic cutover, remove broad anon/authenticated base-table
   policies and grants, including `TRUNCATE`; apply least-privilege grants and
   per-store Owner/Manager/Cashier policies, default-deny unspecified actions,
   and approved Super Admin-only operations.
2. Make unmapped (`store_id IS NULL`) business rows invisible and
   unmodifiable to tenant roles. Verify `BYPASSRLS` service/admin paths are
   constrained and are not used as application authority.
3. Harden every existing SECURITY DEFINER overload: fixed safe search path,
   qualified names, server-side actor/role/store/subscription checks, same-store
   parent validation, and restricted EXECUTE grants. Revoke anon execution
   except for deliberately narrow public catalog operations.
4. Enforce the approved RBAC matrix and cross-store SELECT/INSERT/UPDATE/DELETE
   denial in database policy/constraints, not just in the UI.

**Post-check:** effective ACL/policy diff, table row counts unchanged, RPC
execute ACLs reviewed, automated anon/authenticated role tests in staging.
Do not perform Production cutover if any test or count differs.

### Migration 5 — Per-store settings/groups, public catalog, and Storage

1. Scope new settings and customer groups to a store; enforce one settings
   row per store and same-store customer/group relationships. Do not attach
   existing rows to stores.
2. Add publication state defaulting to false and a narrow allowlisted public
   catalog view/RPC. Anonymous access to base products/categories remains
   denied.
3. Keep new stores free of default units.
4. Replace public Storage write/update/delete access with authenticated
   store-scoped access. The existing `product-images` bucket is public, so
   make it private as part of the reviewed cutover only after the app has a
   compatible authorized/signed-image path. Preserve object rows; document
   that existing public URLs may stop working.

**Post-check:** public catalog returns no rows by default, published fields
only when enabled; Storage objects/counts unchanged; cross-store object access
denied.

### Migration 6 — Audited Super Admin unit operations

1. Add narrowly scoped server-side Super Admin functions for cross-store unit
   management, gated by verified role/approval and writing append-only audit
   events. No direct table-level cross-store Super Admin grant.
2. Do not expose/manage existing unmapped units through these operations until
   authoritative ownership is supplied.

**Post-check:** Owner restricted to own mapped units; Manager/Cashier denied
unless explicitly approved; Super Admin cross-store operations succeed only
through the guarded audited path; unauthorized RPC calls fail.

### Deferred migration — Explicitly approved legacy row maps

No backfill migration is included in the initial rollout. Only after
authoritative row-by-row ownership and unit mapping is provided may a separate
reviewed migration update exact listed row IDs with expected affected counts
and before/after guards. No blanket update, `unit='pcs'` inference, duplicate
merge, or `NOT NULL` enforcement is allowed. Unmapped records remain preserved
and inaccessible.

## 4. Required test gate after every migration

After each staging migration and before the next:

- Compare schema fingerprints, policies, grants, functions, triggers and
  constraints against the reviewed migration.
- Compare row counts for all business tables and Storage objects to the
  captured baseline; investigate any difference before proceeding.
- Run role tests: Owner, Manager, Cashier, pending/rejected, second-store
  member, Super Admin, and anon.
- Test cross-store SELECT/INSERT/UPDATE/DELETE denial, unauthorized RPC denial,
  settings/customer-group scoping, published catalog restrictions, storage
  access, audit integrity, and duplicate provisioning.
- Verify no SQL statement deletes/truncates rows or performs ownership/unit
  backfills.

For Production, capture fresh read-only verification and run an approved
smoke-test plan after each approved migration. Do not create test users or
synthetic business rows in Production merely to test authorization; use
staging identities and evidence unless a separate, explicit production test
data plan is approved.

## 5. Approval and stop conditions

This plan requires operator approval before local candidate migrations are
created for application. That approval is **not** approval for an immediate
Production write. Before each Production apply, present the exact reviewed
migration SQL, expected schema/grant/policy changes, row-count invariants,
staging test results, and rollback/recovery plan and obtain approval with tool
approvals enabled.

Stop if:

- The remote baseline is still ambiguous or a local historical migration
  appears partially applied.
- A migration would modify/delete existing business rows, guess ownership,
  merge units, or require unresolved data to be non-null.
- Staging is unavailable or any required role/security/data-preservation test
  fails.
- `apply_migration` rejects access, returns an unexpected result, or an
  approval prompt is unavailable.
- Production target/environment does not match this plan.

**Current result: NO-GO for Production writes.** The write tool is available;
write permission remains unverified. The migration baseline, authoritative
ownership decisions, and staging test environment are unresolved.
