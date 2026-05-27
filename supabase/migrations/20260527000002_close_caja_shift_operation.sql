-- ============================================================
-- Caja shift close operation
--
-- Closing a cash shift affects accounting, audit, and operator trust. This
-- moves the critical write from the browser into one idempotent server-side
-- operation.
-- ============================================================

ALTER TABLE caja_shifts
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS close_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS close_payload JSONB DEFAULT '{}'::JSONB;

CREATE OR REPLACE FUNCTION close_caja_shift_operation(p_operation JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_id      TEXT;
  v_operation_type    TEXT;
  v_restaurant_id     UUID;
  v_branch_id         UUID;
  v_shift_id          UUID;
  v_actor_user_id     UUID;
  v_actor_email       TEXT;
  v_authorized_rest   UUID;
  v_role              TEXT;
  v_branch_name       TEXT;
  v_shift             caja_shifts%ROWTYPE;
  v_existing          business_operations%ROWTYPE;
  v_arqueo            NUMERIC := 0;
  v_motivo            TEXT;
  v_nombre_turno      TEXT;
  v_total_real        NUMERIC := 0;
  v_ventas_efectivo   NUMERIC := 0;
  v_retiros_total     NUMERIC := 0;
  v_efectivo_esperado NUMERIC := 0;
  v_diferencia        NUMERIC := 0;
  v_open_turns        INTEGER := 0;
  v_result            JSONB;
BEGIN
  IF p_operation IS NULL THEN
    RAISE EXCEPTION 'operation required' USING ERRCODE = '22023';
  END IF;

  v_operation_id := p_operation->>'operation_id';
  v_operation_type := p_operation->>'operation_type';
  v_restaurant_id := NULLIF(p_operation #>> '{tenant,restaurant_id}', '')::UUID;
  v_branch_id := NULLIF(p_operation #>> '{tenant,branch_id}', '')::UUID;
  v_shift_id := NULLIF(p_operation #>> '{caja,caja_shift_id}', '')::UUID;
  v_actor_user_id := auth.uid();
  v_actor_email := COALESCE(NULLIF(auth.jwt()->>'email', ''), NULLIF(p_operation #>> '{actor,email}', ''), 'Sistema');
  v_arqueo := COALESCE(NULLIF(p_operation #>> '{caja,arqueo_efectivo}', '')::NUMERIC, 0);
  v_motivo := LEFT(TRIM(COALESCE(p_operation #>> '{caja,motivo_diferencia}', '')), 500);
  v_nombre_turno := LEFT(TRIM(COALESCE(p_operation #>> '{caja,nombre_turno}', '')), 120);

  IF v_operation_id IS NULL OR v_operation_id = '' THEN
    RAISE EXCEPTION 'operation_id required' USING ERRCODE = '22023';
  END IF;

  IF v_operation_type <> 'CLOSE_CAJA_SHIFT' THEN
    RAISE EXCEPTION 'unsupported operation_type %', v_operation_type USING ERRCODE = '22023';
  END IF;

  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'caja_shift_id required' USING ERRCODE = '22023';
  END IF;

  SELECT cs.*
  INTO v_shift
  FROM caja_shifts cs
  WHERE cs.id = v_shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno de caja no encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_branch_id := COALESCE(v_branch_id, v_shift.branch_id);

  SELECT b.restaurant_id, b.nombre
  INTO v_restaurant_id, v_branch_name
  FROM branches b
  WHERE b.id = v_branch_id
    AND (v_restaurant_id IS NULL OR b.restaurant_id = v_restaurant_id);

  v_authorized_rest := get_user_restaurant_id();
  v_role := get_user_role();

  IF v_authorized_rest IS NULL OR v_restaurant_id IS NULL OR v_authorized_rest <> v_restaurant_id THEN
    RAISE EXCEPTION 'sin permiso para cerrar caja' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('Dueno', 'Encargado') THEN
    RAISE EXCEPTION 'sin permiso para cerrar caja' USING ERRCODE = '42501';
  END IF;

  INSERT INTO business_operations (
    operation_id,
    operation_type,
    operation_version,
    restaurant_id,
    branch_id,
    caja_shift_id,
    actor_user_id,
    payload
  )
  VALUES (
    v_operation_id,
    v_operation_type,
    COALESCE((p_operation->>'operation_version')::INTEGER, 1),
    v_restaurant_id,
    v_branch_id,
    v_shift_id,
    v_actor_user_id,
    p_operation
  )
  ON CONFLICT (operation_id) DO NOTHING
  RETURNING * INTO v_existing;

  IF NOT FOUND THEN
    SELECT *
    INTO v_existing
    FROM business_operations
    WHERE operation_id = v_operation_id
    FOR UPDATE;

    IF v_existing.status = 'applied' THEN
      RETURN COALESCE(v_existing.result, jsonb_build_object(
        'ok', true,
        'already_applied', true,
        'operation_id', v_operation_id
      ));
    END IF;
  END IF;

  SELECT cs.*
  INTO v_shift
  FROM caja_shifts cs
  WHERE cs.id = v_shift_id
    AND cs.branch_id = v_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno de caja no encontrado para esta sucursal' USING ERRCODE = 'P0002';
  END IF;

  IF v_shift.status <> 'abierto' THEN
    RAISE EXCEPTION 'el turno de caja ya esta cerrado' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)
  INTO v_open_turns
  FROM turns
  WHERE branch_id = v_branch_id
    AND status = 'abierta';

  IF v_open_turns > 0 THEN
    RAISE EXCEPTION 'hay mesas abiertas: %', v_open_turns USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(COALESCE(total_facturado, 0) + COALESCE(propina, 0)), 0)
  INTO v_total_real
  FROM turns
  WHERE caja_shift_id = v_shift_id
    AND status = 'cerrada';

  SELECT COALESCE(SUM(
    CASE
      WHEN pagos_detalle IS NOT NULL AND jsonb_typeof(pagos_detalle) = 'array' THEN
        (
          SELECT COALESCE(SUM(COALESCE(NULLIF(pago->>'monto', '')::NUMERIC, 0)), 0)
          FROM jsonb_array_elements(pagos_detalle) pago
          WHERE LOWER(COALESCE(pago->>'metodo', '')) = 'efectivo'
        )
      WHEN LOWER(COALESCE(metodo_pago, '')) = 'efectivo' THEN
        COALESCE(total_facturado, 0) + COALESCE(propina, 0)
      ELSE 0
    END
  ), 0)
  INTO v_ventas_efectivo
  FROM turns
  WHERE caja_shift_id = v_shift_id
    AND status = 'cerrada';

  SELECT COALESCE(SUM(COALESCE(NULLIF(retiro->>'monto', '')::NUMERIC, 0)), 0)
  INTO v_retiros_total
  FROM jsonb_array_elements(COALESCE(NULLIF(v_shift.retiros, ''), '[]')::JSONB) retiro;

  v_efectivo_esperado := COALESCE(v_shift.fondo_inicial, 0) + v_ventas_efectivo - v_retiros_total;
  v_diferencia := v_arqueo - v_efectivo_esperado;

  IF v_nombre_turno = '' THEN
    v_nombre_turno := 'Caja ' || COALESCE(v_shift.tipo_turno, 'general') || ' - ' || TO_CHAR(NOW(), 'DD/MM/YY');
  END IF;

  UPDATE caja_shifts
  SET cerrado_at = NOW(),
      status = 'cerrado',
      arqueo_efectivo = v_arqueo,
      diferencia_caja = v_diferencia,
      motivo_diferencia = v_motivo,
      total_facturado_turno = v_total_real,
      nombre_turno = v_nombre_turno,
      closed_by = v_actor_user_id,
      close_operation_id = v_operation_id,
      close_payload = p_operation
  WHERE id = v_shift_id;

  v_result := jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'operation_id', v_operation_id,
    'caja_shift_id', v_shift_id,
    'branch_id', v_branch_id,
    'total_facturado_turno', v_total_real,
    'ventas_efectivo', v_ventas_efectivo,
    'retiros_total', v_retiros_total,
    'efectivo_esperado', v_efectivo_esperado,
    'arqueo_efectivo', v_arqueo,
    'diferencia_caja', v_diferencia
  );

  INSERT INTO audit_logs (restaurant_id, branch_id, usuario, rol, categoria, accion, detalle, sucursal)
  VALUES (
    v_restaurant_id,
    v_branch_id,
    v_actor_email,
    COALESCE(v_role, ''),
    'Caja',
    'Turno cerrado',
    'Total ' || v_total_real::TEXT || ' - Arqueo ' || v_arqueo::TEXT || ' - Diferencia ' || v_diferencia::TEXT,
    COALESCE(v_branch_name, '')
  );

  UPDATE business_operations
  SET status = 'applied',
      result = v_result,
      applied_at = NOW(),
      last_error = NULL
  WHERE operation_id = v_operation_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION close_caja_shift_operation(JSONB) TO authenticated;

-- Verification:
-- SELECT proname FROM pg_proc WHERE proname = 'close_caja_shift_operation';
