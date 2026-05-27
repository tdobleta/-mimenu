-- ============================================================
-- Caja shift open operation
--
-- Opening a cash shift defines the accounting boundary for the day. This
-- keeps the browser from being the source of authority and makes the operation
-- authorized, idempotent, audited, and protected against duplicate open shifts.
-- ============================================================

ALTER TABLE caja_shifts
  ADD COLUMN IF NOT EXISTS opened_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS open_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS open_payload JSONB DEFAULT '{}'::JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_caja_per_branch
  ON caja_shifts (branch_id)
  WHERE status = 'abierto';

CREATE OR REPLACE FUNCTION open_caja_shift_operation(p_operation JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_id    TEXT;
  v_operation_type  TEXT;
  v_requested_rest   UUID;
  v_restaurant_id   UUID;
  v_branch_id       UUID;
  v_actor_user_id   UUID;
  v_actor_email     TEXT;
  v_authorized_rest UUID;
  v_role            TEXT;
  v_branch_name     TEXT;
  v_existing        business_operations%ROWTYPE;
  v_existing_shift  caja_shifts%ROWTYPE;
  v_shift           caja_shifts%ROWTYPE;
  v_tipo_turno      TEXT;
  v_fondo_inicial   NUMERIC := 0;
  v_abierto_at      TIMESTAMPTZ;
  v_result          JSONB;
BEGIN
  IF p_operation IS NULL THEN
    RAISE EXCEPTION 'operation required' USING ERRCODE = '22023';
  END IF;

  v_operation_id := p_operation->>'operation_id';
  v_operation_type := p_operation->>'operation_type';
  v_requested_rest := NULLIF(p_operation #>> '{tenant,restaurant_id}', '')::UUID;
  v_branch_id := NULLIF(p_operation #>> '{tenant,branch_id}', '')::UUID;
  v_actor_user_id := auth.uid();
  v_actor_email := COALESCE(NULLIF(auth.jwt()->>'email', ''), NULLIF(p_operation #>> '{actor,email}', ''), 'Sistema');
  v_tipo_turno := COALESCE(NULLIF(p_operation #>> '{caja,tipo_turno}', ''), 'general');
  v_fondo_inicial := COALESCE(NULLIF(p_operation #>> '{caja,fondo_inicial}', '')::NUMERIC, 0);
  v_abierto_at := COALESCE(NULLIF(p_operation #>> '{caja,abierto_at}', '')::TIMESTAMPTZ, NOW());

  IF v_operation_id IS NULL OR v_operation_id = '' THEN
    RAISE EXCEPTION 'operation_id required' USING ERRCODE = '22023';
  END IF;

  IF v_operation_type <> 'OPEN_CAJA_SHIFT' THEN
    RAISE EXCEPTION 'unsupported operation_type %', v_operation_type USING ERRCODE = '22023';
  END IF;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id required' USING ERRCODE = '22023';
  END IF;

  IF v_tipo_turno NOT IN ('manana', 'tarde', 'noche', 'general') THEN
    RAISE EXCEPTION 'tipo_turno invalido' USING ERRCODE = '22023';
  END IF;

  IF v_fondo_inicial < 0 THEN
    RAISE EXCEPTION 'fondo_inicial no puede ser negativo' USING ERRCODE = '22023';
  END IF;

  SELECT b.restaurant_id, b.nombre
  INTO v_restaurant_id, v_branch_name
  FROM branches b
  WHERE b.id = v_branch_id
    AND (v_requested_rest IS NULL OR b.restaurant_id = v_requested_rest);

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'sucursal no encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_authorized_rest := get_user_restaurant_id();
  v_role := get_user_role();

  IF v_authorized_rest IS NULL OR v_authorized_rest <> v_restaurant_id THEN
    RAISE EXCEPTION 'sin permiso para abrir caja' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('Dueno', 'Encargado') THEN
    RAISE EXCEPTION 'sin permiso para abrir caja' USING ERRCODE = '42501';
  END IF;

  INSERT INTO business_operations (
    operation_id,
    operation_type,
    operation_version,
    restaurant_id,
    branch_id,
    actor_user_id,
    payload
  )
  VALUES (
    v_operation_id,
    v_operation_type,
    COALESCE((p_operation->>'operation_version')::INTEGER, 1),
    v_restaurant_id,
    v_branch_id,
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

  SELECT *
  INTO v_existing_shift
  FROM caja_shifts
  WHERE branch_id = v_branch_id
    AND status = 'abierto'
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'ya hay un turno abierto en esta sucursal' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO caja_shifts (
    branch_id,
    tipo_turno,
    fondo_inicial,
    abierto_at,
    status,
    retiros,
    total_facturado_turno,
    opened_by,
    open_operation_id,
    open_payload
  )
  VALUES (
    v_branch_id,
    v_tipo_turno,
    v_fondo_inicial,
    v_abierto_at,
    'abierto',
    '[]',
    0,
    v_actor_user_id,
    v_operation_id,
    p_operation
  )
  RETURNING * INTO v_shift;

  v_result := jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'operation_id', v_operation_id,
    'caja_shift_id', v_shift.id,
    'branch_id', v_branch_id,
    'tipo_turno', v_tipo_turno,
    'fondo_inicial', v_fondo_inicial,
    'abierto_at', v_shift.abierto_at
  );

  INSERT INTO audit_logs (restaurant_id, branch_id, usuario, rol, categoria, accion, detalle, sucursal)
  VALUES (
    v_restaurant_id,
    v_branch_id,
    v_actor_email,
    COALESCE(v_role, ''),
    'Caja',
    'Turno abierto',
    'Turno ' || v_tipo_turno || ' - Fondo ' || v_fondo_inicial::TEXT,
    COALESCE(v_branch_name, '')
  );

  UPDATE business_operations
  SET status = 'applied',
      caja_shift_id = v_shift.id,
      result = v_result,
      applied_at = NOW(),
      last_error = NULL
  WHERE operation_id = v_operation_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION open_caja_shift_operation(JSONB) TO authenticated;

-- Verification:
-- SELECT proname FROM pg_proc WHERE proname = 'open_caja_shift_operation';
