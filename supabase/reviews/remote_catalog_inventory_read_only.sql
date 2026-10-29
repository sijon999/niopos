-- READ-ONLY CATALOG REVIEW QUERIES.
-- Prepared locally only. None of these statements has been executed in this task.
-- Run manually only after independently confirming the intended project and a
-- read-only database role. Every statement in this file is SELECT-only.

-- Q01. Database/session identity. PostgreSQL does not expose the Supabase project ref.
SELECT current_database() AS database_name,
       current_user AS database_role,
       current_setting('server_version') AS server_version,
       current_setting('search_path') AS search_path,
       inet_server_addr() AS server_address,
       inet_server_port() AS server_port;

-- Q02. Tables, partitions, views, materialized views, foreign tables, and sequences.
SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       c.relkind AS relation_kind,
       pg_get_userbyid(c.relowner) AS owner_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       c.reloptions AS relation_options,
       CASE WHEN c.relkind IN ('v', 'm')
         THEN pg_get_viewdef(c.oid, true)
         ELSE NULL
       END AS view_definition
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
ORDER BY n.nspname, c.relkind, c.relname;

-- Q03. Columns, types, nullability, defaults, identity/generated information.
SELECT table_schema,
       table_name,
       ordinal_position,
       column_name,
       data_type,
       udt_schema,
       udt_name,
       is_nullable,
       column_default,
       is_identity,
       identity_generation,
       is_generated,
       generation_expression
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, ordinal_position;

-- Q04. All constraints and full definitions, including validation state.
SELECT n.nspname AS schema_name,
       rel.relname AS table_name,
       con.conname AS constraint_name,
       con.contype AS constraint_type,
       con.convalidated AS is_validated,
       con.condeferrable AS is_deferrable,
       con.condeferred AS initially_deferred,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint AS con
JOIN pg_class AS rel ON rel.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = rel.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname, rel.relname, con.conname;

-- Q05. Foreign-key relationships and referential actions.
SELECT child_ns.nspname AS child_schema,
       child.relname AS child_table,
       con.conname AS constraint_name,
       pg_get_constraintdef(con.oid, true) AS definition,
       parent_ns.nspname AS parent_schema,
       parent.relname AS parent_table,
       con.convalidated AS is_validated,
       con.confupdtype AS update_action_code,
       con.confdeltype AS delete_action_code
FROM pg_constraint AS con
JOIN pg_class AS child ON child.oid = con.conrelid
JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
JOIN pg_class AS parent ON parent.oid = con.confrelid
JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
WHERE con.contype = 'f'
  AND child_ns.nspname NOT IN ('pg_catalog', 'information_schema')
  AND child_ns.nspname NOT LIKE 'pg_toast%'
ORDER BY child_ns.nspname, child.relname, con.conname;

-- Q06. Index definitions, predicates, expressions, validity, and readiness.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, indexname;

SELECT n.nspname AS schema_name,
       rel.relname AS table_name,
       idx.relname AS index_name,
       i.indisunique AS is_unique,
       i.indisprimary AS is_primary,
       i.indisvalid AS is_valid,
       i.indisready AS is_ready,
       i.indisreplident AS is_replica_identity,
       pg_get_expr(i.indpred, i.indrelid) AS predicate,
       pg_get_expr(i.indexprs, i.indrelid) AS expressions
FROM pg_index AS i
JOIN pg_class AS rel ON rel.oid = i.indrelid
JOIN pg_namespace AS n ON n.oid = rel.relnamespace
JOIN pg_class AS idx ON idx.oid = i.indexrelid
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname, rel.relname, idx.relname;

-- Q07. RLS flags and all policies, including permissive/restrictive mode.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       p.policyname,
       p.permissive,
       p.roles,
       p.cmd,
       p.qual AS using_expression,
       p.with_check AS check_expression
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_policies AS p
  ON p.schemaname = n.nspname
 AND p.tablename = c.relname
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname, p.policyname;

-- Q08. Schema ACLs, including PUBLIC and effective USAGE/CREATE for API roles.
SELECT n.nspname AS schema_name,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
       CASE WHEN acl.grantor = 0 THEN 'PUBLIC' ELSE grantor.rolname END AS grantor,
       acl.privilege_type,
       acl.is_grantable,
       has_schema_privilege('anon', n.oid, 'USAGE') AS anon_usage,
       has_schema_privilege('anon', n.oid, 'CREATE') AS anon_create,
       has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_usage,
       has_schema_privilege('authenticated', n.oid, 'CREATE') AS authenticated_create
FROM pg_namespace AS n
CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS acl
LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname, grantee, acl.privilege_type;

-- Q09. Relation ACLs, including implicit/default ACLs, PUBLIC, and sequences.
SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       c.relkind AS relation_kind,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
       CASE WHEN acl.grantor = 0 THEN 'PUBLIC' ELSE grantor.rolname END AS grantor,
       acl.privilege_type,
       acl.is_grantable
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, c.relowner))
) AS acl
LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
ORDER BY n.nspname, c.relname, grantee, acl.privilege_type;

-- Q09b. Default privileges for future objects, if configured.
SELECT n.nspname AS schema_name,
       pg_get_userbyid(d.defaclrole) AS object_creator,
       d.defaclobjtype AS object_type,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
       CASE WHEN acl.grantor = 0 THEN 'PUBLIC' ELSE grantor.rolname END AS grantor,
       acl.privilege_type,
       acl.is_grantable
FROM pg_default_acl AS d
LEFT JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
WHERE n.nspname IS NULL OR n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, object_creator, d.defaclobjtype, grantee, acl.privilege_type;

-- Q10. Effective anon/authenticated table privileges, including TRUNCATE (not protected by RLS).
SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       c.relkind AS relation_kind,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
       has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
       has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
       has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon_truncate,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete,
       has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS authenticated_truncate
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname;

-- Q11. Column-level grants.
SELECT table_schema,
       table_name,
       column_name,
       grantee,
       privilege_type,
       is_grantable
FROM information_schema.column_privileges
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, column_name, grantee, privilege_type;

-- Q12. Sequence ACLs and effective anon/authenticated USAGE/SELECT/UPDATE.
SELECT n.nspname AS schema_name,
       s.relname AS sequence_name,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
       CASE WHEN acl.grantor = 0 THEN 'PUBLIC' ELSE grantor.rolname END AS grantor,
       acl.privilege_type,
       acl.is_grantable,
       has_sequence_privilege('anon', s.oid, 'USAGE') AS anon_usage,
       has_sequence_privilege('anon', s.oid, 'SELECT') AS anon_select,
       has_sequence_privilege('anon', s.oid, 'UPDATE') AS anon_update,
       has_sequence_privilege('authenticated', s.oid, 'USAGE') AS authenticated_usage,
       has_sequence_privilege('authenticated', s.oid, 'SELECT') AS authenticated_select,
       has_sequence_privilege('authenticated', s.oid, 'UPDATE') AS authenticated_update
FROM pg_class AS s
JOIN pg_namespace AS n ON n.oid = s.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(s.relacl, acldefault('S', s.relowner))) AS acl
LEFT JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
LEFT JOIN pg_roles AS grantor ON grantor.oid = acl.grantor
WHERE s.relkind = 'S'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname, s.relname, grantee, acl.privilege_type;

-- Q13. Every non-system routine that is SECURITY DEFINER or executable by a
-- client/service role. Full source supports manual search for dynamic SQL,
-- auth.uid(), tenant/subscription checks, unqualified names, and exception paths.
-- This reads function definitions; it does not invoke any routine.
SELECT n.nspname AS schema_name,
       p.proname AS routine_name,
       p.oid::regprocedure AS signature,
      pg_get_userbyid(p.proowner) AS owner_name,
       p.prokind AS routine_kind,
      l.lanname AS language_name,
       CASE WHEN p.prokind = 'p' THEN NULL ELSE pg_get_function_result(p.oid) END AS result_type,
       p.prosecdef AS security_definer,
       p.proleakproof AS leakproof,
       p.provolatile AS volatility,
       p.proconfig AS function_settings,
       p.proacl AS routine_acl,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
       p.prosrc ~* 'execute' AS source_contains_execute_token,
       p.prosrc AS source_body,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_language AS l ON l.oid = p.prolang
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND p.prokind IN ('f', 'p')
  AND (
    p.prosecdef
    OR has_function_privilege('anon', p.oid, 'EXECUTE')
    OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
    OR has_function_privilege('service_role', p.oid, 'EXECUTE')
  )
ORDER BY n.nspname, p.proname, p.oid::regprocedure::text;

-- Q14. Every trigger and exact function binding in non-system schemas.
SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       t.tgname AS trigger_name,
       t.tgenabled AS enabled_state,
       t.tgisinternal AS is_internal,
       pg_get_triggerdef(t.oid, true) AS trigger_definition,
       p.oid::regprocedure AS function_signature,
       p.prosecdef AS function_security_definer,
       p.proconfig AS function_settings,
       p.proacl AS function_acl,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_proc AS p ON p.oid = t.tgfoid
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname, c.relname, t.tgname;

-- Q15. Event-trigger inventory (DDL hooks) and function bindings.
SELECT e.evtname AS event_trigger_name,
       e.evtevent AS event_name,
       e.evtenabled AS enabled_state,
       e.evttags AS filtered_tags,
       p.oid::regprocedure AS function_signature,
       p.prosecdef AS function_security_definer,
       p.proconfig AS function_settings,
       p.proacl AS function_acl,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_event_trigger AS e
JOIN pg_proc AS p ON p.oid = e.evtfoid
ORDER BY e.evtname;

-- Q16. User-defined enum/domain/composite/range types and enum labels.
SELECT n.nspname AS schema_name,
       t.typname AS type_name,
       t.typtype AS type_kind,
       t.typcategory AS type_category,
       pg_get_userbyid(t.typowner) AS owner_name,
       pg_catalog.format_type(t.oid, NULL) AS formatted_type,
       e.enumsortorder AS enum_order,
       e.enumlabel AS enum_label
FROM pg_type AS t
JOIN pg_namespace AS n ON n.oid = t.typnamespace
LEFT JOIN pg_enum AS e ON e.enumtypid = t.oid
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND t.typtype IN ('d', 'e', 'c', 'r')
ORDER BY n.nspname, t.typname, e.enumsortorder;

-- Q17. Migration-ledger presence only. Do not query, create, repair, or update it.
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_ledger_relation;

-- Q18. Role memberships that can affect effective grants. inherit_option and
-- set_option require PostgreSQL 16+; prior project inspection reported PG 17.11.
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
WHERE parent.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
   OR member.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY parent.rolname, member.rolname;

-- Q19. Check storage relation presence without assuming the schema/table exists.
SELECT to_regclass('storage.buckets') AS storage_buckets_relation,
       to_regclass('storage.objects') AS storage_objects_relation;

-- Q20. Run only if Q19 shows storage.buckets exists and this role can read it.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;

-- Q21. Relevant role attributes, especially SUPERUSER and BYPASSRLS.
SELECT rolname,
       rolsuper,
       rolbypassrls,
       rolinherit,
       rolcreaterole,
       rolcreatedb,
       rolcanlogin
FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY rolname;
