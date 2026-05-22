-- Previene que dos turnos de caja estén abiertos simultáneamente en la misma sucursal.
-- Sin este índice dos tablets pueden abrir turno al mismo tiempo → dos caja_shifts activos
-- → totales divididos y reportes de caja rotos.
--
-- Verificar que no hay duplicados ANTES de aplicar:
--   SELECT branch_id, COUNT(*) FROM caja_shifts
--   WHERE status = 'abierto' GROUP BY branch_id HAVING COUNT(*) > 1;
-- Si devuelve filas → cerrar los turnos duplicados manualmente primero.

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_caja_per_branch
  ON caja_shifts (branch_id)
  WHERE status = 'abierto';
