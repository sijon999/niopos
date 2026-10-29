# Store-Owned Units Plan

Status: planning only. The business decision is approved: each unit belongs to one store, and identical names/codes may exist in different stores. This plan does not alter application code or the remote database. Proposed DDL is in [drafts/store_owned_units.sql](drafts/store_owned_units.sql), outside `supabase/migrations`; its DDL is block-commented.

## Verified Current Schema

Read-only catalog evidence for project `jlujbzfyobfskfepjkdt`:

| Object | Verified live definition |
| --- | --- |
| `units.id` | UUID, non-null primary key, default `gen_random_uuid()` |
| `units.name` | Non-null text |
| `units.short_name` | Non-null text |
| `units.description` | Nullable text |
| `units.status` | Nullable text, default `'active'` |
| `units.created_at` | Nullable timestamptz, default `now()` |
| `units` constraints/indexes | Only `units_pkey`; no store FK, uniqueness, or other check constraint |
| `units` RLS/grants | RLS enabled, not forced. Four policies (`anon_select_units`, insert/update/delete) allow `true` for `anon` and `authenticated`; both roles have all table privileges, including SELECT/INSERT/UPDATE/DELETE plus TRUNCATE, REFERENCES, and TRIGGER. RLS does not protect TRUNCATE, so revoking it is essential. |
| `products.unit` | Nullable text, default `'pcs'`; not a foreign key |
| `products.store_id` | Absent |
| `products.unit_id` | Absent |
| `units.store_id` | Absent |
| `products` relationship | `products` has its own UUID PK and brand/category FKs, but no unit FK. |
| `stores` | Zero current rows; `id` is the verified UUID store key. |

The unit catalog read returned unit IDs/labels/status. Product queries returned grouped unit counts and then product IDs with the unit string only; no product names or customer/sale/purchase rows were read.

## Existing Unit Rows

All 16 rows are active. Every label/code pair occurs twice with distinct IDs. No store can be attributed from the current schema.

| Unit name | `short_name` | First row ID | Duplicate row ID |
| --- | --- | --- | --- |
| Box | `Box` | `4adbdbe6-b8ec-4cd0-8e88-db3ee1d0f954` | `d7e767b2-8b84-4a2b-a0f2-fecadf443e17` |
| Dozen | `Dozen` | `0498ae2b-6fee-4ea6-bd18-d2c6e70d315b` | `58d214eb-252c-42da-9533-27f4539a71ae` |
| Gram | `Gram` | `371a1cc4-bead-485b-99d6-8c9f8b1293e4` | `aaeb4d00-151c-42e5-b9a0-4dd56adfa7eb` |
| Kilogram | `Kg` | `a5fa1498-03f4-4fd4-82ce-c092f42074b6` | `df2b14ce-cd6b-4a31-97c7-6ca833fccebb` |
| Liter | `Liter` | `4031ed71-faee-434b-ae87-93f6d1a48e37` | `d0a28353-f0a4-42d4-b5de-74f3f75640de` |
| Meter | `Meter` | `c776618f-897c-4b80-bd6c-3c5541becdf0` | `e7518cf0-4775-401a-b8f9-635d34fb76bd` |
| Pack | `Pack` | `49b69430-f702-47ad-a639-2f29e459763c` | `8a0f19e4-9441-46d2-bd45-a35adfdeffef` |
| Piece | `Pc(s)` | `1581a76e-9b87-406e-8c03-b3fc7372c76f` | `e7ca6780-120a-4e48-b2fc-d127012be750` |

These pairs may reflect duplicate seeding, but that is not established. Do not delete, merge, reassign, or pick a canonical ID based on identical labels alone. A store-owned model permits duplicates across stores, not duplicates within one store after ownership is assigned.

## Product Unit Mapping

| Existing `products.unit` value | Product count | Matching live `units.short_name` | Mapping status |
| --- | ---: | --- | --- |
| `pcs` | 28 | None; the live Piece code is `Pc(s)` | Unresolved for all 28 products |

There is one distinct product unit value, but text is not authoritative ownership or identity. The exact string also differs from the catalog code beyond case, so case-folding alone does not resolve it. Since `products` has no store key and there are zero stores, neither a product's target store nor a target `unit_id` can be established. Product IDs and unit strings were fetched for the unresolved mapping worksheet; no store/unit assignment is possible from this evidence.

**Required mapping input:** an approved mapping for every existing `units.id -> store_id`, every `products.id -> store_id`, and every `products.id -> unit_id`. If a unit maps to different stores, select or create an explicit unit row per store only after approval. Reject missing, multiple, or conflicting mappings. No product should be assigned based solely on `unit = 'pcs'`.

### Mapping Decision Outcomes

There are two candidate live rows for `Piece / Pc(s)`: `1581a76e-9b87-406e-8c03-b3fc7372c76f` and `e7ca6780-120a-4e48-b2fc-d127012be750`. Both are active and have identical names/codes. Neither has a store owner, and the products store `pcs`, not either row ID.

- Map all 28 `pcs` products to the first candidate: all would display `Pc(s)` and have a concrete same-store FK only after store mapping, but the choice of ID is unsupported and the second duplicate remains unexplained.
- Map all 28 to the second candidate: same visible result and same data-integrity gap, but the arbitrary ID choice is reversed. No evidence favors it.
- Keep both rows: this is valid only if an approved ownership map puts them in different stores. If both belong to the same store, case-insensitive per-store uniqueness rejects them; without uniqueness, import mapping by short name is nondeterministic and may select either row.
- Merge the duplicate pair: a chosen canonical row could represent the shared concept, but choosing the survivor is not evidenced. `products` currently has no `unit_id` FK, so no relational product references need migration according to the current schema; however, applications/API consumers may retain IDs, and a merge still requires a reference/dependency search and owner approval. Do not delete the other row in this task. A safer reviewed transition could mark it inactive and retain an explicit alias/canonical mapping, but uniqueness and future selection semantics must be decided first.

None of these choices is selected. The approved store-owned rule permits duplicate codes across different stores, not within one store. First map each unit row to an authoritative store; then decide whether duplicate rows are separate stores' catalogs or same-store duplicates. Only after that should each product ID receive an explicit store and unit ID.

The following product row keys were read with only their unit value. All remain unresolved; no store or unit ID has been assigned.

| Product ID | Current unit | Store ID | Unit ID | Mapping state |
| --- | --- | --- | --- | --- |
| `05b0be9d-ca8e-4eb5-a1e8-545f0295be58` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `064b68ee-e976-41cb-9932-93bb46fc31ca` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `1d176636-2080-43ef-95a7-95eee0c9e9d4` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `24dccfb5-1426-4e8a-b5c4-d5bb3697db2e` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `31b7a594-173b-4883-a173-496a0e9495e3` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `49118030-1bde-41d0-af16-a7d0c97410b1` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `4b132a9c-e993-4fcb-9bed-e84fc1e74374` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `552582fa-94b2-4852-acdf-ced36a2d28e3` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `561fe833-d256-4fcc-8631-8539963d4029` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `64120bb2-a84b-4b61-a50b-79e1f4df8afc` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `64c7c6ec-28ce-4dc9-9bd5-919ac8cc88ef` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `64ccb0f3-d035-42c6-9aab-04849b1042e6` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `722cbb08-1c6c-4372-be2b-15b6488dee3d` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `77d55705-4264-4c8b-be59-f76ecd977d8d` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `7af7bcf9-d43f-4974-8a4b-bce8b52fac59` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `7d61148e-4135-43d7-a9d3-fb943e9586ab` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `80f81676-4963-4572-80f5-f3ec7c5c45fe` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `96c79ccf-f166-4e6a-8728-362a2977761b` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `9ad51c5e-973a-48cc-96fe-aa549d26baf5` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `aca988fe-5cde-4d43-8daa-0e1de87b7414` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `be88f70a-11ec-4888-8367-efb91c6b5632` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `e5255ff9-ffab-43f5-9115-0ddc3d4f216b` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `eaaff1bb-c436-4ec4-847e-8c6fd2931a0d` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `ed5867ad-cb7f-49e6-a65f-29a05122a573` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `f1886d00-916e-4754-90e7-8f096c2cf2f2` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `f4eebedd-f2ab-4ac7-a3e1-1d734046473e` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `fae1f332-e04f-43af-baab-e4003c1f017e` | `pcs` | unresolved | unresolved | Needs owner and unit approval |
| `fe4a870d-44eb-4066-b9b9-3b921b53c898` | `pcs` | unresolved | unresolved | Needs owner and unit approval |

## Application Audit

No application files were changed.

| Path | Current unit behavior | Required later change |
| --- | --- | --- |
| `app/admin/units/page.tsx` | Loads every unit; performs direct insert/update/delete; client duplicate check compares `name` but not `short_name`; delete check searches products by exact `unit` text and ignores store; query errors are not consistently handled. | Resolve active store server-side; filter by it; include `store_id` on writes; validate names/codes server-side; make delete check store-scoped and handle FK restriction/error. |
| `app/admin/products/page.tsx` | Loads active units globally; form stores unit as text; defaults to `Pc(s)`; writes only `unit`; display counts use exact equality with `short_name`; CSV/print exports use text. | Load only current-store units; use `unit_id`; submit server-validated `store_id`; maintain a display label/legacy mirror during staged cutover; scope counts and exports. |
| `lib/csv-import.ts` | Maps unit names or short names to a text `short_name`; duplicate keys overwrite earlier values in iteration order; unknown/missing values silently fall back to `Pc(s)`. | Import against current-store unit IDs; fail preview on unknown/ambiguous units; remove silent fallback; require explicit selection/mapping. |
| `components/import-csv-dialog.tsx` | Receives a global `Unit[]` list and passes it to import mapping. | Receive only current-store units and report ambiguous/unmatched rows before write. |
| `types/index.ts` | `Unit` has no `store_id`; `Product.unit` is `string` with no `unit_id` or `store_id`. | Update these types only in the later approved app task. |
| Barcode generate/scan, inventory, POS, stock reconciliation | Display product stock with the free-text `product.unit`; no separate unit ownership lookup. | Display a unit relation/label resolved within the same store; don't join solely on text. |
| Purchases, sales, reports | Pages use products in purchase/POS/report workflows, but live `purchase_items`/`sale_items` store quantity and pricing without a unit snapshot; no other unit lookup was found. | Ensure product selection is store-scoped; decide whether future transaction rows should snapshot unit label/ID. Preserve historical quantity meaning; don't rewrite historical transactions in this task. |
| RPCs/triggers | Search found no unit-specific RPC or trigger. `complete_pos_sale` and purchase functions operate on products but current database functions lack the broader Auth/store/subscription checks documented in the tenant design. | Secure those RPCs separately before app rollout; ensure product and unit store IDs match in the transaction. |

## Relevant Migration History

The remote migration ledger `supabase_migrations.schema_migrations` is absent; `supabase migration list` showed every local version unmatched. These are object observations, not proof a whole migration ran.

- `20260917054040_enhance_product_management.sql` creates `units` without `store_id`, a unique short-name/name constraint, or a unit FK. It enables RLS, adds broad `true` anon/authenticated CRUD policies, and seeds eight defaults with untargeted `ON CONFLICT DO NOTHING` despite no unique constraint. Replaying this can add duplicates.
- `20260810042844_rebrand_to_clothing_store.sql` inserts products using legacy text unit values; the live products all currently have `pcs`.
- `20261024170000_add_store_tenant_isolation.sql` includes `units` and `products` in generic store_id add/backfill/NOT NULL policy lists. It assigns all listed rows to a hard-coded owner/store and does not create a `products.unit_id` relationship. Its owner precondition, old store schema assumptions, missing store status, and current zero-store state make it unsafe here. Do not run it.
- `20261024190000_add_store_employee_permissions.sql` mentions `units` as an inventory permission, but its membership/invitation schema/RPCs are absent remotely. Do not use it as current unit authorization.
- No other local migration found a unit FK or unit-specific RPC/trigger.

## Approved Schema Proposal

1. Add nullable `units.store_id uuid` referencing `public.stores(id) ON DELETE RESTRICT`; index by store scope. It becomes non-null only after every existing unit row has an approved owner.
2. Add nullable `products.store_id uuid` with the same restrictive store FK; it becomes non-null only after every product has an approved store assignment. This is a prerequisite from the larger tenant plan, not an assumption about the current table.
3. Add nullable `products.unit_id uuid`. Keep `products.unit` as a legacy display/compatibility field for the staged rollout. Do not use text equality as authorization.
4. Add unique `(units.id, units.store_id)` and `(products.id, products.store_id)` keys. Add composite `FOREIGN KEY (products.unit_id, products.store_id) REFERENCES units(id, store_id) ON UPDATE RESTRICT ON DELETE RESTRICT`. Add a B-tree index on `products(unit_id, store_id)`.
5. After per-store duplicates are resolved, enforce case-insensitive trimmed uniqueness with unique indexes on `(store_id, lower(btrim(short_name)))` and `(store_id, lower(btrim(name)))`. A store may reuse the same name/code in a different store. Decide whether display-name uniqueness is required; current UI enforces name uniqueness client-side, so the draft proposes it.
6. Use `ON DELETE RESTRICT` for stores and units. Updating unit labels/short names does not change `unit_id`; unit deletion is denied while products reference it. Product soft deletion remains an application concern.
7. Do not add a trigger that guesses store ownership or silently resolves `pcs`. Later app writes must provide the selected unit ID and store context; database RLS/FKs validate them.

## New-Store Provisioning

Store-owned means each store receives its own unit rows and UUIDs; never share a `units.id` across stores. Provisioning is part of the same transaction that creates the store, but the exact default catalog is not approved yet. Do not copy current duplicate rows or silently choose `Pc(s)`.

The historic local migration's eight-entry seed set is a candidate v1 catalog only: Piece/`Pc(s)`, Kilogram/`Kg`, Gram/`Gram`, Liter/`Liter`, Meter/`Meter`, Box/`Box`, Dozen/`Dozen`, Pack/`Pack`. This list is not an approved seed; duplicate current rows are not the seed identities. Approve the names/codes and descriptions before embedding a fixed payload.

Proposed idempotency design, after default values are approved:

1. Add a protected `provision_key` to units for seeded rows, unique per store when non-null. It is an internal, immutable key such as `base-v1:piece`, not a display name or user-editable `short_name`. Use column-level grants so clients cannot write/update it.
2. Add a private/internal `store_unit_catalog_versions(store_id, catalog_version, provisioned_at)` marker with primary key `(store_id, catalog_version)`. Revoke all client roles and expose no table policies.
3. An internal `SECURITY DEFINER` provisioning function locks the store row, returns immediately if the marker exists, inserts the approved seed rows using `(store_id, provision_key)` conflict handling, validates the expected provision keys and uniqueness, and inserts the version marker last. A failed insert/check rolls back the store signup transaction; retries see the marker and do not reinsert or overwrite owner customizations. Use a fixed, immutable seed payload for each version; do not silently change a version's payload.
4. Call this function explicitly from the existing Auth signup handler after exactly one store is resolved, and from a separately authorized Super Admin store-creation RPC. Do not add another Auth trigger or expose the provisioner directly to `anon`/`authenticated`.
5. Version future catalog additions explicitly. A new approved catalog version may add newly-keyed rows without resetting names/labels changed by a store. Do not treat removal of a default as a reason to recreate it on every call. The existing signup handler should call v1 after resolving its store; an approved store-creation RPC should call the same internal function. Never add a second Auth trigger.

The local SQL draft includes a commented, non-executable versioned provisioner that accepts a fixed seed payload. It intentionally does not choose or embed a default catalog, and it is not wired into the Auth handler or a store-creation RPC. The idempotency key, marker table, function, and call sites are proposals, not current schema facts.

## RLS, Grants, and Roles

The local SQL draft proposes a fixed-search-path `SECURITY DEFINER` helper `public.can_manage_store_units(uuid)` that returns true only for the caller's own `store_owner` profile when approved, linked to that store, and holding a current `trial`/`active` subscription. It uses existing live `public.is_super_admin()` for the approved Super Admin bypass. It does not use missing `get_my_store_id()` or absent memberships.

- `anon`/`PUBLIC`: no units or products table grants and no policies.
- Approved store owner with active subscription: SELECT/INSERT/UPDATE/DELETE own-store units; SELECT/INSERT/UPDATE own-store products, with no hard product DELETE. Unit delete is protected by RESTRICT FK.
- Approved Super Admin: cross-store access through `public.is_super_admin()`, which verifies both role and approved status; mutations remain auditable.
- Manager/cashier: no unit access is proposed until an approved membership design and the missing membership tables/RPCs exist.
- Products RLS is included because a product write is the path by which a unit could be assigned. The composite FK prevents a product's `unit_id` and `store_id` from referring across stores even if a client tampers with request values.
- Use authenticated-only table grants and `FORCE ROW LEVEL SECURITY`. Existing open policies must be fingerprinted; abort if unexpected permissive policies overlap rather than dropping policies by pattern.

## Migration Gates and Order

1. Confirm intended project reference and reconstruct the missing migration baseline from deployment records and schema fingerprints. Never mark all local migrations applied or replay the old tenant migration.
2. Recheck columns, constraints, indexes, grants, RLS policies, Auth helper security, subscription column names, and the owner-to-store model using read-only SQL in `drafts/store_owned_units.sql`.
3. Obtain an authoritative ownership map for every existing unit and product. Current evidence cannot provide one: there are zero stores, no ownership columns, and no verified admin-to-store mapping. Stop without one.
4. Obtain explicit product mapping from each `products.id` to a selected `units.id`. Resolve all duplicate unit rows and whether `pcs` means one of the `Pc(s)` rows. Do not execute an implicit text-based update.
5. Approve whether new stores receive a default unit catalog and how the signup/backend provisions per-store defaults. No seed behavior is proposed until then.
6. In a reviewed additive schema migration, add nullable columns and restrictive FKs; load only the approved map; update legacy text to the approved canonical display code if approved; add unique/index keys. Keep constraints `NOT VALID` until mapped data has been checked.
7. Run orphan, duplicate, null, and cross-store mismatch queries. Validate FKs and NOT NULL constraints only after all checks return zero; build unique indexes only after duplicate groups are resolved.
8. Apply authenticated-only grants, RLS helper/policies, and product RLS in a separate reviewed security migration. Replace only the exact audited open policies after confirming no permissive overlap. No `anon` access.
9. Application changes are explicitly deferred. After separate approval, update types, unit CRUD, product forms, imports, display joins, and store context; then test two isolated stores, including same unit code in each, cross-store read/write/assignment denial, subscription denial, and approved Super Admin behavior.
10. Record migration history only for SQL proven to have executed. No push, reset, repair, or history marking in this task.

## Validation and Rollback

Pre-migration exact read-only SQL is in `drafts/store_owned_units.sql`. Required post-backfill checks include:

```sql
-- Every unit and product has a real store; every product has a unit.
SELECT
  (SELECT count(*) FROM public.units WHERE store_id IS NULL) AS units_without_store,
  (SELECT count(*) FROM public.units u LEFT JOIN public.stores s ON s.id = u.store_id WHERE s.id IS NULL) AS units_with_invalid_store,
  (SELECT count(*) FROM public.products WHERE store_id IS NULL) AS products_without_store,
  (SELECT count(*) FROM public.products p LEFT JOIN public.stores s ON s.id = p.store_id WHERE s.id IS NULL) AS products_with_invalid_store,
  (SELECT count(*) FROM public.products WHERE unit_id IS NULL) AS products_without_unit;

-- No cross-store or missing unit relationship.
SELECT count(*) AS invalid_product_unit_links
FROM public.products p
LEFT JOIN public.units u ON u.id = p.unit_id
WHERE u.id IS NULL OR u.store_id IS DISTINCT FROM p.store_id;

-- No per-store duplicate case-insensitive trimmed codes/names.
SELECT store_id, lower(btrim(short_name)) AS normalized_short_name, count(*)
FROM public.units
GROUP BY store_id, lower(btrim(short_name)) HAVING count(*) > 1;
SELECT store_id, lower(btrim(name)) AS normalized_name, count(*)
FROM public.units
GROUP BY store_id, lower(btrim(name)) HAVING count(*) > 1;

-- Verify effective RLS and grants after policy migration.
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('units', 'products')
ORDER BY tablename, policyname;
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name IN ('units', 'products')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;
```

No cross-store behavior test has been run. After an approved deployment, use two non-production stores and accounts: each owner reads/manages only own units/products; owner A cannot read, mutate, delete, or assign owner B's unit; forged `store_id` and mismatched `(unit_id,store_id)` writes fail; missing/expired subscription fails if required; approved Super Admin can perform only intended cross-store actions; anon is denied. Test imports, product form, inventory/POS displays, and unit deletion while referenced.

Rollback must preserve all rows and migration history. If the app release fails, roll back the app first while keeping additive schema. Correct DB behavior with a reviewed forward migration. Do not drop columns/constraints containing mapped data, delete/merge duplicate units, or restore broad anon policies as rollback. Retain legacy `products.unit` until its consumers are migrated and separately reviewed.

## Decisions Still Needed

1. Authoritative mapping for all 16 existing unit IDs and 28 product rows to stores; current live database has zero stores. The mapping source must be an approved operational/business record, not product unit text or arbitrary row order.
2. Which duplicate unit ID is canonical per store, and whether each row should instead remain distinct after store ownership is known.
3. Whether every existing `pcs` product should use a `Pc(s)` unit, and which exact unit ID per store. Text alone is insufficient.
4. Whether to enforce case-insensitive uniqueness on both display `name` and `short_name` (proposed), and the approved normalization rules.
5. Whether new stores receive the historic eight-entry candidate catalog above, revised entries, or no defaults, and the exact v1 names/codes/descriptions.
6. Whether managers/cashiers may manage units; no membership schema/RPC is currently present.
7. Confirm case-insensitive trimmed uniqueness for `short_name` and uniqueness for display `name` within a store; current UI checks name case-insensitively but does not check `short_name`. The draft uses both. If same-store aliases are valid, define how product selection disambiguates them.
8. Whether the approved Super Admin may create/update/delete units cross-store, or only inspect them; the draft allows full audited management via `is_super_admin()`.
9. Whether the legacy `products.unit` text remains as a denormalized compatibility field or is removed in a later migration.
10. Confirm the target project reference and that no migration execution/history changes are authorized as part of this plan. None were performed.
