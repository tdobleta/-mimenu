-- ============================================================
-- B0-A: Direct Data-API Containment for public.caja_shifts
--
-- SCOPE:
--   Remove all direct INSERT/UPDATE/DELETE capability on
--   public.caja_shifts from browser-facing roles (authenticated,
--   anon, PUBLIC). Retain tenant-scoped SELECT for authenticated.
--
--   All legitimate caja_shifts mutations continue to flow through
--   SECURITY DEFINER RPCs (open_caja_shift_operation,
--   close_caja_shift_operation, cerrar_mesa_atomico,
--   append_caja_retiro, sync_close_table_operation) which execute
--   as postgres and bypass both grants and RLS.
--
-- PATCH B STATUS:
--   Patch B remains open after this migration. B0-A reduces one
--   confirmed P0 direct-write surface only. It does not close the
--   full caja financial boundary.
--
-- RESIDUAL RISKS NOT FIXED BY THIS MIGRATION:
--   - append_caja_retiro: SECURITY DEFINER RPC with no tenant,
--     branch, or role validation in its body. Cross-tenant mutation
--     remains possible for authenticated callers with a valid open
--     shift UUID. Requires separate remediation.
--   - cerrar_mesa_atomico: SECURITY DEFINER RPC lacking sufficient
--     tenant/role validation for supplied turn/shift identifiers.
--     Requires separate remediation.
--   - P0-6B (turns), P0-6C (turn_items), FIN-3 (turns.caja_shift_id
--     reassignment), REV-LOSS (annulled-turn handling) remain open.
--
-- APPLICATION-CODE DEPENDENCY:
--   No application-code dependency is changed by this file.
--   The only direct browser access to caja_shifts is a SELECT
--   (cajaService.js L123-127 cache read), which is preserved.
-- ============================================================

-- Drop all three existing browser-facing policies.
DROP POLICY IF EXISTS "caja_shifts_branch" ON public.caja_shifts;
DROP POLICY IF EXISTS "caja_shifts_write"  ON public.caja_shifts;
DROP POLICY IF EXISTS "caja_shifts_select" ON public.caja_shifts;

-- Revoke all direct privileges from anon, authenticated, and PUBLIC.
-- service_role and postgres are not modified.
REVOKE ALL PRIVILEGES ON TABLE public.caja_shifts FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.caja_shifts FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.caja_shifts FROM PUBLIC;

-- Restore SELECT only to authenticated for the cache read path.
GRANT SELECT ON TABLE public.caja_shifts TO authenticated;

-- Single browser-facing policy: tenant-scoped SELECT for authenticated.
CREATE POLICY "caja_shifts_authenticated_select"
  ON public.caja_shifts
  FOR SELECT TO authenticated
  USING (user_owns_branch(branch_id));
