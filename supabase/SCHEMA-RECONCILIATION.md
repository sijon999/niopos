# Archived schema reconciliation (superseded)

> This document records a prior plan based on incomplete audit notes. Its migration and execution guidance is not current and must not be followed. Use [REMOTE_REMEDIATION_AUDIT.md](REMOTE_REMEDIATION_AUDIT.md) for the verified live findings, migration reconciliation, and no-write remediation plan.

The forward migration
`migrations/20261025009000_reconcile_store_schema_and_subscriptions.sql`
aligns the application with the confirmed `stores.store_name`,
`store_phone`, and `store_address` columns; retains the existing profile roles
and statuses; creates the missing employee invitation/membership and
subscription tables; and adds the corresponding access functions and RLS.

The user-provided live catalog inspection found one `auth.users` insert
trigger, `on_auth_user_created`, calling `public.handle_new_user_profile()`.
That function creates a pending `admin` profile and safely derives a missing
name, but does not create a store. The migration verifies that this is the only
`auth.users` insert trigger and replaces that same function in place. It does
not add a second signup trigger. It creates a pending profile and a store for
normal signup; valid employee invitations create pending profiles and
memberships, not approved accounts.

The inspected live profile policies allow users to read their own profile and
allow approved Super Admin reads through `is_super_admin()`. The inspected
store policies allow an owner to read/insert/update their own store and use a
profile-role-only lookup for Super Admin access. The migration replaces those
three named store policies, restricting them to `authenticated` and using
`public.is_super_admin()` for the Super Admin branch so suspended/rejected
profiles cannot qualify merely by role. It also replaces
`public.is_super_admin()` with a `SECURITY DEFINER` helper that checks both
`role = 'super_admin'` and `status = 'approved'`, with an empty search path and
RLS disabled inside the helper to avoid recursive profile-policy evaluation.
The migration leaves profile policies unchanged and installs RLS for the new
membership, invitation, plans, subscriptions, and payments tables.

## Prerequisites and preflight

1. Back up the Supabase project and reconcile its migration history. Do not
   blindly replay the historical tenant/subscription migrations.
2. Confirm `public.profiles`, `public.stores`, and
   `public.is_super_admin()` exist. Confirm `profiles.id` references
   `auth.users.id`, and `stores.owner_id` references the owning profile.
3. Confirm `public.stores` has `id`, `owner_id`, `store_name`, `store_phone`,
   and `store_address`. The migration aborts if those columns do not exist; it
   does not rename the confirmed store columns.
4. Confirm profile roles are within `super_admin`, `admin`, `manager`,
   `cashier`, `staff`, `user`, and `store_owner`; statuses are within
   `pending`, `approved`, `rejected`, and `suspended`. The migration retains
   those role values and does not replace the status constraint.
5. Inspect and save the current auth trigger/function definition before
   applying. Confirm the trigger inventory still has exactly one
   `auth.users` INSERT trigger named `on_auth_user_created`, targeting
   `public.handle_new_user_profile()`. The migration contains a matching
   guard and aborts if the inventory has changed.
6. Review and save the current definition of `public.is_super_admin()` and all
   current policies on `profiles`, `stores`, and any pre-existing related
   tables. The migration only replaces the three named store policies listed
   above; inspect additional policies for permissive overlaps. Confirm no
   other function depends on undocumented behavior from the current
   `is_super_admin()` implementation.
7. The migration creates `store_memberships`, `store_invitations`, `plans`,
   `subscriptions`, and `payments` only if absent. Review the schema queries
   below; investigate any unexpected pre-existing object before deployment.

Run these read-only queries against the intended Supabase project:

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'stores', 'store_memberships', 'store_invitations',
    'plans', 'subscriptions', 'payments'
  )
ORDER BY table_name, ordinal_position;

SELECT t.tgname AS trigger_name,
       p.oid::regprocedure AS function_signature,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_proc AS p ON p.oid = t.tgfoid
WHERE n.nspname = 'auth'
  AND c.relname = 'users'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'stores', 'store_memberships', 'store_invitations',
    'plans', 'subscriptions', 'payments'
  )
ORDER BY tablename, policyname;

SELECT role, status, count(*)
FROM public.profiles
GROUP BY role, status
ORDER BY role, status;

SELECT pg_get_functiondef('public.is_super_admin()'::regprocedure);
```

## Execution order

1. Confirm the preflight output and retain a backup of the current
   `handle_new_user_profile()` definition for possible recovery.
2. Apply the single versioned migration using the project's normal Supabase
   migration workflow. If executing SQL manually, use a transaction if the
   SQL Editor does not already wrap the script transactionally.
3. The script validates the store schema and profile role/status data, creates
   employee and subscription tables/indexes, defines functions, then installs
   RLS/grants and replaces the existing signup function. The trigger remains
   `on_auth_user_created`; no additional trigger is created.
4. The migration sends `NOTIFY pgrst, 'reload schema'`. If PostgREST still
   reports a missing RPC, allow the notification to complete, then reload the
   schema cache in Supabase and retry.

Do not apply this migration automatically from application code.

## Rollback considerations

- Before commit, abort/rollback the migration if any validation or DDL fails.
- After commit, do not run a blanket `DROP TABLE`, reset, or data rollback.
  New signup rows, invitations, memberships, and billing records may have
  been written after deployment; preserve them.
- If a post-deployment issue requires rollback, first disable/roll back the
  application release and inspect current records and dependencies. Prepare a
  reviewed forward corrective migration. Restore the saved trigger function
  and `is_super_admin()` definitions only after reviewing the consequences.
  Restoring the previous trigger function returns signup to profile-only
  behavior and no longer creates stores for subsequent signups.
- Do not remove role/status constraints or existing tables as a rollback
  shortcut. Keep the schema and data until a separately reviewed migration
  can safely account for dependent records.

## Manual verification

After applying, run:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
  AND contype = 'c'
ORDER BY conname;

SELECT t.tgname, p.oid::regprocedure, pg_get_functiondef(p.oid)
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_proc AS p ON p.oid = t.tgfoid
WHERE n.nspname = 'auth'
  AND c.relname = 'users'
  AND NOT t.tgisinternal;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'stores', 'store_memberships', 'store_invitations',
    'plans', 'subscriptions', 'payments'
  )
ORDER BY tablename, policyname;

SELECT p.oid::regprocedure AS function_signature,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_super_admin';

SELECT p.oid::regprocedure AS function_signature,
       pg_get_function_result(p.oid) AS result_type
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_my_store_id', 'has_active_subscription', 'has_store_access',
    'manage_store_subscription', 'record_subscription_payment',
    'handle_new_user_profile'
  )
ORDER BY function_signature::text;
```

Then test using separate accounts and a test store:

1. Sign up a normal account with `store_name` omitted. Confirm there is exactly
   one profile with `role = 'admin'`, `status = 'pending'`, and the Auth UUID;
   exactly one owned store with a nonempty fallback `store_name`; and
   `profiles.store_id` matches that store's `id`.
2. Sign up with `full_name` and `store_name` omitted. Confirm the profile name
   falls back to the email local part (or `New User`) and the store name has a
   nonempty fallback.
3. Confirm a valid employee invitation creates one pending profile and one
   pending membership. Confirm invalid, expired, revoked, or mismatched-email
   invitations fail and do not create profile/store records.
4. As a verified Super Admin, approve a pending owner and employee. Confirm
   approval metadata is recorded for profiles and memberships become approved
   where applicable. Confirm rejecting/suspending changes the status without
   deleting data.
5. Confirm a pending, rejected, or suspended account cannot access POS, even
   when a store has an active subscription. Confirm approval alone does not
   enable POS without a current trial/active subscription.
6. Confirm an approved owner can only resolve their own store subscription;
   an unrelated account cannot read or change another store's subscription or
   payment records. Confirm only a verified Super Admin can manage plans,
   subscriptions, and payments through the RPCs.
7. Verify existing profiles, stores, products, sales, customers, settings,
   and payment rows remain present. The migration does not bulk-assign
   existing `profiles.store_id` values.

The migration has not been applied to Supabase. Repository checks do not
validate SQL syntax or live RLS behavior; treat the post-application checks
above as required deployment verification.
