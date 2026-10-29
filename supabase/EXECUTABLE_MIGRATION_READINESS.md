# NioPOS Executable Migration Readiness Gate

Status: **CLOSED — NO-GO**. No executable migration files are authorized by
this document. No Supabase connection, remote query, or write was made for this
readiness package.

## Strict creation gate

Executable migrations may be created only when **every** gate below is
documented with evidence and reviewed. A failed, unknown, or assumed gate is a
failure. A migration's presence in the repository or partial remote objects do
not satisfy these conditions.

| Gate | Required evidence to pass | Current status |
|---|---|---|
| Target project confirmed | Operator independently confirms exact Supabase project reference from the Dashboard. | **NOT MET** |
| Environment confirmed | Explicit Production vs Staging designation tied to the confirmed project. | **NOT MET** |
| Remote migration baseline known | Fresh read-only ledger, corroborating deployment history, and object fingerprints classify every local version as complete, absent, partial, or drifted. No inferred or fabricated ledger entries. | **NOT MET** |
| Auth trigger state known | Fresh inventory identifies every `auth.users` trigger and exact function binding, definitions, owners, and grants; one safe provisioning path is determined. | **NOT MET** |
| Ownership mapping authoritative | Approved, evidence-backed row mappings exist for affected profiles, all 16 units and all 28 products; `pcs`-to-unit and duplicate-unit decisions are explicit. No guessed or blanket mapping. | **NOT MET** |
| Unsafe hard-coded backfill removed/replaced | `20261024170000_add_store_tenant_isolation.sql` remains blocked and is excluded from execution. The future design uses a separately reviewed, guarded mapping strategy without its hard-coded owner or blanket reassignment. Historical source remains unchanged. | **NOT MET** |
| Migration order reviewed | Ordered forward design is reconciled to the actual baseline, has explicit dependencies and impact analysis, preserves unknown/unmapped data, and has independent review. | **NOT MET** |
| Staging validation available | Disposable staging environment, repeatable migration rehearsal, full authorization/tenant/public-catalog/provisioning test coverage, and recovery evidence are available and pass. | **NOT MET** |

**Creation rule:** do not create executable SQL migration files unless every
row is marked **MET** with dated evidence. Reassess all gates if target,
environment, remote schema/history, ownership decisions, or migration design
changes.

## Non-waivable safeguards

- Do not reset Supabase, delete business data, arbitrarily assign stores, merge
  duplicate units, or populate `products.unit_id` without approved mapping.
- Do not mark unknown migrations as applied, disable RLS, or grant unrestricted
  anonymous access.
- Do not edit, delete, or rename historical migrations to make history appear
  consistent. Preserve the blocked hard-coded migration as historical source;
  never execute it.
- Keep unmapped legacy rows intact and inaccessible. Do not set required
  ownership fields `NOT NULL` while rows requiring ownership remain unmapped.
- Do not connect to or write to a remote project as part of passing this
  local readiness gate. Any later production write requires separately
  confirmed target/environment, reviewed migrations, and explicit
  authorization.
- Do not expose service-role credentials or claim deployment without evidence.

See [PRE_DEPLOYMENT_BLOCKERS.md](PRE_DEPLOYMENT_BLOCKERS.md) for the evidence
checklist, owner/business decisions, remediation prerequisites, and staging
criteria. See [MIGRATION_RECONCILIATION.md](MIGRATION_RECONCILIATION.md) for
the 32-file chronology and per-file disposition.

## Result

**NO-GO.** Required remote evidence and authoritative ownership mapping are
not available. Executable migrations must not be created or executed yet.
