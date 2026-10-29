# Remote Catalog Inventory Execution Guide

Status: manual guide only. The associated [remote catalog query file](remote_catalog_inventory_read_only.sql) was prepared locally and has **not** been executed. This guide does not authorize a connection, any write, or a production test.

## Before Running

1. Confirm the intended Supabase project reference independently in the Supabase Dashboard. The local `supabase/config.toml` `project_id` and database name are not proof of remote identity. Record the dashboard-confirmed project ref, organization, project name, and environment.
2. Obtain an approved read-only database role. Do not use a service-role key or a write-capable credential for catalog review.
3. Confirm the target PostgreSQL version with Q01. Prior inspection reported PostgreSQL 17.11; Q18 uses `pg_auth_members.inherit_option` and `set_option`, available on PostgreSQL 16+. If target is older, adapt only that membership query to columns supported by its version; do not interpret the failed query as “no memberships.”
4. Review each query in `remote_catalog_inventory_read_only.sql`. It contains SELECT/catalog reads only. Do not append migration SQL or invoke any application function/RPC.
5. If a query errors for permission, version, missing relation, or API/catalog limitation, save the exact error and SQLSTATE where available. A failed query is not evidence that the object/policy/trigger is absent.

## Query Map

Execute one SELECT statement at a time if the SQL editor/CLI returns only the final result set for a multi-statement file. Preserve query identifiers Q01-Q21 with each output.

| Query | Purpose | Notes |
| --- | --- | --- |
| Q01 | Database and session metadata | Does not expose the Supabase project ref; pair with Dashboard confirmation. `inet_server_addr()` can be NULL on socket connections. |
| Q02 | Relation inventory, ownership, RLS/force flags, view definitions | Includes non-system schemas and relation kinds; inspect relkind rather than assuming every relation is a table. |
| Q03 | All visible column types/defaults/nullability/generated fields | Information-schema visibility is permission-filtered; record the execution role. |
| Q04 | Constraints, definitions, deferrability, validation | Includes PK, unique, check, FK and other constraints. |
| Q05 | FK graph and referential actions | Dedicated FK view for ownership and cross-store relationship review. |
| Q06 | Index definitions and validity | Includes expression indexes and partial predicates; compare with Q04 unique constraints. |
| Q07 | RLS flags and all policy expressions | Check permissive overlaps, command, role, USING, WITH CHECK; catalogs do not prove runtime behavior. |
| Q08 | Schema ACLs and effective schema USAGE/CREATE | Includes PUBLIC; schema CREATE can affect name-resolution risk. |
| Q09 | Relation ACLs for tables/views/sequences | Includes explicit/default ACL expansion and PUBLIC entries. |
| Q09b | Default ACLs for future objects | Affects future exposure; global default ACLs have null schema. |
| Q10 | Effective anon/authenticated table verbs | Explicitly includes TRUNCATE; RLS does not protect TRUNCATE. |
| Q11 | Column-level privileges | Required for tables with column-specific grants, such as profiles. |
| Q12 | Sequence ACLs and effective usage/select/update | Sequence privileges are separate from table RLS. |
| Q13 | Routine inventory and definitions | Includes non-system functions/procedures that are SECURITY DEFINER or executable by anon/authenticated/service_role. Manually inspect dynamic SQL, nested calls, identity/store/subscription checks, search_path and ACL. `source_contains_execute_token` is only a search hint, not proof of dynamic SQL. |
| Q14 | Trigger inventory and bindings | Includes internal and user triggers in non-system schemas; inspect target function definitions and enabled state. |
| Q15 | Event-trigger DDL hooks | May be permission-restricted; absence from an inaccessible result is not proof there are none. |
| Q16 | User-defined types/enums | Table row composite types may appear; distinguish relation composites from application enums/domains. |
| Q17 | Migration-ledger relation presence | Only checks relation presence. Do not query/alter/repair migration history from this file. |
| Q18 | Role membership graph | `inherit_option`/`set_option` require PG16+. Prior server snapshot was PG17.11. |
| Q19 | Storage relation presence | Safe catalog check; if storage relations are absent, do not run Q20. |
| Q20 | Storage bucket visibility and object policies | Run only if Q19 confirms the relations and the read-only role can access them. |
| Q21 | Role attributes | Captures SUPERUSER/BYPASSRLS and login/role-creation flags for relevant API roles. |

## Saving Results

- Save each query's result separately as CSV or JSON in an access-controlled evidence location, not in a public repository or issue. Use names such as `Q13-routines-<project-ref>-<UTC timestamp>.json`.
- Keep a manifest with project ref confirmed from Dashboard, UTC capture time, PostgreSQL version, execution role, query ID/file hash, result filename, success/error, and reviewer.
- Preserve errors and empty results separately. Never replace an error result with an empty file or label it as no objects found.
- Q13 returns function source and Q14 trigger-function source. Restrict those outputs to authorized reviewers; do not publish credentials or application secrets if any are embedded.
- Do not save row data beyond the specific approved aggregates needed for mapping. The catalog inventory should not select sales, customer, payment, or credential values.

## Updating the Evidence Matrix

Update [catalog_evidence_status.md](catalog_evidence_status.md) only after a query succeeds against the Dashboard-confirmed ref. For every changed row, cite the Q number, timestamped evidence filename, and relevant catalog result (without copying sensitive function source into the public matrix).

- **VERIFIED**: a successful, current query directly establishes the exact structural/access claim. Include scope and timestamp. A schema catalog result verifies structure/ACL, not that an end-user is denied cross-store behavior.
- **CONTRADICTED**: a successful, current query directly disproves a positive claim. Keep both the old claim and the contradictory result so drift is traceable.
- **UNVERIFIED**: query failed, the current role cannot see the object, evidence is stale, a claim requires source/owner intent, or a behavior test is required. Record the exact missing evidence/error; do not promote it to absent or safe.

Catalog data can verify configured policies and grants. It cannot by itself verify effective PostgREST behavior, JWT claims, storage authorization end-to-end, transaction rollback, isolation across two stores, or client routing. Mark those claims UNVERIFIED until tested in an isolated environment after an approved implementation.

## Limitations and No-Write Boundary

- Q13-Q15 may fail or return filtered metadata for a constrained read-only role. Obtain authorized catalog-read access rather than switching to a write-capable credential.
- Q20 assumes Supabase Storage's `storage.buckets` table exists and is readable; Q19 gates it. Managed schemas can impose additional visibility restrictions.
- Q18 membership columns vary by PostgreSQL version. If unsupported, use a version-compatible SELECT and note the difference.
- The query inventory does not verify Dashboard project identity; Q01 does not return a project ref.
- No query here should be used to repair, seed, test-write, or update migration history. Do not run `supabase db push`, reset, migration repair, direct DDL/DML, or write-capable application RPCs as part of this evidence phase.
