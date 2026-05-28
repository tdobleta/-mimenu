-- Migration: Server-side points redemption validation in cerrar_mesa_atomico
--
-- Problem: points redemption (puntosARedimir) is entirely client-side. A user
-- can set arbitrary points via devtools. The server receives points as part of
-- p_descuento but has no concept of customer balance or ownership.
--
-- Fix: add p_puntos_canjeados + p_cliente_id params. When points > 0, validate
-- customer exists in the restaurant, has sufficient balance, and deduct atomically
-- inside the same transaction as the turn close. Double-close (turno ya cerrado)
-- fires before any points logic — no double deduction possible.
--
-- New params have DEFAULTs so all existing callers (7, 9 args) remain compatible.

-- ── 1. Replace cerrar_mesa_atomico with points validation ─────────────────

CREATE OR REPLACE FUNCTION cerrar_mesa_atomico(
  p_turn_id          uuid,
  p_total            numeric,
  p_propina          numeric,
  p_metodo           text,
  p_mozo             text,
  p_caja_shift_id    uuid    DEFAULT NULL,
  p_pagos_detalle    jsonb   DEFAULT NULL,
  p_descuento        numeric DEFAULT 0,
  p_descuento_motivo text    DEFAULT NULL,
  p_puntos_canjeados integer DEFAULT 0,
  p_cliente_id       uuid    DEFAULT NULL
)
RETURNS turns AS $$
DECLARE
  v_turn turns%ROWTYPE;
  v_subtotal numeric;
  v_nuevo_total numeric;
  v_puntos_actual integer;
  v_restaurant_id uuid;
BEGIN
  -- Lock the turn row and verify it is still open
  SELECT * INTO v_turn
  FROM turns
  WHERE id = p_turn_id AND status = 'abierta'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno ya cerrado' USING ERRCODE = 'P0001';
  END IF;

  -- Server truth: recalculate subtotal from actual turn_items
  SELECT COALESCE(SUM(cantidad * precio), 0) INTO v_subtotal
  FROM turn_items
  WHERE turn_id = p_turn_id;

  -- ── Discount validation (existing, unchanged) ──────────────────────────
  IF p_descuento < 0 THEN
    RAISE EXCEPTION 'descuento no puede ser negativo' USING ERRCODE = '22023';
  END IF;

  IF p_descuento > v_subtotal THEN
    RAISE EXCEPTION 'descuento (%) excede subtotal (%)', p_descuento, v_subtotal
      USING ERRCODE = '22023';
  END IF;

  IF p_descuento > 0 AND (p_descuento_motivo IS NULL OR length(trim(p_descuento_motivo)) < 4) THEN
    RAISE EXCEPTION 'motivo obligatorio para descuentos (minimo 4 caracteres)'
      USING ERRCODE = '22023';
  END IF;

  -- ── Points redemption validation (new) ─────────────────────────────────

  -- Reject negative points unconditionally
  IF p_puntos_canjeados < 0 THEN
    RAISE EXCEPTION 'puntos canjeados no puede ser negativo'
      USING ERRCODE = '22023';
  END IF;

  IF p_puntos_canjeados > 0 THEN
    -- Require customer identity
    IF p_cliente_id IS NULL THEN
      RAISE EXCEPTION 'cliente_id obligatorio cuando se canjean puntos'
        USING ERRCODE = '22023';
    END IF;

    -- Points portion cannot exceed total discount
    IF p_puntos_canjeados > p_descuento THEN
      RAISE EXCEPTION 'puntos canjeados (%) exceden descuento total (%)',
        p_puntos_canjeados, p_descuento
        USING ERRCODE = '22023';
    END IF;

    -- Get the restaurant from the turn's branch
    SELECT restaurant_id INTO v_restaurant_id
    FROM branches
    WHERE id = v_turn.branch_id;

    -- Lock customer row and validate balance
    SELECT puntos INTO v_puntos_actual
    FROM customers
    WHERE id = p_cliente_id
      AND restaurant_id = v_restaurant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'cliente no encontrado en este restaurante'
        USING ERRCODE = '22023';
    END IF;

    IF p_puntos_canjeados > v_puntos_actual THEN
      RAISE EXCEPTION 'puntos insuficientes: tiene %, intenta canjear %',
        v_puntos_actual, p_puntos_canjeados
        USING ERRCODE = '22023';
    END IF;

    -- Atomic deduction inside the same transaction
    UPDATE customers
    SET puntos = puntos - p_puntos_canjeados
    WHERE id = p_cliente_id;
  END IF;

  -- ── Total consistency check (existing, unchanged) ──────────────────────
  IF abs(p_total - (v_subtotal - p_descuento)) > 1 THEN
    RAISE EXCEPTION 'total (%) no coincide con subtotal (%) - descuento (%)',
      p_total, v_subtotal, p_descuento
      USING ERRCODE = '22023';
  END IF;

  UPDATE turns SET
    status          = 'cerrada',
    closed_at       = now(),
    total_facturado = p_total,
    propina         = p_propina,
    descuento       = p_descuento,
    metodo_pago     = p_metodo,
    mozo            = p_mozo,
    caja_shift_id   = COALESCE(p_caja_shift_id, caja_shift_id),
    pagos_detalle   = COALESCE(p_pagos_detalle, pagos_detalle)
  WHERE id = p_turn_id
  RETURNING * INTO v_turn;

  IF p_caja_shift_id IS NOT NULL THEN
    SELECT COALESCE(SUM(total_facturado + COALESCE(propina, 0)), 0) INTO v_nuevo_total
    FROM turns
    WHERE caja_shift_id = p_caja_shift_id AND status = 'cerrada';

    UPDATE caja_shifts
    SET total_facturado_turno = v_nuevo_total
    WHERE id = p_caja_shift_id;
  END IF;

  RETURN v_turn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 2. Update sync_close_table_operation to extract and pass loyalty ──────

CREATE OR REPLACE FUNCTION sync_close_table_operation(p_operation JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_id      TEXT;
  v_operation_type    TEXT;
  v_operation_version INTEGER;
  v_restaurant_id     UUID;
  v_branch_id         UUID;
  v_turn_id           UUID;
  v_caja_shift_id     UUID;
  v_device_id         TEXT;
  v_actor_user_id     UUID;
  v_authorized_rest   UUID;
  v_total_charged     NUMERIC;
  v_propina           NUMERIC;
  v_total             NUMERIC;
  v_metodo            TEXT;
  v_mozo              TEXT;
  v_pagos_detalle     JSONB;
  v_descuento         NUMERIC;
  v_descuento_motivo  TEXT;
  v_puntos_canjeados  INTEGER;
  v_cliente_id        UUID;
  v_existing          business_operations%ROWTYPE;
  v_turn              turns%ROWTYPE;
  v_result            JSONB;
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

  v_descuento := COALESCE((p_operation #>> '{pricing,discount_amount}')::NUMERIC, 0);
  v_descuento_motivo := NULLIF(p_operation #>> '{pricing,discount_reason}', '');

  -- Extract loyalty / points data
  v_puntos_canjeados := COALESCE((p_operation #>> '{loyalty,puntos_canjeados}')::INTEGER, 0);
  v_cliente_id := NULLIF(p_operation #>> '{loyalty,customer_id}', '')::UUID;

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
    v_pagos_detalle,
    v_descuento,
    v_descuento_motivo,
    v_puntos_canjeados,
    v_cliente_id
  );

  v_result := jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'operation_id', v_operation_id,
    'turn_id', v_turn.id,
    'status', v_turn.status
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

-- Verification:
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'cerrar_mesa_atomico';
-- Expected: 11 args (up from 9)
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'sync_close_table_operation';
