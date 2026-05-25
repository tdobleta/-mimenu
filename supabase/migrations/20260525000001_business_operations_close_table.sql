-- ============================================================
-- Business operations: idempotent CLOSE_TABLE sync
--
-- Purpose:
--   Store applied business operations by operation_id so offline retries do not
--   duplicate table closes, caja totals, or later derived effects.
--
-- This migration is additive:
--   - Creates business_operations if missing.
--   - Creates sync_close_table_operation(jsonb).
--   - Does not replace cerrar_mesa_atomico.
-- ============================================================

CREATE TABLE IF NOT EXISTS business_operations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      TEXT NOT NULL UNIQUE,
  operation_type    TEXT NOT NULL,
  operation_version INTEGER NOT NULL DEFAULT 1,
  restaurant_id     UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES branches(id) ON DELETE SET NULL,
  turn_id           UUID REFERENCES turns(id) ON DELETE SET NULL,
  caja_shift_id     UUID REFERENCES caja_shifts(id) ON DELETE SET NULL,
  device_id         TEXT,
  actor_user_id     UUID,
  status            TEXT NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing','applied','failed')),
  payload           JSONB NOT NULL,
  result            JSONB,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_business_operations_restaurant_date
  ON business_operations(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_operations_branch_status
  ON business_operations(branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_operations_turn
  ON business_operations(turn_id)
  WHERE turn_id IS NOT NULL;

ALTER TABLE business_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_operations_own_restaurant" ON business_operations;
CREATE POLICY "business_operations_own_restaurant" ON business_operations
  FOR SELECT TO authenticated
  USING (restaurant_id = get_user_restaurant_id());

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

GRANT EXECUTE ON FUNCTION sync_close_table_operation(JSONB) TO authenticated;
REVOKE ALL ON TABLE business_operations FROM anon, authenticated;
GRANT SELECT ON TABLE business_operations TO authenticated;
GRANT ALL ON TABLE business_operations TO service_role;

-- Verification:
-- SELECT to_regclass('public.business_operations');
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'sync_close_table_operation';
