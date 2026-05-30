-- ============================================================
-- PATCH A: Emergency Privilege Containment
-- E1C-A2 — MiMenu Security Master Plan v1.3
--
-- PURPOSE:
--   Close the external (anon/PUBLIC) attack surface on all confirmed
--   P0 authorization vulnerabilities. Remove overbroad table grants
--   and insecure RLS policies that permit cross-tenant access.
--
-- CLASSIFICATION:
--   RPC P0s exposed to anon: P0-2, P0-3, P0-4, P0-6, P0-7, P0-8.
--   P0-1 (stock_ingresos) and P0-5 (team_members) are confirmed
--   authenticated authorization defects — anon exploitation is not
--   claimed based on current evidence.
--
-- WHAT THIS DOES NOT DO (deferred to Patch B/C):
--   - Does not add tenant guards inside function bodies
--   - Does not add role enforcement inside function bodies
--   - Does not add input validation (non-positive values)
--   - Does not drop legacy cerrar_mesa_atomico overloads
--   - Does not validate p_caja_shift_id branch/tenant match
--   - Does not implement server-side points earning
--   - Does not modify any function definitions
--
-- SAFETY: All statements are REVOKE, GRANT, DROP POLICY, CREATE POLICY.
--   No data is modified. No functions are altered. Fully reversible.
--
-- ROLLBACK: See companion file
--   docs/security/PATCH_A_VERIFICATION.sql for rollback guidance.
-- ============================================================

BEGIN;


-- ════════════════════════════════════════════════════════════
-- SECTION 1: REVOKE PUBLIC/anon EXECUTE on all P0 RPCs
-- ════════════════════════════════════════════════════════════

-- P0-2: get_top_products — cross-tenant analytics
REVOKE EXECUTE ON FUNCTION public.get_top_products(uuid, timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_products(uuid, timestamptz, timestamptz, integer) FROM anon;

-- P0-3: get_facturacion_range — cross-tenant revenue (zero callers in app code)
REVOKE EXECUTE ON FUNCTION public.get_facturacion_range(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_facturacion_range(uuid, timestamptz, timestamptz) FROM anon;

-- P0-4: increment_customer_points / decrement_customer_points — cross-tenant points
-- NOTE: Financial integrity NOT closed by this patch. Points earning remains
-- client-trusted. Patch C required for server-side earning and removal of
-- direct increment_customer_points from browser-callable surface.
REVOKE EXECUTE ON FUNCTION public.increment_customer_points(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_customer_points(uuid, integer) FROM anon;

REVOKE EXECUTE ON FUNCTION public.decrement_customer_points(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_customer_points(uuid, integer) FROM anon;

-- P0-6: cerrar_mesa_atomico — cross-tenant table close + caja manipulation
-- Production-confirmed overloads: 7-arg, 9-arg, 11-arg (Gate 0-C Block 5)
-- 7-arg (master_setup.sql):
REVOKE EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb) FROM anon;
-- 9-arg (server_discount_validation.sql):
REVOKE EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb, numeric, text) FROM anon;
-- 11-arg (server_points_validation.sql — canonical):
REVOKE EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb, numeric, text, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb, numeric, text, integer, uuid) FROM anon;

-- P0-7: append_caja_retiro — cross-tenant cash withdrawal
REVOKE EXECUTE ON FUNCTION public.append_caja_retiro(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_caja_retiro(uuid, jsonb) FROM anon;

-- P0-8: decrement_stock — cross-tenant stock manipulation
REVOKE EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric) FROM anon;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: RE-GRANT to verified legitimate callers
-- ════════════════════════════════════════════════════════════

-- P0-2: get_top_products — called by store.jsx (authenticated dashboard)
GRANT EXECUTE ON FUNCTION public.get_top_products(uuid, timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_products(uuid, timestamptz, timestamptz, integer) TO service_role;

-- P0-3: get_facturacion_range — zero callers, but retaining authenticated
-- compatibility as a defensive measure; will be tenant-guarded in Patch B
GRANT EXECUTE ON FUNCTION public.get_facturacion_range(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_facturacion_range(uuid, timestamptz, timestamptz) TO service_role;

-- P0-4: increment/decrement_customer_points
-- TEMPORARY COMPATIBILITY ALLOWANCE: authenticated granted until Patch C
-- implements server-side points earning and restricts these RPCs.
-- FINANCIAL INTEGRITY IS NOT CLOSED BY THIS GRANT.
GRANT EXECUTE ON FUNCTION public.increment_customer_points(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_customer_points(uuid, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.decrement_customer_points(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_customer_points(uuid, integer) TO service_role;

-- P0-6: cerrar_mesa_atomico — 11-arg ONLY granted to authenticated
-- All frontend callers (cajaService.js, offlineSync.js) use 11 args.
-- sync_close_table_operation calls 11-arg internally (confirmed lines 300-312).
-- 7-arg and 9-arg: NOT granted to authenticated or service_role.
-- No verified caller requires them. Legacy overloads will be dropped in Patch B.
GRANT EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb, numeric, text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_mesa_atomico(uuid, numeric, numeric, text, text, uuid, jsonb, numeric, text, integer, uuid) TO service_role;

-- P0-7: append_caja_retiro — called by AddRetiroModal.jsx and offlineSync.js
GRANT EXECUTE ON FUNCTION public.append_caja_retiro(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_caja_retiro(uuid, jsonb) TO service_role;

-- P0-8: decrement_stock — called by stockApi.js and offlineSync.js
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, numeric) TO service_role;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: P0-1 — stock_ingresos RLS containment
-- ════════════════════════════════════════════════════════════

-- Current production state (due to migration ordering):
--   - "stock_ingresos_branch" FOR ALL TO authenticated
--       USING/WITH CHECK (user_owns_branch(branch_id))    ← SECURE
--   - "stock_ingresos_read" FOR SELECT
--       USING (auth.role() = 'authenticated')              ← INSECURE (no tenant scope)
--   - "stock_ingresos_insert" FOR INSERT
--       WITH CHECK (auth.role() = 'authenticated')         ← INSECURE (no tenant scope)
--
-- All three are PERMISSIVE. The insecure policies override the tenant
-- restriction via PostgreSQL's OR-combination semantics.
--
-- Fix: Drop the two insecure policies. The secure "stock_ingresos_branch"
-- FOR ALL policy already covers SELECT, INSERT, UPDATE, and DELETE with
-- tenant scoping via user_owns_branch(branch_id).
--
-- NOTE: stock_ingresos_branch is FOR ALL, meaning it also permits
-- same-tenant UPDATE and DELETE. Whether Mozo/Cocinero should be able
-- to modify stock purchase records is a product/role-hardening decision,
-- not part of this cross-tenant containment fix.

DROP POLICY IF EXISTS "stock_ingresos_read"   ON public.stock_ingresos;
DROP POLICY IF EXISTS "stock_ingresos_insert" ON public.stock_ingresos;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: P0-5 — team_members grant + RLS containment
-- ════════════════════════════════════════════════════════════

-- EVIDENCE (confirmed 2026-05-30):
--   - Zero browser-side writes to team_members in current codebase.
--   - EquipoTab.jsx routes all mutations through invite-member Edge Function
--     (service_role), confirmed by tenantResolutionSecurity.test.js.
--   - Legacy TeamTab.jsx (direct insert/delete) has been removed.
--   - store.jsx only SELECTs via base44.entities.TeamMember.filter().
--
-- TARGET STATE:
--   - anon: no table access at all (RLS already blocks, but grants are overbroad)
--   - authenticated: SELECT only within same restaurant
--   - service_role: full CRUD (bypasses RLS; used by invite-member Edge Function)
--   - No authenticated INSERT/UPDATE/DELETE policies

-- 4a. Remove anon table access entirely (defense-in-depth)
REVOKE ALL ON TABLE public.team_members FROM anon;

-- 4b. Remove INSERT, UPDATE, DELETE grants from authenticated.
-- Only SELECT remains for role lookups and team display.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.team_members FROM authenticated;

-- 4c. Drop the overbroad FOR ALL policy that permits authenticated mutations
DROP POLICY IF EXISTS "team_members_restaurant" ON public.team_members;

-- 4d. Also drop any other write-permitting policies that may exist
DROP POLICY IF EXISTS "team_members_write"  ON public.team_members;
DROP POLICY IF EXISTS "team_members_insert" ON public.team_members;
DROP POLICY IF EXISTS "team_members_update" ON public.team_members;
DROP POLICY IF EXISTS "team_members_delete" ON public.team_members;

-- 4e. Recreate tenant-scoped SELECT-only policy for authenticated.
-- Drop first to avoid duplicate-name failure if it already exists.
DROP POLICY IF EXISTS "team_members_select" ON public.team_members;

CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

-- NOTE on P0-5 closure: This patch removes all browser-side mutation paths.
-- Full P0-5 closure also requires audit of invite-member Edge Function
-- hierarchy checks (currently verified: owner or Encargado required,
-- rol validated against ['Encargado','Mozo','Cocinero'], cannot create Dueno).
-- That audit is tracked for Patch B review, not this migration.


COMMIT;


-- ════════════════════════════════════════════════════════════
-- PATCH B/C BLOCKERS (recorded here for traceability, not implemented)
-- ════════════════════════════════════════════════════════════
--
-- P0-6/Patch B: Canonical 11-arg cerrar_mesa_atomico must validate the
--   effective caja_shift_id: COALESCE(p_caja_shift_id, v_turn.caja_shift_id),
--   not only the supplied p_caja_shift_id. Must validate same branch/tenant.
--   Must decide policy for closed-shift/offline reconciliation (FIN-2).
--
-- P0-6/Patch B: DROP legacy 7-arg and 9-arg overloads after stale-client
--   analysis (no verified caller uses them).
--
-- P0-5/Patch B: Audit invite-member Edge Function as sole team_members
--   mutation boundary. Verify hierarchy checks cover all escalation vectors
--   including Encargado->Dueno, self-promotion, and Dueno modification/deletion.
--
-- P0-4/Patch C (FIN-1): Server-side points earning must compute earned points
--   from the server-truth total inside cerrar_mesa_atomico, validate customer
--   even without redemption, prevent double earning, and restrict/remove both
--   standalone points mutation RPCs from browser-callable surface.
--
-- P0-8/Patch B: Role/trusted-origin guard (Dueno/Encargado only) required
--   inside decrement_stock function body.
--
-- P0-7/Patch B: Role guard (Dueno/Encargado only) and tenant validation
--   required inside append_caja_retiro function body.
--
-- P0-2, P0-3/Patch B: Tenant guards (user_owns_branch) required inside
--   get_top_products and get_facturacion_range function bodies.
--
-- P0-4/Patch B: Tenant + role + non-positive value guards required inside
--   increment_customer_points and decrement_customer_points function bodies.
--
-- Patch B and Patch C remain UNAPPROVED for migration writing.
