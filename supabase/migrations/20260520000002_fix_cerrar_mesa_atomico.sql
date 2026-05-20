-- Migration: Corregir cerrar_mesa_atomico
-- Bug: el UPDATE no incluía SET caja_shift_id (se perdía la asociación con el turno de caja)
-- Mejora: agregar parámetro p_pagos_detalle para desglose de pagos mixtos
--
-- CREATE OR REPLACE es atómico y no lockea la tabla.
-- Prerequisito: ejecutar 20260520000001_add_turns_columns.sql primero
--   (necesita la columna turns.pagos_detalle)

CREATE OR REPLACE FUNCTION cerrar_mesa_atomico(
  p_turn_id        uuid,
  p_total          numeric,
  p_propina        numeric,
  p_metodo         text,
  p_mozo           text,
  p_caja_shift_id  uuid    DEFAULT NULL,
  p_pagos_detalle  jsonb   DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_turn turns%ROWTYPE;
  v_nuevo_total numeric;
BEGIN
  -- Lock optimista: falla si ya fue cerrada por otro usuario/dispositivo
  SELECT * INTO v_turn
  FROM turns
  WHERE id = p_turn_id AND status = 'abierta'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'turno_ya_cerrado');
  END IF;

  UPDATE turns SET
    status          = 'cerrada',
    closed_at       = now(),
    total_facturado = p_total,
    propina         = p_propina,
    metodo_pago     = p_metodo,
    mozo            = p_mozo,
    caja_shift_id   = COALESCE(p_caja_shift_id, caja_shift_id),   -- FIX: antes no se seteaba
    pagos_detalle   = COALESCE(p_pagos_detalle, pagos_detalle)    -- NUEVO: desglose mixto
  WHERE id = p_turn_id;

  -- Actualizar acumulado del turno de caja (lógica existente preservada)
  IF p_caja_shift_id IS NOT NULL THEN
    SELECT COALESCE(SUM(total_facturado + propina), 0) INTO v_nuevo_total
    FROM turns
    WHERE caja_shift_id = p_caja_shift_id AND status = 'cerrada';

    UPDATE caja_shifts
    SET total_facturado_turno = v_nuevo_total
    WHERE id = p_caja_shift_id;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificación:
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'cerrar_mesa_atomico';
-- Testear (reemplazar UUIDs reales):
-- SELECT cerrar_mesa_atomico(
--   'turn-uuid-aqui',
--   1000, 50, 'Efectivo', 'Juan',
--   'shift-uuid-aqui',
--   '[{"metodo":"Efectivo","monto":1000}]'::jsonb
-- );
