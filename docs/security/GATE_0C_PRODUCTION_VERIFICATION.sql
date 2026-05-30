-- ============================================================
-- GATE 0-C: Production Read-Only Corroboration Queries
-- MiMenu Security Master Plan v1.2
--
-- PURPOSE: Verify that repository-identified P0 vulnerabilities
-- are active in the live Supabase production database.
--
-- SAFETY: Every query is a read-only SELECT against PostgreSQL
-- catalog tables (pg_policies, pg_proc, pg_catalog, information_schema).
-- No data is modified. No tables are altered. No functions are called.
--
-- INSTRUCTIONS:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Run each numbered block separately
--   3. Copy/screenshot results for each block
--   4. Paste results back in the conversation
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- BLOCK 1: P0-1 — stock_ingresos RLS policies
-- Expected vulnerable state: policies use auth.role() = 'authenticated'
-- with no tenant/branch isolation
-- ────────────────────────────────────────────────────────────

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual   AS using_expression,
  with_check
FROM pg_policies
WHERE tablename = 'stock_ingresos'
ORDER BY policyname;


-- ────────────────────────────────────────────────────────────
-- BLOCK 2: P0-2 & P0-3 — get_top_products / get_facturacion_range
-- Expected: SECURITY DEFINER, no tenant check in body,
-- EXECUTE granted to PUBLIC
-- ────────────────────────────────────────────────────────────

SELECT
  p.proname                                    AS function_name,
  pg_get_function_identity_arguments(p.oid)    AS arguments,
  p.prosecdef                                  AS is_security_definer,
  p.provolatile                                AS volatility,
  l.lanname                                    AS language,
  p.proacl                                     AS acl_privileges,
  pg_get_functiondef(p.oid)                    AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l  ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname IN ('get_top_products', 'get_facturacion_range')
ORDER BY p.proname;


-- ────────────────────────────────────────────────────────────
-- BLOCK 3: P0-4 — increment_customer_points / decrement_customer_points
-- Expected: SECURITY DEFINER, no tenant check, PUBLIC execute
-- ────────────────────────────────────────────────────────────

SELECT
  p.proname                                    AS function_name,
  pg_get_function_identity_arguments(p.oid)    AS arguments,
  p.prosecdef                                  AS is_security_definer,
  l.lanname                                    AS language,
  p.proacl                                     AS acl_privileges,
  pg_get_functiondef(p.oid)                    AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l  ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname IN ('increment_customer_points', 'decrement_customer_points')
ORDER BY p.proname;


-- ────────────────────────────────────────────────────────────
-- BLOCK 4: P0-5 — team_members RLS policies
-- Expected: single FOR ALL policy with no role restriction
-- ────────────────────────────────────────────────────────────

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual   AS using_expression,
  with_check
FROM pg_policies
WHERE tablename = 'team_members'
ORDER BY policyname;


-- ────────────────────────────────────────────────────────────
-- BLOCK 5: P0-6 — cerrar_mesa_atomico (ALL overloads)
-- IMPORTANT: Earlier testing found both 7-arg and 9-arg
-- overloads may exist. This query returns all of them.
-- Expected: SECURITY DEFINER, no tenant check, PUBLIC execute
-- ────────────────────────────────────────────────────────────

SELECT
  p.proname                                    AS function_name,
  pg_get_function_identity_arguments(p.oid)    AS arguments,
  p.pronargs                                   AS arg_count,
  p.prosecdef                                  AS is_security_definer,
  l.lanname                                    AS language,
  p.proacl                                     AS acl_privileges,
  pg_get_functiondef(p.oid)                    AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l  ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname = 'cerrar_mesa_atomico'
ORDER BY p.pronargs;


-- ────────────────────────────────────────────────────────────
-- BLOCK 6: P0-7 — append_caja_retiro
-- Expected: SECURITY DEFINER, no tenant/role check, PUBLIC execute
-- ────────────────────────────────────────────────────────────

SELECT
  p.proname                                    AS function_name,
  pg_get_function_identity_arguments(p.oid)    AS arguments,
  p.prosecdef                                  AS is_security_definer,
  l.lanname                                    AS language,
  p.proacl                                     AS acl_privileges,
  pg_get_functiondef(p.oid)                    AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l  ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname = 'append_caja_retiro'
ORDER BY p.proname;


-- ────────────────────────────────────────────────────────────
-- BLOCK 7: P0-8 — decrement_stock (ALL overloads)
-- Expected: legacy 2-param version still exists, SECURITY DEFINER
-- Newer decrement_stock_with_egreso is safe (shown for comparison)
-- ────────────────────────────────────────────────────────────

SELECT
  p.proname                                    AS function_name,
  pg_get_function_identity_arguments(p.oid)    AS arguments,
  p.pronargs                                   AS arg_count,
  p.prosecdef                                  AS is_security_definer,
  l.lanname                                    AS language,
  p.proacl                                     AS acl_privileges,
  pg_get_functiondef(p.oid)                    AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l  ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname IN ('decrement_stock', 'decrement_stock_with_egreso')
ORDER BY p.proname, p.pronargs;


-- ────────────────────────────────────────────────────────────
-- BLOCK 8: P0-X — Full SECURITY DEFINER inventory
-- All public-schema SECURITY DEFINER functions and their
-- EXECUTE privileges. Identifies any additional vulnerable
-- functions not yet in the P0 register.
-- ────────────────────────────────────────────────────────────

SELECT
  p.proname                                    AS function_name,
  pg_get_function_identity_arguments(p.oid)    AS arguments,
  p.prosecdef                                  AS is_security_definer,
  l.lanname                                    AS language,
  p.proacl                                     AS acl_privileges,
  CASE
    WHEN p.proacl IS NULL THEN 'DEFAULT (PUBLIC can execute)'
    WHEN array_to_string(p.proacl, ',') LIKE '%=X/%' THEN 'PUBLIC explicit'
    WHEN array_to_string(p.proacl, ',') LIKE '%authenticated=X/%' THEN 'authenticated'
    WHEN array_to_string(p.proacl, ',') LIKE '%service_role=X/%'
     AND array_to_string(p.proacl, ',') NOT LIKE '%authenticated=X/%'
     AND array_to_string(p.proacl, ',') NOT LIKE '%anon=X/%'
     THEN 'service_role only'
    ELSE 'check acl manually'
  END                                          AS execute_access_summary
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l  ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname, p.pronargs;


-- ────────────────────────────────────────────────────────────
-- BLOCK 9: Bonus — RLS status for critical tables
-- Verify RLS is enabled on tables that should have it
-- ────────────────────────────────────────────────────────────

SELECT
  c.relname        AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'stock_ingresos', 'team_members', 'turns', 'turn_items',
    'caja_shifts', 'menu_items', 'branches', 'restaurants',
    'customers', 'stock_items', 'stock_egresos', 'employee_logins',
    'employee_login_attempts', 'staff_pins', 'facturas',
    'facturas_contingencia', 'reservations', 'restaurant_settings',
    'device_tokens'
  )
ORDER BY c.relname;
