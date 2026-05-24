-- ============================================================
-- supabase/migrations/20260524000002_fix_anon_rls.sql
-- Fase 0.1: Restringir turn_items_anon_select de USING(true) a
-- solo ítems de turns que están abiertos y enviados a cocina.
--
-- PROBLEMA:
--   La migración 20260522000002 dejó turn_items con USING(true),
--   permitiendo que cualquier usuario anónimo lea TODOS los ítems
--   de pedidos de TODOS los restaurantes.
--   La migración 20260522000004 corrigió 'turns' pero
--   explícitamente dejó turn_items sin corregir.
--
-- SOLUCIÓN:
--   Subquery sobre turns con las mismas condiciones que turns_anon_select:
--     status = 'abierta' AND enviado_cocina = true
--   Esto expone solo los ítems necesarios para el display de cocina
--   y oculta todo lo demás (ítems de turns cerrados, pagos, totales).
--
-- COMPATIBILIDAD:
--   CocinaDisplay.jsx usa:
--     supabase.from('turn_items').select('*').in('turn_id', openTurnIds)
--   Los openTurnIds son turns del branch con status='abierta' — que ya
--   pasan el filtro de turns_anon_select. Esta migración NO rompe cocina.
--
-- APLICAR:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================

DROP POLICY IF EXISTS "turn_items_anon_select" ON turn_items;

CREATE POLICY "turn_items_anon_select" ON turn_items
  FOR SELECT TO anon
  USING (
    turn_id IN (
      SELECT id FROM turns
      WHERE status = 'abierta'
        AND enviado_cocina = true
    )
  );


-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- Ejecutar como anon (sin JWT) en SQL Editor:
--
-- SET ROLE anon;
-- SELECT COUNT(*) FROM turn_items
--   WHERE turn_id IN (SELECT id FROM turns WHERE status = 'cerrada');
-- → Debe retornar 0
--
-- SELECT COUNT(*) FROM turn_items
--   WHERE turn_id IN (SELECT id FROM turns WHERE status = 'abierta' AND enviado_cocina = true);
-- → Retorna ítems de cocina (puede ser 0 si no hay comandas activas)
--
-- RESET ROLE;
