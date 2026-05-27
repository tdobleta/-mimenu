-- ============================================================
-- Customer archive operation
--
-- Customer records are part of CRM history and loyalty accounting. Do not
-- physically delete them from the browser. Archive them through an authorized,
-- idempotent, audited server-side operation.
-- ============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS delete_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS delete_operation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_restaurant_active
  ON customers(restaurant_id, lower(nombre))
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION archive_customer_operation(p_operation JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_id    TEXT;
  v_operation_type  TEXT;
  v_requested_rest  UUID;
  v_restaurant_id   UUID;
  v_customer_id     UUID;
  v_reason          TEXT;
  v_actor_user_id   UUID;
  v_actor_email     TEXT;
  v_authorized_rest UUID;
  v_role            TEXT;
  v_existing        business_operations%ROWTYPE;
  v_customer        customers%ROWTYPE;
  v_result          JSONB;
BEGIN
  IF p_operation IS NULL THEN
    RAISE EXCEPTION 'operation required' USING ERRCODE = '22023';
  END IF;

  v_operation_id := p_operation->>'operation_id';
  v_operation_type := p_operation->>'operation_type';
  v_requested_rest := NULLIF(p_operation #>> '{tenant,restaurant_id}', '')::UUID;
  v_customer_id := NULLIF(p_operation #>> '{customer,customer_id}', '')::UUID;
  v_reason := LEFT(TRIM(COALESCE(p_operation #>> '{customer,reason}', p_operation #>> '{reason}', '')), 500);
  v_actor_user_id := auth.uid();
  v_actor_email := COALESCE(NULLIF(auth.jwt()->>'email', ''), NULLIF(p_operation #>> '{actor,email}', ''), 'Sistema');

  IF v_operation_id IS NULL OR v_operation_id = '' THEN
    RAISE EXCEPTION 'operation_id required' USING ERRCODE = '22023';
  END IF;

  IF v_operation_type <> 'ARCHIVE_CUSTOMER' THEN
    RAISE EXCEPTION 'unsupported operation_type %', v_operation_type USING ERRCODE = '22023';
  END IF;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id required' USING ERRCODE = '22023';
  END IF;

  IF LENGTH(v_reason) < 4 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  SELECT c.*
  INTO v_customer
  FROM customers c
  WHERE c.id = v_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente no encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_restaurant_id := v_customer.restaurant_id;

  IF v_requested_rest IS NOT NULL AND v_requested_rest <> v_restaurant_id THEN
    RAISE EXCEPTION 'cliente no pertenece al restaurante' USING ERRCODE = '42501';
  END IF;

  v_authorized_rest := get_user_restaurant_id();
  v_role := get_user_role();

  IF v_authorized_rest IS NULL OR v_authorized_rest <> v_restaurant_id THEN
    RAISE EXCEPTION 'sin permiso para archivar cliente' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('Dueno', 'Encargado') THEN
    RAISE EXCEPTION 'sin permiso para archivar cliente' USING ERRCODE = '42501';
  END IF;

  INSERT INTO business_operations (
    operation_id,
    operation_type,
    operation_version,
    restaurant_id,
    actor_user_id,
    payload
  )
  VALUES (
    v_operation_id,
    v_operation_type,
    COALESCE((p_operation->>'operation_version')::INTEGER, 1),
    v_restaurant_id,
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

  IF v_customer.deleted_at IS NULL THEN
    UPDATE customers
    SET deleted_at = NOW(),
        deleted_by = v_actor_user_id,
        delete_reason = v_reason,
        delete_operation_id = v_operation_id
    WHERE id = v_customer_id;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'operation_id', v_operation_id,
    'customer_id', v_customer_id,
    'archived', true
  );

  INSERT INTO audit_logs (restaurant_id, usuario, rol, categoria, accion, detalle, sucursal)
  VALUES (
    v_restaurant_id,
    v_actor_email,
    COALESCE(v_role, ''),
    'Clientes',
    'Cliente archivado',
    COALESCE(v_customer.nombre, v_customer.email, v_customer.telefono, v_customer.id::TEXT) || ' - Motivo: ' || v_reason,
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

GRANT EXECUTE ON FUNCTION archive_customer_operation(JSONB) TO authenticated;

-- Verification:
-- SELECT proname FROM pg_proc WHERE proname = 'archive_customer_operation';
