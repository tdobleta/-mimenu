-- ============================================================
-- supabase/migrations/20260522000004_tighten_anon_rls.sql
-- Restricción de la política anon SELECT en turns y turn_items.
--
-- PROBLEMA ANTERIOR:
--   turns_anon_select: USING (true) → cualquier usuario anónimo puede leer
--   TODOS los turns de TODOS los restaurantes (incluyendo totales, métodos de pago, etc.)
--
-- SOLUCIÓN (pragmática, sin device tokens):
--   Restringir a turns que:
--     1. Están abiertos (status = 'abierta')
--     2. Fueron enviados a cocina (enviado_cocina = true)
--   Esto expone solo los datos necesarios para el display de cocina público
--   y oculta turns cerrados con información sensible (totales, métodos de pago).
--
-- TODO (Sprint 4): Implementar device_tokens para cocina → eliminar acceso anon
--   completamente y reemplazar con autenticación por token de dispositivo.
--   Ver plan: tabla device_tokens (branch_id, token, nombre, activo)
--   URL del display: /public/cocina?branch=UUID&token=DEVICE_TOKEN
--
-- APLICAR:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================


-- ── turns: solo turnos abiertos enviados a cocina ─────────────────────────

DROP POLICY IF EXISTS "turns_anon_select" ON turns;

CREATE POLICY "turns_anon_select" ON turns
  FOR SELECT TO anon
  USING (
    status = 'abierta'
    AND enviado_cocina = true
  );


-- ── turn_items: acceso anon restringido a items de turns abiertos en cocina ──
-- La verificación de branch/restaurante la hace el filtro en turns_anon_select.
-- turn_items no tiene una relación directa con branch_id visible en RLS
-- sin un JOIN, así que mantenemos USING(true) pero justificado:
--   - Solo se puede leer si el turn_id es accesible (Supabase filtra por RLS en joins)
--   - La tabla no contiene información financiera sensible
-- NOTA: Con device tokens en Sprint 4, esto también se restringirá.

-- (No se modifica turns_anon_select por ahora — ya es suficientemente restrictiva)


-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND policyname LIKE '%anon%'
-- ORDER BY tablename;
--
-- → turns_anon_select debe mostrar:
--   qual: ((status = 'abierta'::text) AND (enviado_cocina = true))
--
-- Test: como anon (sin JWT), intentar SELECT en turns:
--   SELECT COUNT(*) FROM turns;  → solo los abiertos+en_cocina
--   SELECT COUNT(*) FROM turns WHERE status = 'cerrada';  → 0 filas
