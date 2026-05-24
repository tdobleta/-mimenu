-- ============================================================
-- supabase/migrations/20260524000004_turn_items_idempotency.sql
-- Fase 1: Idempotencia offline para INSERT_TURN_ITEM y egresos de stock.
--
-- PROBLEMA:
--   Si drainQueue procesa un INSERT_TURN_ITEM y la red cae después de que
--   PostgreSQL insertó pero antes de que Supabase retorne la respuesta, el
--   error sube y el ítem se reintenta → duplicado en la comanda de cocina.
--
--   Mismo problema para stock_egresos: retry de descontarStockPorMesa
--   puede insertar el mismo egreso dos veces.
--
-- SOLUCIÓN:
--   Columna client_uid en ambas tablas con índice UNIQUE parcial (WHERE NOT NULL).
--   Permite NULL para operaciones sin idempotencia (inserción manual, etc.)
--   y garantiza unicidad para operaciones desde la cola offline.
--
--   En offlineSync.js: INSERT_TURN_ITEM pasa client_uid = op.id (op.id es
--   el ID de IndexedDB, estable entre reintentos del mismo op).
--   Error code 23505 (unique_violation en client_uid) se trata como éxito.
--
--   En stockApi.js: addEgreso recibe client_uid opcional generado como:
--   `stock_{turnId}_{menuItemId}_{ingredienteId}` — determinístico por
--   combinación turn+plato+ingrediente.
--
-- APLICAR:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================


-- ── turn_items.client_uid ─────────────────────────────────────────────────

ALTER TABLE turn_items ADD COLUMN IF NOT EXISTS client_uid TEXT;

-- Índice UNIQUE parcial: unicidad solo cuando client_uid no es NULL.
-- Las inserciones manuales o antiguas (client_uid = NULL) no se ven afectadas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_turn_items_client_uid
  ON turn_items (client_uid)
  WHERE client_uid IS NOT NULL;


-- ── stock_egresos.client_uid ──────────────────────────────────────────────

ALTER TABLE stock_egresos ADD COLUMN IF NOT EXISTS client_uid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_egresos_client_uid
  ON stock_egresos (client_uid)
  WHERE client_uid IS NOT NULL;


-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name IN ('turn_items', 'stock_egresos')
--   AND column_name = 'client_uid';
-- → Debe retornar 2 filas
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('turn_items', 'stock_egresos')
--   AND indexname LIKE '%client_uid%';
-- → Debe retornar 2 índices UNIQUE parciales
--
-- Test de idempotencia (no debe lanzar error):
-- INSERT INTO turn_items (turn_id, branch_id, menu_item_name, cantidad, precio, client_uid)
--   VALUES (gen_random_uuid(), gen_random_uuid(), 'Test', 1, 100, 'test-uid-1');
-- INSERT INTO turn_items (turn_id, branch_id, menu_item_name, cantidad, precio, client_uid)
--   VALUES (gen_random_uuid(), gen_random_uuid(), 'Test Retry', 1, 100, 'test-uid-1');
-- → Segunda inserción falla con código 23505 — el frontend lo trata como éxito.
-- DELETE FROM turn_items WHERE client_uid = 'test-uid-1';  -- Limpiar test
