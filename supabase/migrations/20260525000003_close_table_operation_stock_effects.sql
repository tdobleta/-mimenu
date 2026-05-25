-- ============================================================
-- CLOSE_TABLE operation: server-side stock effects
--
-- Purpose:
--   sync_close_table_operation must be the single business command for
--   offline/online table close. The previous version closed the turn and caja
--   but still depended on the browser to decrement stock. That left offline
--   closes without stock movements.
--
-- This migration replaces only sync_close_table_operation(jsonb). It keeps the
-- same public signature and adds stock movements derived from items_snapshot.
-- Stock movement idempotency is line-based:
--   stock_<turn_id>_<line_id>_<stock_item_id>
--
-- Prerequisite:
--   20260525000002_stock_decrement_idempotent.sql
-- ============================================================

CREATE OR REPLACE FUNCTION sync_close_table_operation(p_operation JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_id       TEXT;
  v_operation_type     TEXT;
  v_operation_version  INTEGER;
  v_restaurant_id      UUID;
  v_branch_id          UUID;
  v_turn_id            UUID;
  v_caja_shift_id      UUID;
  v_device_id          TEXT;
  v_actor_user_id      UUID;
  v_authorized_rest    UUID;
  v_total_charged      NUMERIC;
  v_propina            NUMERIC;
  v_total              NUMERIC;
  v_metodo             TEXT;
  v_mozo               TEXT;
  v_pagos_detalle      JSONB;
  v_existing           business_operations%ROWTYPE;
  v_turn               turns%ROWTYPE;
  v_result             JSONB;
  v_item               JSONB;
  v_menu_item_id_text  TEXT;
  v_line_id            TEXT;
  v_qty                NUMERIC;
  v_recipe             RECORD;
  v_stock_result       JSONB;
  v_stock_attempted    INTEGER := 0;
  v_stock_new          INTEGER := 0;
BEGIN
  IF p_operation IS NULL THEN
    RAISE EXCEPTION 'operation required' USING ERRCODE = '22023';
  END IF;

  v_operation_id := p_operation->>'operation_id';
  v_operation_type := p_operation->>'operation_type';
  v_operation_version := COALESCE((p_operation->>'operation_version')::INTEGER, 1);

  IF v_operation_id IS NULL OR v_operation_id = '' THEN
    RAISE EXCEPTION 'operation_id required' USING ERRCODE = '22023';
  END IF;

  IF v_operation_type <> 'CLOSE_TABLE' THEN
    RAISE EXCEPTION 'unsupported operation_type %', v_operation_type USING ERRCODE = '22023';
  END IF;

  v_branch_id := NULLIF(p_operation #>> '{tenant,branch_id}', '')::UUID;
  v_restaurant_id := NULLIF(p_operation #>> '{tenant,restaurant_id}', '')::UUID;
  v_turn_id := NULLIF(p_operation #>> '{table,turn_id}', '')::UUID;
  v_caja_shift_id := NULLIF(p_operation #>> '{caja,caja_shift_id}', '')::UUID;
  v_device_id := p_operation #>> '{device,device_id}';
  v_actor_user_id := NULLIF(p_operation #>> '{actor,user_id}', '')::UUID;

  IF v_restaurant_id IS NULL AND v_branch_id IS NOT NULL THEN
    SELECT restaurant_id INTO v_restaurant_id
    FROM branches
    WHERE id = v_branch_id;
  END IF;

  v_authorized_rest := get_user_restaurant_id();
  IF v_authorized_rest IS NULL OR v_restaurant_id IS NULL OR v_authorized_rest <> v_restaurant_id THEN
    RAISE EXCEPTION 'sin permiso para sincronizar operacion' USING ERRCODE = '42501';
  END IF;

  IF v_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM branches WHERE id = v_branch_id AND restaurant_id = v_restaurant_id
  ) THEN
    RAISE EXCEPTION 'branch invalida para operacion' USING ERRCODE = '42501';
  END IF;

  v_total_charged := COALESCE((p_operation #>> '{pricing,total_charged}')::NUMERIC, 0);
  v_propina := COALESCE((p_operation #>> '{pricing,tip_amount}')::NUMERIC, 0);
  v_total := v_total_charged - v_propina;
  v_metodo := p_operation #>> '{payment,method}';
  v_mozo := COALESCE(
    NULLIF(p_operation #>> '{table,mozo}', ''),
    NULLIF(p_operation #>> '{actor,staff_name}', ''),
    ''
  );

  IF v_turn_id IS NULL OR v_metodo IS NULL OR v_metodo = '' THEN
    RAISE EXCEPTION 'operacion CLOSE_TABLE incompleta' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'metodo', payment->>'method',
    'monto', COALESCE((payment->>'amount')::NUMERIC, 0),
    'provider', COALESCE(payment->>'provider', 'manual'),
    'provider_reference', payment->>'provider_reference'
  ))
  INTO v_pagos_detalle
  FROM jsonb_array_elements(COALESCE(p_operation #> '{payment,payments_detail}', '[]'::JSONB)) AS payment;

  INSERT INTO business_operations (
    operation_id,
    operation_type,
    operation_version,
    restaurant_id,
    branch_id,
    turn_id,
    caja_shift_id,
    device_id,
    actor_user_id,
    payload
  )
  VALUES (
    v_operation_id,
    v_operation_type,
    v_operation_version,
    v_restaurant_id,
    v_branch_id,
    v_turn_id,
    v_caja_shift_id,
    v_device_id,
    v_actor_user_id,
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
      RETURN COALESCE(v_existing.result, jsonb_build_object(
        'ok', true,
        'already_applied', true,
        'operation_id', v_operation_id,
        'turn_id', v_existing.turn_id
      ));
    END IF;
  END IF;

  SELECT * INTO v_turn
  FROM cerrar_mesa_atomico(
    v_turn_id,
    v_total,
    v_propina,
    v_metodo,
    v_mozo,
    v_caja_shift_id,
    v_pagos_detalle
  );

  -- Apply stock movements on the server so offline closes affect stock when
  -- synced. The recipe is intentionally resolved at sync time until a recipe
  -- snapshot is added to the operation contract.
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_operation->'items_snapshot', '[]'::JSONB))
  LOOP
    IF COALESCE((v_item->>'is_free_item')::BOOLEAN, FALSE) THEN
      CONTINUE;
    END IF;

    v_menu_item_id_text := NULLIF(v_item->>'menu_item_id', '');
    v_line_id := COALESCE(NULLIF(v_item->>'line_id', ''), v_menu_item_id_text);
    v_qty := COALESCE(NULLIF(v_item->>'qty', '')::NUMERIC, 0);

    IF v_menu_item_id_text IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    FOR v_recipe IN
      SELECT
        sr.ingrediente_id,
        sr.cantidad,
        si.nombre,
        si.unidad
      FROM stock_recipes sr
      JOIN stock_items si ON si.id = sr.ingrediente_id
      WHERE sr.branch_id = v_branch_id
        AND sr.menu_item_id::TEXT = v_menu_item_id_text
    LOOP
      SELECT decrement_stock_with_egreso(
        v_branch_id,
        v_recipe.ingrediente_id,
        v_recipe.cantidad * v_qty,
        COALESCE(v_recipe.nombre, ''),
        COALESCE(v_recipe.unidad, ''),
        'Mesa (automatico)',
        'automatico',
        'stock_' || v_turn_id::TEXT || '_' || v_line_id || '_' || v_recipe.ingrediente_id::TEXT
      )
      INTO v_stock_result;

      v_stock_attempted := v_stock_attempted + 1;
      IF NOT COALESCE((v_stock_result->>'already_applied')::BOOLEAN, FALSE) THEN
        v_stock_new := v_stock_new + 1;
      END IF;
    END LOOP;
  END LOOP;

  v_result := jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'operation_id', v_operation_id,
    'turn_id', v_turn.id,
    'status', v_turn.status,
    'stock_applied', true,
    'stock_movements_count', v_stock_attempted,
    'stock_new_movements_count', v_stock_new
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

GRANT EXECUTE ON FUNCTION sync_close_table_operation(JSONB) TO authenticated;

-- Verification:
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'sync_close_table_operation';
-- SELECT result->>'stock_applied' FROM business_operations ORDER BY created_at DESC LIMIT 1;
