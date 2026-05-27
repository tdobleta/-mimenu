-- ============================================================
-- Fiscal contingency RPC
--
-- Fiscal contingency records contain sale details and customer tax data. They
-- must be created through a server-side authorization boundary, not by a broad
-- browser insert.
-- ============================================================

CREATE OR REPLACE FUNCTION create_factura_contingencia(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id UUID;
  v_branch_id     UUID;
  v_turn_id       UUID;
  v_auth_rest     UUID;
  v_row           facturas_contingencia%ROWTYPE;
  v_branch_ok     BOOLEAN := FALSE;
BEGIN
  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'payload required' USING ERRCODE = '22023';
  END IF;

  v_restaurant_id := NULLIF(p_payload->>'restaurant_id', '')::UUID;
  v_branch_id := NULLIF(p_payload->>'branch_id', '')::UUID;
  v_turn_id := NULLIF(p_payload->>'turn_id', '')::UUID;

  IF v_restaurant_id IS NULL OR v_branch_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id and branch_id required' USING ERRCODE = '22023';
  END IF;

  v_auth_rest := get_user_restaurant_id();
  IF v_auth_rest IS NULL OR v_auth_rest <> v_restaurant_id THEN
    RAISE EXCEPTION 'sin permiso para crear contingencia fiscal' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM branches
    WHERE id = v_branch_id
      AND restaurant_id = v_restaurant_id
  ) INTO v_branch_ok;

  IF NOT v_branch_ok THEN
    RAISE EXCEPTION 'sucursal invalida para este restaurante' USING ERRCODE = '42501';
  END IF;

  IF v_turn_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM turns
    WHERE id = v_turn_id
      AND branch_id = v_branch_id
  ) THEN
    RAISE EXCEPTION 'venta invalida para esta sucursal' USING ERRCODE = '42501';
  END IF;

  INSERT INTO facturas_contingencia (
    restaurant_id,
    branch_id,
    turn_id,
    mesa,
    items,
    total,
    descuento,
    tipo,
    cliente_data,
    error_mensaje,
    estado
  )
  VALUES (
    v_restaurant_id,
    v_branch_id,
    v_turn_id,
    COALESCE(p_payload->>'mesa', ''),
    COALESCE(p_payload->'items', '[]'::JSONB),
    COALESCE(NULLIF(p_payload->>'total', '')::NUMERIC, 0),
    COALESCE(NULLIF(p_payload->>'descuento', '')::NUMERIC, 0),
    COALESCE(NULLIF(p_payload->>'tipo', ''), 'B'),
    p_payload->'cliente_data',
    LEFT(COALESCE(p_payload->>'error_mensaje', ''), 1000),
    'pendiente'
  )
  RETURNING * INTO v_row;

  INSERT INTO audit_logs (restaurant_id, branch_id, usuario, rol, categoria, accion, detalle, sucursal)
  VALUES (
    v_restaurant_id,
    v_branch_id,
    COALESCE(auth.jwt()->>'email', 'Sistema'),
    COALESCE(get_user_role(), ''),
    'Facturacion',
    'Contingencia fiscal creada',
    'Mesa ' || COALESCE(v_row.mesa, '-') || ' - Total ' || COALESCE(v_row.total, 0)::TEXT,
    ''
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'estado', v_row.estado
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_factura_contingencia(JSONB) TO authenticated;

-- Verification:
-- SELECT proname FROM pg_proc WHERE proname = 'create_factura_contingencia';
