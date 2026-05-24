-- ============================================================
-- supabase/migrations/20260524000005_turn_items_branch_index.sql
-- Fase 3: Índice en turn_items.branch_id para filtro server-side de Realtime.
--
-- CONTEXTO:
--   subscribeToTurnItems en realtimeManager.js usaba un canal global
--   'turn_items_global' sin filtro server-side. Todos los eventos de
--   turn_items de todos los restaurantes llegaban a todos los clientes
--   conectados y el filtro era client-side (usando activeTurnIdsByBranch Map).
--
--   Con 100 restaurantes y 3 tablets por restaurante = 300 clientes
--   recibiendo TODOS los eventos de turn_items de todos los restaurantes.
--   Supabase envía el dato, el cliente lo descarta — desperdicio de ancho de banda.
--
-- SOLUCIÓN:
--   Supabase Realtime v2 soporta filtros de columna directa:
--     filter: 'branch_id=eq.{branchId}'
--   Esto requiere un índice en la columna para que el lookup sea eficiente.
--
--   Después de aplicar esta migración, realtimeManager.js puede cambiar el
--   canal de 'turn_items_global' a 'turn_items_{branchId}' con filtro server-side.
--   Cada cliente recibe solo los eventos de su propia sucursal.
--
-- APLICAR:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================

-- Índice para el filtro server-side de Realtime y para queries frecuentes
-- (WHERE branch_id = ? es el patrón más común en turn_items)
CREATE INDEX IF NOT EXISTS idx_turn_items_branch
  ON turn_items (branch_id);

-- Índice compuesto para el patrón SELECT * FROM turn_items WHERE branch_id=? AND turn_id IN (...)
-- Muy común en CocinaDisplay y Salon al cargar la comanda de una mesa.
CREATE INDEX IF NOT EXISTS idx_turn_items_branch_turn
  ON turn_items (branch_id, turn_id);


-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'turn_items'
-- ORDER BY indexname;
-- → Debe incluir idx_turn_items_branch y idx_turn_items_branch_turn
--
-- EXPLAIN SELECT * FROM turn_items WHERE branch_id = 'some-uuid';
-- → Debe usar Index Scan en idx_turn_items_branch (no Seq Scan)
