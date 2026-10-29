# NioPOS Pre-Deployment Blockers

Status: **NO-GO** for executable migration creation and deployment, as of
2026-10-26. This is a local readiness record only. No Supabase connection,
remote query, write, migration execution, or application-code change was made.

This document consolidates prerequisites that block executable migrations
from being created. It does not authorize production work. Historical
migrations and their filenames must be preserved; do not edit, delete, rename,
or mark them applied to make the history appear consistent.

## Current disposition

- 32 local migrations reviewed: 14 **BLOCKED**, 9 **REQUIRES REVIEW**,
  8 **SUPERSEDED**, 1 **UNKNOWN UNTIL REMOTE EVIDENCE**, and 0 **SAFE TO APPLY**.
- Remote migration baseline and current Auth trigger binding remain unknown.
- The existing 16 units and 28 products remain unmapped.
- `20261024170000_add_store_tenant_isolation.sql` remains **BLOCKED**. Its
  hard-coded owner backfill can assign rows in 36 tables to one store and set
  their `store_id` columns `NOT NULL`.
- Approved authorization and lifecycle decisions are settled and recorded in
  [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); they are not reopened here.

## A. Remote evidence required

Collect fresh, read-only evidence only after the intended target has been
independently confirmed. Record capture time, source, query/command, and
resulting evidence without exposing credentials.

1. **Project and environment**
   - Exact Supabase project reference confirmed from the Dashboard by the
     operator; local config, URL, or prior audit is not sufficient.
   - Explicit Production vs Staging designation and confirmation that the
     inspected project is the intended target.
   - PostgreSQL server version and relevant enabled extensions.
2. **Migration history**
   - Whether the migration ledger exists, its schema/table and complete
     version/name entries, and any gaps or duplicates.
   - Available deployment, CI, dashboard, or SQL-editor records that can
     corroborate each version.
   - Object fingerprints sufficient to identify absent, complete, partial,
     or drifted migration effects. Object presence alone is not proof that a
     migration ran. Do not create or repair a ledger as part of evidence
     gathering.
3. **Auth trigger and function binding**
   - Every non-internal trigger on `auth.users`: trigger name, enabled state,
     timing, events, and exact schema/function target.
   - Full definitions, owners, security mode, `search_path`, and effective
     EXECUTE grants for each referenced function and any transitive signup
     helper it calls.
   - Existing behavior for pending profile creation, approval, and store
     provisioning, including whether more than one trigger can provision.
4. **RLS and policies**
   - Tables/views with RLS enabled or forced.
   - Every policy's table, name, command, roles, `USING`, and `WITH CHECK`
     expressions, including Storage policies and relevant views.
   - Effective default privileges and whether any access bypasses RLS.
5. **Grants**
   - Effective table, sequence, schema, function, and view privileges for
     `PUBLIC`, `anon`, `authenticated`, and relevant owner/service roles.
   - Include TRUNCATE, policy-independent privileges, and default privileges.
     Do not retrieve or disclose credential values.
6. **SECURITY DEFINER functions**
   - Full definitions, owners, `search_path`, overloads, EXECUTE ACLs, and
     caller/dependency information for all `SECURITY DEFINER` functions,
     especially signup, approval, store/unit management, POS, purchasing,
     financial, reporting, invitation, and public-catalog functions.
7. **Constraints and relationships**
   - Current primary/unique/check/exclusion constraints, foreign keys and
     delete/update actions, validated state, indexes, nullability, and
     deferrability for affected objects.
   - Include triggers that enforce tenant ownership and relationships expressed
     only in function code.
8. **Current business and identity state**
   - Read-only counts and stable row identifiers for profiles and their
     approval/role/store linkage; stores and owner relationships; memberships;
     all 16 units; all 28 products; and relevant `unit`/`unit_id` values.
   - `store_id`/`unit_id` null and distinct-value counts, duplicate unit
     labels/codes, product-to-unit references, and orphan/conflict counts.
   - Preserve privacy: return the minimum fields needed to establish state and
     mapping, not credentials or unnecessary personal data.

Prior reports of an absent remote migration ledger, a particular Auth trigger,
and the current profile/store/unit/product state are historical evidence only.
They must be rechecked against the confirmed target. No remote query is
authorized by this document.

## B. Owner/business decisions required

Obtain an explicit, reviewable decision and source evidence for each item;
never infer ownership or semantics from labels, role, timestamps, or row order.

1. Authoritative store ownership mapping for each existing profile that needs
   a store relationship, including legacy admin profiles.
2. Authoritative store ownership mapping for every existing unit and product.
   Keep all 16 units and 28 products unmapped until this is supplied and
   validated.
3. An explicit mapping from existing `products.unit` text value `pcs` to a
   specific unit row, if any. No `Pc(s)` row is presumed canonical.
4. A disposition for duplicate units (retain separately, identify an
   authoritative canonical row, or another documented outcome). Do not merge,
   delete, or re-point references without approval and impact analysis.
5. A historical-data migration policy: which legacy records are in scope,
   how unknown/unmapped rows remain preserved and inaccessible, and whether
   any separately approved row-level migration is needed. No blanket owner
   assignment or `NOT NULL` enforcement while required rows are unmapped.

The decisions already approved—including no default units, per-store settings
and customer groups, default-deny authorization, restricted published public
catalogs, and audited server-side Super Admin cross-store unit management—are
inputs to design, not unresolved blockers.

## C. Migration/code remediation required

These are design and source-remediation gates, not permission to modify
historical files or create SQL migration files now.

1. Reconcile the remote ledger and object fingerprints version by version,
   including any partial application. Preserve original migration files;
   never mark unknown migrations applied on inference.
2. Resolve the Auth trigger conflict from verified live evidence. Design one
   signup provisioning path and prove a safe transition from the actual
   binding. Do not add a duplicate trigger or remove/rename an existing one
   without proving replacement behavior.
3. Keep the historical hard-coded backfill migration blocked and unexecuted.
   Any later replacement must not reuse its hard-coded owner or blanket
   `IS DISTINCT FROM` update. It must be a separately reviewed forward design
   using authoritative, table-specific row maps and guarded expected counts.
4. Remove the unsafe behavior from the *future candidate migration plan*;
   do not rewrite or delete the historical migration. Preserve unmapped
   ownership as nullable and deny access to unmapped rows.
5. Produce a reconciled, ordered forward migration design based on the
   confirmed remote baseline. Resolve dependencies and replace incompatible
   historical behavior without replaying legacy seed/backfill migrations.
6. Review all DDL/DML, policy/grant transitions, trigger/function changes,
   FK delete behavior, and existing-row effects. Required tenant/RLS and grant
   changes must be coherent and fail closed; no unrestricted anonymous base
   table access.
7. Implement the approved server-side authorization/lifecycle model in the
   database design: pending/rejected denial, exactly one store per approved
   owner, duplicate-provisioning prevention, per-store settings/customer
   groups, no default units, and audited Super Admin unit operations.
   Confirm the audit mechanism from remote evidence before relying on one.
8. Inventory application callers and update application code only where
   necessary to use database-derived identity and authorization. Client state
   must not be authoritative. This is a later integration task, not permission
   to change application code in this readiness pass.

## D. Staging validation required

Before executable migrations are approved for production, a disposable,
identified staging environment and repeatable test path must be available.

- Rehearse the reviewed migration sequence against a baseline representative
  of the confirmed schema/history; do not use `supabase db reset` on a
  production or shared database.
- Capture before/after schema, policies, grants, trigger bindings, constraints,
  and affected-row counts. Verify no legacy business row is silently assigned,
  overwritten, merged, or deleted.
- Test Owner, Manager, Cashier, pending/rejected user and unauthorized RPC
  cases; cross-store SELECT/INSERT/UPDATE/DELETE denials; Super Admin
  cross-store unit operations and audit; public catalog disabled-by-default
  behavior; and duplicate store provisioning prevention.
- Test mapped and unmapped legacy rows, composite tenant relationships,
  transaction atomicity, signup/approval concurrency, and rollback/recovery.
- Obtain independent review of migration order and test evidence before
  proposing any production execution.

## Stop conditions

Remain **NO-GO** if target/environment, remote baseline, Auth binding, or
ownership evidence is unknown; if a candidate would overwrite, delete,
arbitrarily assign, or require unresolved ownership; if policy/grant transitions
cannot be reconciled; or if staging tests/recovery review are unavailable or
fail. This package does not authorize a remote read or write.
