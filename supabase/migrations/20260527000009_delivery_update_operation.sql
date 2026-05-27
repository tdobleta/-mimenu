-- ============================================================
-- Delivery order update operation
--
-- Updates delivery workflow metadata through an authorized audited RPC:
-- delivery status changes and rider assignment. Payment/cash closing remains
-- handled by cerrar_mesa_atomico via cerrarMesaOnline.
-- ============================================================

CREATE OR REPLACE FUNCTION update_delivery_order_operation(p_operation JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_id    TEXT;
  v_restaurant_id   UUID;
  v_requested_rest  UUID;
  v_branch_id       UUID;
  v_turn_id         UUID;
  v_auth_rest       UUID;
  v_role            TEXT;
  v_actor_email     TEXT;
  v_estado          TEXT;
  v_repartidor      TEXT;
  v_has_repartidor  BOOLEAN;
  v_turn            turns%ROWTYPE;
  v_existing        business_operations%ROWTYPE;
  v_result          JSONB;
BEGIN
  IF p_operation IS NULL THEN
    RAISE EXCEPTION 'operation required' USING ERRCODE = '22023';
  END IF;

  v_operation_id := p_operation->>'operation_id';
  v_requested_rest := NULLIF(p_operation #>> '{tenant,restaurant_id}', '')::UUID;
  v_branch_id := NULLIF(p_operation #>> '{tenant,branch_id}', '')::UUID;
  v_turn_id := NULLIF(p_operation #>> '{delivery,turn_id}', '')::UUID;
  v_estado := NULLIF(p_operation #>> '{delivery,estado}', '');
  v_repartidor := COALESCE(p_operation #>> '{assignment,repartidor}', '');
  v_has_repartidor := (p_operation ? 'assignment') AND ((p_operation->'assignment') ? 'repartidor');
  v_actor_email := COALESCE(NULLIF(auth.jwt()->>'email', ''), NULLIF(p_operation #>> '{actor,email}', ''), 'Sistema');

  IF v_operation_id IS NULL OR v_operation_id = '' THEN
    RAISE EXCEPTION 'operation_id required' USING ERRCODE = '22023';
  END IF;

  IF p_operation->>'operation_type' <> 'UPDATE_DELIVERY_ORDER' THEN
    RAISE EXCEPTION 'unsupported operation_type %', p_operation->>'operation_type' USING ERRCODE = '22023';
  END IF;

  IF v_branch_id IS NULL OR v_turn_id IS NULL THEN
    RAISE EXCEPTION 'branch_id and turn_id required' USING ERRCODE = '22023';
  END IF;

  IF v_estado IS NULL AND NOT v_has_repartidor THEN
    RAISE EXCEPTION 'no update requested' USING ERRCODE = '22023';
  END IF;

  IF v_estado IS NOT NULL AND v_estado NOT IN ('preparando', 'listo', 'en_camino', 'entregado') THEN
    RAISE EXCEPTION 'estado de delivery invalido' USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_turn
  FROM turns t
  JOIN branches b ON b.id = t.branch_id
  WHERE t.id = v_turn_id
    AND t.branch_id = v_branch_id
    AND t.tipo = 'delivery'
    AND (v_requested_rest IS NULL OR b.restaurant_id = v_requested_rest);

  SELECT restaurant_id INTO v_restaurant_id
  FROM branches
  WHERE id = v_branch_id
    AND (v_requested_rest IS NULL OR restaurant_id = v_requested_rest);

  v_auth_rest := get_user_restaurant_id();
  v_role := get_user_role();

  IF v_auth_rest IS NULL OR v_restaurant_id IS NULL OR v_auth_rest <> v_restaurant_id OR v_turn.id IS NULL THEN
    RAISE EXCEPTION 'sin permiso para actualizar delivery' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('Dueno', 'Encargado', 'Mozo') THEN
    RAISE EXCEPTION 'sin permiso para actualizar delivery' USING ERRCODE = '42501';
  END IF;

  IF v_estado = 'entregado' AND v_turn.status <> 'cerrada' THEN
    RAISE EXCEPTION 'delivery debe estar cerrado antes de marcar entregado' USING ERRCODE = '22023';
  END IF;

  INSERT INTO business_operations (
    operation_id,
    operation_type,
    operation_version,
    restaurant_id,
    branch_id,
    turn_id,
    actor_user_id,
    payload
  )
  VALUES (
    v_operation_id,
    'UPDATE_DELIVERY_ORDER',
    COALESCE((p_operation->>'operation_version')::INTEGER, 1),
    v_restaurant_id,
    v_branch_id,
    v_turn_id,
    auth.uid(),
    p_operation
  )
  ON CONFLICT (operation_id) DO NOTHING
  RETURNING * INTO v_existing;

  IF NOT FOUND THEN
    SELECT * INTO v_existing
    FROM business_operations
    WHERE operation_id = v_operation_id
    FOR UPDATE;

    IF v_existing.status = 'applied' THEN
      RETURN COALESCE(v_existing.result, jsonb_build_object('ok', true, 'already_applied', true));
    END IF;
  END IF;

  UPDATE turns
  SET delivery_estado = COALESCE(v_estado, delivery_estado),
      delivery_data = CASE
        WHEN v_has_repartidor THEN jsonb_set(COALESCE(delivery_data, '{}'::JSONB), '{repartidor}', to_jsonb(v_repartidor), true)
        ELSE delivery_data
      END
  WHERE id = v_turn_id
  RETURNING * INTO v_turn;

  v_result := jsonb_build_object(
    'ok', true,
    'operation_id', v_operation_id,
    'turn_id', v_turn.id,
    'delivery_estado', v_turn.delivery_estado,
    'delivery_data', COALESCE(v_turn.delivery_data, '{}'::JSONB)
  );

  INSERT INTO audit_logs (restaurant_id, branch_id, usuario, rol, categoria, accion, detalle, sucursal)
  VALUES (
    v_restaurant_id,
    v_branch_id,
    v_actor_email,
    COALESCE(v_role, ''),
    'Delivery',
    CASE
      WHEN v_estado IS NOT NULL THEN 'Estado actualizado'
      ELSE 'Repartidor actualizado'
    END,
    COALESCE(v_estado, v_repartidor, ''),
    ''
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

GRANT EXECUTE ON FUNCTION update_delivery_order_operation(JSONB) TO authenticated;

-- Verification:
-- SELECT proname FROM pg_proc WHERE proname = 'update_delivery_order_operation';
