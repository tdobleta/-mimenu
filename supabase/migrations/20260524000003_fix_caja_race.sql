-- ============================================================
-- supabase/migrations/20260524000003_fix_caja_race.sql
-- Fase 0.2: Eliminar race condition en cerrar_mesa_atomico.
--
-- PROBLEMA (en 20260520000002_fix_cerrar_mesa_atomico.sql):
--   El UPDATE de caja_shifts usa SELECT SUM(...) → UPDATE:
--
--     SELECT COALESCE(SUM(total_facturado + COALESCE(propina, 0)), 0) INTO v_nuevo_total
--     FROM turns WHERE caja_shift_id = p_caja_shift_id AND status = 'cerrada';
--     UPDATE caja_shifts SET total_facturado_turno = v_nuevo_total WHERE id = p_caja_shift_id;
--
--   Si dos mesas se cierran simultáneamente, ambas transacciones:
--     1. Leen el mismo total base (ej: 1000)
--     2. Calculan el mismo v_nuevo_total (ej: ambas ven solo su propio cierre si no se ven entre sí)
--     3. La última que ejecuta el UPDATE sobreescribe a la primera
--   Resultado: el total de caja queda incorrecto (falta una mesa).
--
-- SOLUCIÓN:
--   Reemplazar el recálculo por una acumulación INCREMENTAL atómica:
--
--     UPDATE caja_shifts
--     SET total_facturado_turno = total_facturado_turno + p_total + COALESCE(p_propina, 0)
--     WHERE id = p_caja_shift_id;
--
--   PostgreSQL garantiza atomicidad de este UPDATE: cada transacción suma
--   su propia contribución sin interferir con otras. No hay SELECT previo.
--
-- SEGURIDAD DE LA MIGRACIÓN:
--   - CREATE OR REPLACE no requiere DROP y no lockea tablas
--   - El FOR UPDATE en turns sigue igual — protege contra doble cierre de mesa
--   - El cambio solo afecta el UPDATE de caja_shifts (líneas 49-55 del original)
--   - Compatible con la firma actual de la función (mismos parámetros)
--
-- APLICAR:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================

CREATE OR REPLACE FUNCTION cerrar_mesa_atomico(
  p_turn_id        uuid,
  p_total          numeric,
  p_propina        numeric,
  p_metodo         text,
  p_mozo           text,
  p_caja_shift_id  uuid    DEFAULT NULL,
  p_pagos_detalle  jsonb   DEFAULT NULL
)
RETURNS turns AS $$
DECLARE
  v_turn turns%ROWTYPE;
BEGIN
  -- Lock optimista: falla si ya fue cerrada por otro usuario/dispositivo
  SELECT * INTO v_turn
  FROM turns
  WHERE id = p_turn_id AND status = 'abierta'
  FOR UPDATE;

  IF NOT FOUND THEN
    -- RAISE EXCEPTION → llega como rpcError en el frontend (código P0001)
    -- Frontend detecta: rpcError.message.includes('ya cerrado') || rpcError.code === 'P0001'
    RAISE EXCEPTION 'turno ya cerrado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE turns SET
    status          = 'cerrada',
    closed_at       = now(),
    total_facturado = p_total,
    propina         = p_propina,
    metodo_pago     = p_metodo,
    mozo            = p_mozo,
    caja_shift_id   = COALESCE(p_caja_shift_id, caja_shift_id),
    pagos_detalle   = COALESCE(p_pagos_detalle, pagos_detalle)
  WHERE id = p_turn_id
  RETURNING * INTO v_turn;

  -- FIX: Acumulación incremental atómica en lugar de SELECT SUM → UPDATE.
  -- Previene la race condition donde dos cierres simultáneos calculan el
  -- mismo total base y la última escritura sobreescribe a la primera.
  -- Cada UPDATE suma solo su propia contribución — sin SELECT previo.
  IF p_caja_shift_id IS NOT NULL THEN
    UPDATE caja_shifts
    SET total_facturado_turno = total_facturado_turno + p_total + COALESCE(p_propina, 0)
    WHERE id = p_caja_shift_id;
  END IF;

  RETURN v_turn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- Verificar que la función fue actualizada:
-- SELECT prosrc FROM pg_proc WHERE proname = 'cerrar_mesa_atomico';
-- → El cuerpo debe contener 'total_facturado_turno + p_total' (no SUM)
--
-- Test de concurrencia (ejecutar en dos sessions simultáneas):
-- Session 1: SELECT cerrar_mesa_atomico('turn-A-uuid', 1000, 50, 'Efectivo', 'Juan', 'shift-uuid');
-- Session 2: SELECT cerrar_mesa_atomico('turn-B-uuid', 800, 0, 'Efectivo', 'Maria', 'shift-uuid');
-- Resultado esperado en caja_shifts.total_facturado_turno: 1850 (1050 + 800), no 1050 ni 800 solos.
