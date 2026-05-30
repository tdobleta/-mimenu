-- ============================================================
-- PATCH A: Post-Apply Read-Only Verification Queries
-- MiMenu Security Master Plan — E1C-A2
--
-- PURPOSE: Verify that Patch A privilege containment was applied
-- correctly in production. Every query is a read-only SELECT.
--
-- INSTRUCTIONS:
--   1. Apply 20260530000001_patch_a_privilege_containment.sql
--   2. Open Supabase Dashboard → SQL Editor
--   3. Run each numbered block separately
--   4. Compare results against EXPECTED values
--   5. Paste results back for review
--
-- ROLLBACK GUIDANCE (if verification fails):
--   GRANT EXECUTE ON FUNCTION public.get_top_products(uuid, timestamptz, timestamptz, integer) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.get_facturacion_range(uuid, timestamptz, timestamptz) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.increment_customer_points(uuid, integer) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.decrement_customer_points(uuid, integer) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb, numeric, text) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb, numeric, text, integer, uuid) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.append_caja_retiro(uuid, jsonb) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric) TO PUBLIC;
--   GRANT ALL ON TABLE public.team_members TO anon;
--   GRANT INSERT, UPDATE, DELETE ON TABLE public.team_members TO authenticated;
--   -- Re-create dropped policies:
--   CREATE POLICY "team_members_restaurant" ON public.team_members FOR ALL TO authenticated
--     USING (restaurant_id = get_user_restaurant_id()) WITH CHECK (restaurant_id = get_user_restaurant_id());
--   CREATE POLICY "stock_ingresos_read" ON public.stock_ingresos FOR SELECT USING (auth.role() = 'authenticated');
--   CREATE POLICY "stock_ingresos_insert" ON public.stock_ingresos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
--   DROP POLICY IF EXISTS "team_members_select" ON public.team_members;
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- BLOCK 1: P0 RPC anon EXECUTE — must all be FALSE
-- ────────────────────────────────────────────────────────────

SELECT
  function_name,
  arguments,
  has_function_privilege('anon', oid, 'execute') AS anon_can_execute
FROM (
  SELECT p.oid, p.proname AS function_name,
         pg_get_function_identity_arguments(p.oid) AS arguments
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'get_top_products',
      'get_facturacion_range',
      'increment_customer_points',
      'decrement_customer_points',
      'cerrar_mesa_atomico',
      'append_caja_retiro',
      'decrement_stock'
    )
) sub
ORDER BY function_name, arguments;

-- EXPECTED: All rows show anon_can_execute = false


-- ────────────────────────────────────────────────────────────
-- BLOCK 2: cerrar_mesa_atomico — authenticated EXECUTE
--          11-arg = true, 7-arg and 9-arg = false
-- ────────────────────────────────────────────────────────────

SELECT
  p.proname AS function_name,
  p.pronargs AS arg_count,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  has_function_privilege('authenticated', p.oid, 'execute') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'cerrar_mesa_atomico'
ORDER BY p.pronargs;

-- EXPECTED:
--   7-arg: authenticated=false, service_role=false
--   9-arg: authenticated=false, service_role=false
--  11-arg: authenticated=true,  service_role=true


-- ────────────────────────────────────────────────────────────
-- BLOCK 3: Authenticated EXECUTE retained on operational RPCs
-- ────────────────────────────────────────────────────────────

SELECT
  function_name,
  has_function_privilege('authenticated', oid, 'execute') AS authenticated_can_execute,
  has_function_privilege('service_role', oid, 'execute') AS service_role_can_execute
FROM (
  SELECT p.oid,
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS function_name
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      (p.proname = 'get_top_products' AND p.pronargs = 4)
      OR (p.proname = 'get_facturacion_range' AND p.pronargs = 3)
      OR (p.proname = 'increment_customer_points' AND p.pronargs = 2)
      OR (p.proname = 'decrement_customer_points' AND p.pronargs = 2)
      OR (p.proname = 'append_caja_retiro' AND p.pronargs = 2)
      OR (p.proname = 'decrement_stock' AND p.pronargs = 2)
    )
) sub
ORDER BY function_name;

-- EXPECTED: All rows show authenticated=true, service_role=true


-- ────────────────────────────────────────────────────────────
-- BLOCK 4: stock_ingresos — insecure policies removed
-- ────────────────────────────────────────────────────────────

SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE tablename = 'stock_ingresos'
ORDER BY policyname;

-- EXPECTED: Only "stock_ingresos_branch" remains (FOR ALL, user_owns_branch).
-- "stock_ingresos_read" and "stock_ingresos_insert" must NOT appear.


-- ────────────────────────────────────────────────────────────
-- BLOCK 5: team_members — grants and policies
-- ────────────────────────────────────────────────────────────

-- 5a. Table grants
SELECT
  grantee, privilege,
  has_table_privilege(grantee, 'public.team_members', privilege) AS granted
FROM (
  VALUES
    ('anon', 'SELECT'), ('anon', 'INSERT'), ('anon', 'UPDATE'), ('anon', 'DELETE'),
    ('authenticated', 'SELECT'), ('authenticated', 'INSERT'),
    ('authenticated', 'UPDATE'), ('authenticated', 'DELETE'),
    ('service_role', 'SELECT'), ('service_role', 'INSERT'),
    ('service_role', 'UPDATE'), ('service_role', 'DELETE')
) AS checks(grantee, privilege)
ORDER BY grantee, privilege;

-- EXPECTED:
--   anon:          SELECT=false, INSERT=false, UPDATE=false, DELETE=false
--   authenticated: SELECT=true,  INSERT=false, UPDATE=false, DELETE=false
--   service_role:  SELECT=true,  INSERT=true,  UPDATE=true,  DELETE=true

-- 5b. RLS policies
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE tablename = 'team_members'
ORDER BY policyname;

-- EXPECTED: Only "team_members_select" (FOR SELECT, authenticated,
-- USING restaurant_id = get_user_restaurant_id()).
-- No INSERT/UPDATE/DELETE policies. No "team_members_restaurant".
