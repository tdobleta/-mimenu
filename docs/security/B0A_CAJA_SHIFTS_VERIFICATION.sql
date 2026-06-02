-- ============================================================
-- B0-A CAJA_SHIFTS VERIFICATION AND SUPPORT
--
-- Companion to migration:
--   20260602000001_b0a_caja_shifts_data_api_containment.sql
--
-- ============================================================
-- A. SCOPE AND RESIDUAL RISKS
-- ============================================================
--
-- B0-A removes direct Data-API INSERT/UPDATE/DELETE access on
-- public.caja_shifts from all browser-facing roles (authenticated,
-- anon, PUBLIC). Authenticated retains tenant-scoped SELECT only.
--
-- The following are explicitly NOT addressed by B0-A:
--
--   append_caja_retiro:
--     SECURITY DEFINER RPC. Production-confirmed body contains
--     NO tenant, branch, or role validation. It performs:
--       UPDATE caja_shifts SET retiros = ... WHERE id = p_shift_id
--         AND status = 'abierto'
--     Cross-tenant/no-role financial mutation remains possible for
--     any authenticated caller with a valid open shift UUID.
--     Requires separate Patch B remediation.
--
--   cerrar_mesa_atomico:
--     SECURITY DEFINER RPC residual risk. Production-confirmed
--     definition lacks sufficient tenant/role validation for the
--     supplied turn and shift identifiers. B0-A does not add
--     internal tenant/role/shift validation or trusted subtotal
--     derivation. Requires separate Patch B remediation.
--
--   P0-6B (direct turns Data-API writes), P0-6C (direct turn_items
--   Data-API writes with client-sourced prices), FIN-3 (direct
--   mutation/reassignment of turns.caja_shift_id), REV-LOSS
--   (offlineSync annulled-turn handling), and reconciliation design
--   remain open Patch B workstreams.
--
--   Patch B is NOT closed by B0-A.
--
-- ============================================================
-- B. PRE-APPLY PRODUCTION EVIDENCE (captured 2026-06-02)
-- ============================================================
--
-- Policies on public.caja_shifts before B0-A:
--
--   caja_shifts_branch
--     PERMISSIVE, FOR ALL, TO {authenticated}
--     USING: user_owns_branch(branch_id)
--     WITH CHECK: user_owns_branch(branch_id)
--
--   caja_shifts_select
--     PERMISSIVE, SELECT, TO {public}
--     USING: branch_id IN (
--       SELECT branches.id FROM branches
--       WHERE branches.restaurant_id = get_user_restaurant_id()
--     )
--     WITH CHECK: null
--
--   caja_shifts_write
--     PERMISSIVE, FOR ALL, TO {public}
--     USING: (
--       branch_id IN (
--         SELECT branches.id FROM branches
--         WHERE branches.restaurant_id = get_user_restaurant_id()
--       )
--     ) AND (
--       get_user_role() = ANY (ARRAY['Dueno'::text, 'Encargado'::text])
--     )
--     WITH CHECK: null
--
-- Raw ACL (relacl) before B0-A:
--   {postgres=arwdDxtm/postgres,
--    anon=arwdDxtm/postgres,
--    authenticated=arwdDxtm/postgres,
--    service_role=arwdDxtm/postgres}
--
-- Direct grants: anon, authenticated, service_role, postgres each
-- held ALL PRIVILEGES (arwdDxtm) granted directly by postgres.
-- No direct PUBLIC grant row was present.
--
-- Effective privileges before B0-A:
--   anon:          SELECT/INSERT/UPDATE/DELETE = true
--   authenticated: SELECT/INSERT/UPDATE/DELETE = true
--   service_role:  SELECT/INSERT/UPDATE/DELETE = true
--   postgres:      SELECT/INSERT/UPDATE/DELETE = true


-- ============================================================
-- C. READ-ONLY POST-APPLY VERIFICATION
-- ============================================================
-- All queries below are SELECT-only catalog/privilege inspections.
-- No INSERT, UPDATE, DELETE, RPC call, or other mutation.

-- C1. Verify RLS remains enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'caja_shifts' AND schemaname = 'public';
-- Expected: rowsecurity = true

-- C2. Verify exactly one policy exists
SELECT
  policyname, permissive, roles, cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'caja_shifts'
ORDER BY policyname;
-- Expected: exactly one row:
--   policyname: caja_shifts_authenticated_select
--   permissive: PERMISSIVE
--   roles: {authenticated}
--   cmd: SELECT
--   using_expression: user_owns_branch(branch_id)
--   with_check_expression: null
-- caja_shifts_branch, caja_shifts_write, caja_shifts_select must NOT appear.

-- C3. Verify raw ACL reflects containment
SELECT c.relacl::text AS raw_acl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'caja_shifts';
-- Expected ACL entries:
--   postgres=arwdDxtm/postgres       (unchanged, full owner privileges)
--   service_role=arwdDxtm/postgres   (unchanged, full privileges)
--   authenticated=r/postgres         (SELECT only)
-- anon must NOT appear.
-- No empty-grantee (PUBLIC) entry must appear.

-- C4. Verify parsed direct grants
SELECT grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'caja_shifts'
ORDER BY grantee, privilege_type;
-- Expected:
--   authenticated: SELECT only
--   anon: must NOT appear
--   service_role: full grant set (unchanged)
--   postgres: full grant set (unchanged)

-- C5. Verify effective privileges
SELECT
  role_name,
  has_table_privilege(role_name, 'public.caja_shifts', 'SELECT')  AS eff_select,
  has_table_privilege(role_name, 'public.caja_shifts', 'INSERT')  AS eff_insert,
  has_table_privilege(role_name, 'public.caja_shifts', 'UPDATE')  AS eff_update,
  has_table_privilege(role_name, 'public.caja_shifts', 'DELETE')  AS eff_delete
FROM (VALUES ('anon'), ('authenticated'), ('service_role'), ('postgres')) AS r(role_name)
ORDER BY role_name;
-- Expected:
--   anon:          false / false / false / false
--   authenticated: true  / false / false / false
--   service_role:  true  / true  / true  / true
--   postgres:      true  / true  / true  / true

-- C6. Verify SECURITY DEFINER RPCs retain EXECUTE grants
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'open_caja_shift_operation',
    'close_caja_shift_operation',
    'cerrar_mesa_atomico',
    'append_caja_retiro',
    'sync_close_table_operation'
  )
ORDER BY routine_name, grantee;
-- Expected: each RPC retains EXECUTE for its current grantees.
-- B0-A does not modify function grants.


-- ============================================================
-- D. ROLLBACK SQL
-- ============================================================
-- ROLLBACK SQL — NOT AUTHORIZED FOR EXECUTION WITHOUT SEPARATE APPROVAL
--
-- The following block restores the exact pre-B0-A state.
-- service_role and postgres are not restored because B0-A never
-- modifies them.
-- PUBLIC grants are not restored because production ACL evidence
-- showed no direct PUBLIC grants.
--
-- DO NOT EXECUTE without separate rollback authorization.
--
-- /*
-- DROP POLICY IF EXISTS "caja_shifts_authenticated_select" ON public.caja_shifts;
--
-- CREATE POLICY "caja_shifts_branch" ON public.caja_shifts
--   FOR ALL TO authenticated
--   USING (user_owns_branch(branch_id))
--   WITH CHECK (user_owns_branch(branch_id));
--
-- CREATE POLICY "caja_shifts_select" ON public.caja_shifts
--   FOR SELECT TO public
--   USING (
--     branch_id IN (
--       SELECT branches.id
--       FROM branches
--       WHERE branches.restaurant_id = get_user_restaurant_id()
--     )
--   );
--
-- CREATE POLICY "caja_shifts_write" ON public.caja_shifts
--   FOR ALL TO public
--   USING (
--     (
--       branch_id IN (
--         SELECT branches.id
--         FROM branches
--         WHERE branches.restaurant_id = get_user_restaurant_id()
--       )
--     )
--     AND (
--       get_user_role() = ANY (ARRAY['Dueno'::text, 'Encargado'::text])
--     )
--   );
--
-- GRANT ALL PRIVILEGES ON TABLE public.caja_shifts TO anon;
-- GRANT ALL PRIVILEGES ON TABLE public.caja_shifts TO authenticated;
-- */


-- ============================================================
-- E. CONTROLLED MUTATION-BEARING SMOKE/SECURITY-TEST PLAN
-- ============================================================
-- These are mutation-bearing tests. They are NOT production
-- read-only verification. Execution requires a separately approved
-- controlled test environment and procedure.
--
-- DO NOT EXECUTE in production. DO NOT EXECUTE without separate
-- test-environment authorization.
--
-- ── E1. Direct-Write Denial Tests (Security Containment) ────────
--
-- D1: INSERT into caja_shifts as authenticated via PostgREST
--     supabase.from('caja_shifts').insert({...})
--     Expected: permission denied
--
-- D2: UPDATE caja_shifts as authenticated via PostgREST
--     supabase.from('caja_shifts').update({...}).eq('id', '...')
--     Expected: permission denied
--
-- D3: DELETE from caja_shifts as authenticated via PostgREST
--     supabase.from('caja_shifts').delete().eq('id', '...')
--     Expected: permission denied
--
-- D4: SELECT from caja_shifts as anon via PostgREST
--     supabase.from('caja_shifts').select('*') using anon key
--     Expected: zero rows or permission denied
--
-- D5: INSERT into caja_shifts as anon via PostgREST
--     supabase.from('caja_shifts').insert({...}) using anon key
--     Expected: permission denied
--
-- ── E2. RPC Functional Regression Tests ─────────────────────────
--
-- R1: Open a new caja shift via open_caja_shift_operation
--     Expected: shift created, status='abierto'
--     Validates: SECURITY DEFINER bypasses revoked grants
--
-- R2: Append a retiro via append_caja_retiro
--     Expected: retiro appended to retiros jsonb
--     Validates: SECURITY DEFINER bypasses revoked grants
--
-- R3: Open turn, add items, close via sync_close_table_operation
--     Expected: turn closed, total_facturado_turno updated
--     Validates: primary close path works
--
-- R4: Open turn, add items, close via cerrar_mesa_atomico (legacy)
--     Expected: turn closed, total_facturado_turno incremented
--     Validates: legacy fallback works (execute only if explicitly
--     needed for regression coverage)
--
-- R5: Close the caja shift via close_caja_shift_operation
--     Expected: shift status='cerrado', totals recalculated
--     Validates: SECURITY DEFINER bypasses revoked grants
--
-- ── E3. Browser-Path Functional Regression Tests ────────────────
--
-- F1: cajaService.js cache read (SELECT via PostgREST)
--     Expected: returns total_facturado_turno value
--     Validates: authenticated SELECT preserved
--
-- F2: Full POS flow: open caja -> open table -> add items ->
--     close table -> close caja
--     Expected: all operations succeed, totals correct
--     Validates: end-to-end regression
--
-- F3: Supabase Realtime subscription on caja_shifts
--     Expected: receives change events for authenticated user branch
--     Validates: Realtime respects new SELECT policy
--
-- ── E4. Execution Order ─────────────────────────────────────────
--
-- 1. D1-D5 (confirm containment before functional tests)
-- 2. R1 -> R2 -> R3 -> F1 -> R4 -> R5 (sequential RPC regression)
-- 3. F2 (end-to-end)
-- 4. F3 (Realtime)
