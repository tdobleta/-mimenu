-- ============================================================
-- Idempotent stock ingreso with movement log
--
-- Purchases and inventory positive adjustments must update stock and movement
-- history atomically. This mirrors decrement_stock_with_egreso for incoming
-- stock and makes retries safe through an optional client_uid.
-- ============================================================

ALTER TABLE stock_ingresos
  ADD COLUMN IF NOT EXISTS client_uid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_ingresos_client_uid
  ON stock_ingresos(client_uid)
  WHERE client_uid IS NOT NULL;

CREATE OR REPLACE FUNCTION increment_stock_with_ingreso(
  p_branch_id       UUID,
  p_stock_item_id   UUID,
  p_qty             NUMERIC,
  p_costo_unit      NUMERIC DEFAULT NULL,
  p_proveedor       TEXT DEFAULT NULL,
  p_notas           TEXT DEFAULT NULL,
  p_usuario         TEXT DEFAULT NULL,
  p_client_uid      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id UUID;
  v_auth_rest     UUID;
  v_ingreso       stock_ingresos%ROWTYPE;
  v_actual        NUMERIC;
BEGIN
  IF p_branch_id IS NULL OR p_stock_item_id IS NULL OR COALESCE(p_qty, 0) <= 0 THEN
    RAISE EXCEPTION 'stock ingreso payload incompleto' USING ERRCODE = '22023';
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM branches
  WHERE id = p_branch_id;

  v_auth_rest := get_user_restaurant_id();
  IF v_auth_rest IS NULL OR v_restaurant_id IS NULL OR v_auth_rest <> v_restaurant_id THEN
    RAISE EXCEPTION 'sin permiso para ingresar stock' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM stock_items
    WHERE id = p_stock_item_id
      AND branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'ingrediente no encontrado en la sucursal' USING ERRCODE = 'P0002';
  END IF;

  IF p_client_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM stock_ingresos WHERE client_uid = p_client_uid
  ) THEN
    SELECT actual INTO v_actual FROM stock_items WHERE id = p_stock_item_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already_applied', true,
      'stock_item_id', p_stock_item_id,
      'actual', v_actual
    );
  END IF;

  INSERT INTO stock_ingresos (
    branch_id,
    stock_item_id,
    cantidad,
    costo_unit,
    proveedor,
    notas,
    usuario,
    client_uid
  )
  VALUES (
    p_branch_id,
    p_stock_item_id,
    p_qty,
    p_costo_unit,
    p_proveedor,
    p_notas,
    p_usuario,
    p_client_uid
  )
  ON CONFLICT (client_uid) WHERE client_uid IS NOT NULL DO NOTHING
  RETURNING * INTO v_ingreso;

  IF NOT FOUND THEN
    SELECT actual INTO v_actual FROM stock_items WHERE id = p_stock_item_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already_applied', true,
      'stock_item_id', p_stock_item_id,
      'actual', v_actual
    );
  END IF;

  UPDATE stock_items
  SET actual = actual + p_qty
  WHERE id = p_stock_item_id
    AND branch_id = p_branch_id
  RETURNING actual INTO v_actual;

  RETURN jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'stock_item_id', p_stock_item_id,
    'ingreso_id', v_ingreso.id,
    'actual', v_actual
  );
END;
$$;

GRANT EXECUTE ON FUNCTION increment_stock_with_ingreso(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Verification:
-- SELECT proname FROM pg_proc WHERE proname = 'increment_stock_with_ingreso';
