-- Migration: Índice UNIQUE para prevenir split-brain (dos mesas abiertas con el mismo número)
--
-- ⚠️  PASO OBLIGATORIO ANTES DE EJECUTAR:
-- Verificar que NO hay duplicados actuales. Si la query devuelve filas → resolver
-- manualmente (cerrar los turns duplicados) antes de continuar.
--
-- SELECT branch_id, mesa_num, COUNT(*), array_agg(id) AS turn_ids
-- FROM turns
-- WHERE status = 'abierta'
-- GROUP BY branch_id, mesa_num
-- HAVING COUNT(*) > 1;
--
-- Si la query anterior retorna 0 filas, ejecutar lo siguiente:

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_turns_one_open_per_table
  ON turns(branch_id, mesa_num)
  WHERE status = 'abierta';

-- CONCURRENTLY: no lockea la tabla en producción (puede tardar 1-5 min).
-- IF NOT EXISTS: idempotente, seguro de re-ejecutar.

-- Verificación post-migración:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'turns'
--   AND indexname = 'idx_turns_one_open_per_table';

-- Rollback (si fuera necesario):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_turns_one_open_per_table;
