# NioPOS Phase 1 Deployment Gate

Status: local Phase 1 review only (2026-10-26). No Supabase connection or query was made during this phase. No secrets were read or printed. No application code, migration history, remote database, or business data was changed.

## Local Repository Findings

- The opened workspace directory is not a Git repository: `git status --short --branch` returned `fatal: not a git repository`. A clean/dirty worktree cannot be reported from this location.
- `supabase/config.toml` has local `project_id = "niopos-main"` and `db.major_version = 17`. This local identifier does not prove the intended remote ref.
- `.env` exists. Only its variable names were inspected: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Values were not read or emitted. The browser client uses the anon key and Supabase Auth session; no service-role key is referenced by `lib/supabase.ts`.
- The local Supabase directory has 32 SQL migration files, a `.temp` directory, and separate draft/review directories. Migration history has not been reconciled.
- Existing relevant artifacts: [remote reconciliation](REMOTE_REMEDIATION_AUDIT.md), [tenant authorization design](TENANT_AUTHORIZATION_DESIGN.md), [prioritized security review](TENANT_SECURITY_REVIEW.md), [unit ownership plan](UNITS_STORE_OWNERSHIP_PLAN.md), and prepared [catalog queries](reviews/remote_catalog_inventory_read_only.sql). The catalog queries remain unexecuted.

## Prior Evidence, Not Freshly Rechecked

The prior audit recorded accessible remote project ref `jlujbzfyobfskfepjkdt`, project name `niopos`, and PostgreSQL 17.11. That ref has not been independently confirmed by the operator as the intended production target. No remote connection was made in this Phase 1 pass.

Prior captured catalog results reported:

- No `supabase_migrations.schema_migrations` ledger and blank remote migration versions for all 32 local migrations.
- Zero live stores, four profiles (three approved legacy `admin`, one approved `super_admin`), and no `store_owner` profiles.
- Core operational tables with broad anon/auth policies and grants; several anon-executable SECURITY DEFINER business RPCs without captured Auth/store/subscription checks.
- `store_memberships`/`store_invitations` and their RPCs absent. The current approval RPC refers to missing membership objects and nonexistent `stores.status`.
- Sixteen units with eight duplicated label/code pairs and 28 products all using `unit = 'pcs'`; units use `Pc(s)`. No `store_id` or `unit_id` exists on products/units. No mapping is inferred.

These are prior evidence with a timestamp, not a guarantee the remote catalog has not changed. The exact verification SQL is in [remote_catalog_inventory_read_only.sql](reviews/remote_catalog_inventory_read_only.sql). It must not be run until the project ref is confirmed and an authorized read-only inspection is arranged.

## Local Application Findings

- `lib/supabase.ts` creates a browser Supabase client from the public URL/anon key and persists Auth sessions.
- `components/providers.tsx` checks `supabase.auth.getUser()` and verifies the profile ID matches the Auth user before setting profile context. This is useful UI/session hygiene, not a substitute for RLS.
- Registration calls `supabase.auth.signUp()` with `full_name`, phone, and store metadata. It also offers an employee invite-token branch, although the corresponding remote backend is absent.
- Login and admin layout redirect based on profile approval and call `has_active_subscription()` / `get_my_permissions()`. These database RPCs were absent in prior remote evidence. Route redirects are not a database authorization boundary.
- Approval UI calls `set_store_owner_status`; its captured remote body has unsupported schema references. Super Admin pages check approved status client-side, but the live stores/audit-log policies have role-only branches.
- Operational pages use direct browser `.from(...)` CRUD and RPC calls for products, units, customers, POS, purchases, reports, settings, and other tables. All require database-side tenant policies and RPC validation before production use.

## Blocking Owner Decisions

1. **Intended remote project:** provide the exact ref shown in Supabase Dashboard and confirm the environment. Do not infer it from `config.toml`, `.temp`, a URL, or an anon key.
2. **Migration baseline evidence:** authorize read-only catalog inspection after item 1, and provide any deployment/SQL-editor/CI records available. This is needed to classify historical migrations; it does not authorize migration-history repair.
3. **Legacy profile/store ownership:** provide an authoritative mapping for existing `admin` profiles and any business rows to stores. The live store count is zero, so no generic store backfill can be justified.
4. **Unit/product ownership and mapping:** provide an authoritative store map for 16 unit rows and 28 products, then explicitly decide duplicate dispositions and whether `pcs` should map to a specific `Pc(s)` row. No row ID is selected by this review.
5. **New-store catalog provisioning:** approve whether new stores receive no defaults or a specified v1 unit catalog, and approve exact names/codes/descriptions. The historic eight units are candidates only, not approved seed values.
6. **Authorization policy:** approve manager/cashier capability boundaries (POS, inventory, purchases, reports, units, employees, settings) and whether active subscription is required for catalog management. Membership tables/RPCs are absent.
7. **Public product browsing:** confirm which fields anonymous visitors may read. Current open base-table access is not an acceptable substitute for a limited public projection.
8. **Scope decisions:** decide whether settings and customer groups are global or store-owned, whether Super Admin may perform unit CRUD across stores, and whether the legacy `products.unit` text remains during staged migration.

## Pause Conditions

Do not proceed to remote inspection until item 1 is confirmed. Do not prepare a final backfill/seed migration until items 3-6 are resolved with evidence. Do not write to production until a per-file migration reconciliation is reviewed, security migration order and rollback are approved, and a separate explicit production-write approval is given.

No tenant isolation, signup/approval completion, employee permissions, unit mapping, migration deployment, or cross-store behavior has been implemented or verified.
