-- ============================================================
-- Idempotent stock decrement with movement log
--
-- Problem:
--   The browser previously called decrement_stock first and inserted
--   stock_egresos afterwards. If a retry happened, stock could be decremented
--   again even when stock_egresos.client_uid prevented a duplicate movement row.
--
-- Solution:
--   Insert the movement row first with client_uid idempotency, then decrement
--   stock only if the movement was newly inserted. One RPC, one transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION decrement_stock_with_egreso(
  p_branch_id            UUID,
  p_stock_item_id        UUID,
  p_qty                  NUMERIC,
  p_ingrediente_nombre   TEXT DEFAULT '',
  p_unidad               TEXT DEFAULT '',
  p_motivo               TEXT DEFAULT 'Mesa (automatico)',
  p_origen               TEXT DEFAULT 'automatico',
  p_client_uid           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id UUID;
  v_auth_rest     UUID;
  v_egreso        stock_egresos%ROWTYPE;
  v_actual        NUMERIC;
BEGIN
  IF p_branch_id IS NULL OR p_stock_item_id IS NULL OR COALESCE(p_qty, 0) <= 0 THEN
    RAISE EXCEPTION 'stock decrement payload incompleto' USING ERRCODE = '22023';
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM branches
  WHERE id = p_branch_id;

  v_auth_rest := get_user_restaurant_id();
  IF v_auth_rest IS NULL OR v_restaurant_id IS NULL OR v_auth_rest <> v_restaurant_id THEN
    RAISE EXCEPTION 'sin permiso para descontar stock' USING ERRCODE = '42501';
  END IF;

  IF p_client_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM stock_egresos WHERE client_uid = p_client_uid
  ) THEN
    SELECT actual INTO v_actual FROM stock_items WHERE id = p_stock_item_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already_applied', true,
      'stock_item_id', p_stock_item_id,
      'actual', v_actual
    );
  END IF;

  INSERT INTO stock_egresos (
    branch_id,
    ingrediente_id,
    ingrediente_nombre,
    cantidad,
    unidad,
    motivo,
    origen,
    client_uid
  )
  VALUES (
    p_branch_id,
    p_stock_item_id,
    COALESCE(p_ingrediente_nombre, ''),
    p_qty,
    COALESCE(p_unidad, ''),
    COALESCE(p_motivo, ''),
    COALESCE(p_origen, 'automatico'),
    p_client_uid
  )
  ON CONFLICT (client_uid) WHERE client_uid IS NOT NULL DO NOTHING
  RETURNING * INTO v_egreso;

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
  SET actual = GREATEST(0, actual - p_qty)
  WHERE id = p_stock_item_id
    AND branch_id = p_branch_id
  RETURNING actual INTO v_actual;

  RETURN jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'stock_item_id', p_stock_item_id,
    'egreso_id', v_egreso.id,
    'actual', v_actual
  );
END;
$$;

GRANT EXECUTE ON FUNCTION decrement_stock_with_egreso(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Verification:
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'decrement_stock_with_egreso';
