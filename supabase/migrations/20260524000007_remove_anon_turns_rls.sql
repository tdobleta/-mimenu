-- ============================================================
-- supabase/migrations/20260524000007_remove_anon_turns_rls.sql
-- Fase 4: Eliminar políticas anon de turns y turn_items.
--
-- CONTEXTO:
--   Antes de Fase 4, CocinaDisplay.jsx usaba la anon key para llamar
--   a cocina-update Edge Function. Eso requería que la pantalla de cocina
--   pudiera leer turns y turn_items como usuario anónimo para mostrar
--   las comandas. (Y en versiones anteriores, CocinaDisplay fue diseñado
--   para ser público sin autenticación).
--
--   Ahora:
--   - cocina-update requiere un device token válido (hex64 en device_tokens).
--   - CocinaDisplay carga datos usando la sesión autenticada del dueño/encargado.
--   - No existe flujo legítimo que necesite acceso anon a turns/turn_items.
--
--   La migración 20260524000002_fix_anon_rls.sql restringió la policy anon
--   de turn_items a "solo turns abiertos y en cocina". Esta migración va
--   un paso más allá y elimina esa policy completamente.
--
-- IMPACTO:
--   - turn_items: eliminar "turn_items_anon_select" (restringida en 000002)
--   - turns: eliminar "turns_anon_select" si existe (política permisiva original)
--   - Ningún flujo de la app usa anon select en estas tablas post-Fase 4.
--
-- VERIFICAR ANTES DE APLICAR:
--   1. Confirmar que CocinaDisplay funciona con device token configurado.
--   2. Confirmar que cocina-update retorna { ok: true } con device token.
--   3. Confirmar que el display NO usa acceso anon para cargar comandas.
--
-- ROLLBACK (si algo falla):
--   CREATE POLICY "turn_items_anon_select" ON turn_items
--     FOR SELECT TO anon
--     USING (turn_id IN (
--       SELECT id FROM turns WHERE status = 'abierta' AND enviado_cocina = true
--     ));
-- ============================================================

-- turn_items: eliminar política anon (ya restringida en migración 000002)
DROP POLICY IF EXISTS "turn_items_anon_select" ON turn_items;

-- turns: eliminar política anon si existe alguna variante permisiva
DROP POLICY IF EXISTS "turns_anon_select" ON turns;
DROP POLICY IF EXISTS "turns_cocina_anon" ON turns;

-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- SET ROLE anon;
-- SELECT COUNT(*) FROM turn_items; -- debe retornar 0 o error de permiso
-- SELECT COUNT(*) FROM turns;      -- debe retornar 0 o error de permiso
-- RESET ROLE;
--
-- -- Verificar que el display autenticado SÍ puede leer:
-- -- (con sesión del dueño)
-- SELECT COUNT(*) FROM turns WHERE status = 'abierta' AND branch_id = 'tu-branch-id';
-- -- debe retornar el número real de turns abiertos
