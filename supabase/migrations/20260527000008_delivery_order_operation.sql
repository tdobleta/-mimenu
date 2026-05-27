-- ============================================================
-- Delivery order create operation
--
-- Creates a delivery turn and its items atomically. The visible delivery code
-- lives in delivery_data.pedido_codigo; turns.mesa_num stays numeric and uses
-- a high internal number to coexist with the unique open-table index.
-- ============================================================

CREATE OR REPLACE FUNCTION create_delivery_order_operation(p_operation JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_id    TEXT;
  v_restaurant_id   UUID;
  v_requested_rest   UUID;
  v_branch_id       UUID;
  v_auth_rest       UUID;
  v_role            TEXT;
  v_actor_email     TEXT;
  v_caja_shift_id   UUID;
  v_turn            turns%ROWTYPE;
  v_existing        business_operations%ROWTYPE;
  v_item            JSONB;
  v_pedido_codigo   TEXT;
  v_mesa_num        INTEGER;
  v_delivery_data   JSONB;
  v_result          JSONB;
BEGIN
  IF p_operation IS NULL THEN
    RAISE EXCEPTION 'operation required' USING ERRCODE = '22023';
  END IF;

  v_operation_id := p_operation->>'operation_id';
  v_requested_rest := NULLIF(p_operation #>> '{tenant,restaurant_id}', '')::UUID;
  v_branch_id := NULLIF(p_operation #>> '{tenant,branch_id}', '')::UUID;
  v_pedido_codigo := LEFT(COALESCE(NULLIF(p_operation #>> '{delivery,pedido_codigo}', ''), 'DEL-' || TO_CHAR(NOW(), 'HH24MISS')), 40);
  v_delivery_data := COALESCE(p_operation->'delivery_data', '{}'::JSONB) || jsonb_build_object('pedido_codigo', v_pedido_codigo);
  v_actor_email := COALESCE(NULLIF(auth.jwt()->>'email', ''), NULLIF(p_operation #>> '{actor,email}', ''), 'Sistema');
  v_caja_shift_id := NULLIF(p_operation #>> '{caja,caja_shift_id}', '')::UUID;

  IF v_operation_id IS NULL OR v_operation_id = '' THEN
    RAISE EXCEPTION 'operation_id required' USING ERRCODE = '22023';
  END IF;

  IF p_operation->>'operation_type' <> 'CREATE_DELIVERY_ORDER' THEN
    RAISE EXCEPTION 'unsupported operation_type %', p_operation->>'operation_type' USING ERRCODE = '22023';
  END IF;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id required' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(COALESCE(p_operation->'items', '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION 'items required' USING ERRCODE = '22023';
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM branches
  WHERE id = v_branch_id
    AND (v_requested_rest IS NULL OR restaurant_id = v_requested_rest);

  v_auth_rest := get_user_restaurant_id();
  v_role := get_user_role();

  IF v_auth_rest IS NULL OR v_restaurant_id IS NULL OR v_auth_rest <> v_restaurant_id THEN
    RAISE EXCEPTION 'sin permiso para crear delivery' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('Dueno', 'Encargado', 'Mozo') THEN
    RAISE EXCEPTION 'sin permiso para crear delivery' USING ERRCODE = '42501';
  END IF;

  IF v_caja_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM caja_shifts
    WHERE id = v_caja_shift_id
      AND branch_id = v_branch_id
      AND status = 'abierto'
  ) THEN
    RAISE EXCEPTION 'turno de caja invalido' USING ERRCODE = '42501';
  END IF;

  v_mesa_num := 900000 + FLOOR(random() * 99999)::INTEGER;
  WHILE EXISTS (
    SELECT 1
    FROM turns
    WHERE branch_id = v_branch_id
      AND mesa_num = v_mesa_num
      AND status = 'abierta'
  )
  LOOP
    v_mesa_num := 900000 + FLOOR(random() * 99999)::INTEGER;
  END LOOP;

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
    'CREATE_DELIVERY_ORDER',
    COALESCE((p_operation->>'operation_version')::INTEGER, 1),
    v_restaurant_id,
    v_branch_id,
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

  INSERT INTO turns (
    branch_id,
    mesa_num,
    status,
    tipo,
    delivery_estado,
    delivery_data,
    opened_at,
    total_facturado,
    mozo,
    caja_shift_id
  )
  VALUES (
    v_branch_id,
    v_mesa_num,
    'abierta',
    'delivery',
    'preparando',
    v_delivery_data,
    NOW(),
    0,
    COALESCE(p_operation #>> '{actor,staff_name}', ''),
    v_caja_shift_id
  )
  RETURNING * INTO v_turn;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_operation->'items', '[]'::JSONB))
  LOOP
    INSERT INTO turn_items (
      turn_id,
      branch_id,
      menu_item_id,
      menu_item_name,
      cantidad,
      precio,
      notas
    )
    VALUES (
      v_turn.id,
      v_branch_id,
      NULLIF(v_item->>'menu_item_id', '')::UUID,
      COALESCE(v_item->>'menu_item_name', ''),
      COALESCE(NULLIF(v_item->>'cantidad', '')::NUMERIC, 1),
      COALESCE(NULLIF(v_item->>'precio', '')::NUMERIC, 0),
      COALESCE(v_item->>'notas', '')
    );
  END LOOP;

  v_result := jsonb_build_object(
    'ok', true,
    'operation_id', v_operation_id,
    'turn_id', v_turn.id,
    'pedido_codigo', v_pedido_codigo
  );

  INSERT INTO audit_logs (restaurant_id, branch_id, usuario, rol, categoria, accion, detalle, sucursal)
  VALUES (
    v_restaurant_id,
    v_branch_id,
    v_actor_email,
    COALESCE(v_role, ''),
    'Delivery',
    'Pedido creado',
    v_pedido_codigo,
    ''
  );

  UPDATE business_operations
  SET status = 'applied',
      turn_id = v_turn.id,
      result = v_result,
      applied_at = NOW(),
      last_error = NULL
  WHERE operation_id = v_operation_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_delivery_order_operation(JSONB) TO authenticated;

-- Verification:
-- SELECT proname FROM pg_proc WHERE proname = 'create_delivery_order_operation';
