-- ============================================================
-- Sales operations: auditable void/archive/reset commands
--
-- Purpose:
--   Sales corrections must not be direct browser updates/deletes. This RPC is
--   the single server-side command for voiding a sale, hiding an already-voided
--   sale from analytics, or resetting analytics for a branch.
--
-- Guarantees:
--   - Tenant authorization via get_user_restaurant_id().
--   - Role checks via get_user_role().
--   - Idempotency via business_operations.operation_id.
--   - Audit log on every applied operation.
--   - No physical deletion of fiscal/business records.
-- ============================================================

ALTER TABLE turns
  ADD COLUMN IF NOT EXISTS anulada_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS archive_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS archive_operation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_turns_branch_visible_sales
  ON turns(branch_id, closed_at DESC)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION apply_sales_operation(p_operation JSONB)
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
  v_reason             TEXT;
  v_actor_email        TEXT;
  v_actor_user_id      UUID;
  v_authorized_rest    UUID;
  v_role               TEXT;
  v_branch_name        TEXT;
  v_existing           business_operations%ROWTYPE;
  v_turn               turns%ROWTYPE;
  v_caja_shift_id      UUID;
  v_affected_count     INTEGER := 0;
  v_total_adjusted     NUMERIC := 0;
  v_result             JSONB;
BEGIN
  IF p_operation IS NULL THEN
    RAISE EXCEPTION 'operation required' USING ERRCODE = '22023';
  END IF;

  v_operation_id := p_operation->>'operation_id';
  v_operation_type := p_operation->>'operation_type';
  v_operation_version := COALESCE((p_operation->>'operation_version')::INTEGER, 1);
  v_branch_id := NULLIF(p_operation #>> '{tenant,branch_id}', '')::UUID;
  v_restaurant_id := NULLIF(p_operation #>> '{tenant,restaurant_id}', '')::UUID;
  v_turn_id := NULLIF(p_operation #>> '{sale,turn_id}', '')::UUID;
  v_reason := LEFT(TRIM(COALESCE(p_operation #>> '{sale,reason}', p_operation #>> '{reason}', '')), 500);
  v_actor_email := COALESCE(NULLIF(auth.jwt()->>'email', ''), NULLIF(p_operation #>> '{actor,email}', ''), 'Sistema');
  v_actor_user_id := auth.uid();

  IF v_operation_id IS NULL OR v_operation_id = '' THEN
    RAISE EXCEPTION 'operation_id required' USING ERRCODE = '22023';
  END IF;

  IF v_operation_type NOT IN ('VOID_SALE', 'ARCHIVE_SALE', 'RESET_ANALYTICS') THEN
    RAISE EXCEPTION 'unsupported operation_type %', v_operation_type USING ERRCODE = '22023';
  END IF;

  IF LENGTH(v_reason) < 4 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  IF v_operation_type IN ('VOID_SALE', 'ARCHIVE_SALE') AND v_turn_id IS NULL THEN
    RAISE EXCEPTION 'turn_id required' USING ERRCODE = '22023';
  END IF;

  IF v_operation_type = 'RESET_ANALYTICS' AND v_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id required' USING ERRCODE = '22023';
  END IF;

  IF v_branch_id IS NULL AND v_turn_id IS NOT NULL THEN
    SELECT t.branch_id INTO v_branch_id
    FROM turns t
    WHERE t.id = v_turn_id;
  END IF;

  SELECT b.restaurant_id, b.nombre
  INTO v_restaurant_id, v_branch_name
  FROM branches b
  WHERE b.id = v_branch_id
    AND (v_restaurant_id IS NULL OR b.restaurant_id = v_restaurant_id);

  v_authorized_rest := get_user_restaurant_id();
  v_role := get_user_role();

  IF v_authorized_rest IS NULL OR v_restaurant_id IS NULL OR v_authorized_rest <> v_restaurant_id THEN
    RAISE EXCEPTION 'sin permiso para operar ventas' USING ERRCODE = '42501';
  END IF;

  IF v_operation_type = 'RESET_ANALYTICS' AND v_role <> 'Dueno' THEN
    RAISE EXCEPTION 'solo el dueno puede reiniciar analiticas' USING ERRCODE = '42501';
  END IF;

  IF v_operation_type IN ('VOID_SALE', 'ARCHIVE_SALE') AND v_role NOT IN ('Dueno', 'Encargado') THEN
    RAISE EXCEPTION 'sin permiso para corregir ventas' USING ERRCODE = '42501';
  END IF;

  IF v_operation_type IN ('VOID_SALE', 'ARCHIVE_SALE') THEN
    SELECT t.* INTO v_turn
    FROM turns t
    WHERE t.id = v_turn_id
      AND t.branch_id = v_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'venta no encontrada' USING ERRCODE = 'P0002';
    END IF;

    v_caja_shift_id := v_turn.caja_shift_id;
  END IF;

  INSERT INTO business_operations (
    operation_id,
    operation_type,
    operation_version,
    restaurant_id,
    branch_id,
    turn_id,
    caja_shift_id,
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
        'operation_id', v_operation_id
      ));
    END IF;
  END IF;

  IF v_operation_type = 'VOID_SALE' THEN
    IF v_turn.archived_at IS NOT NULL THEN
      v_result := jsonb_build_object(
        'ok', true,
        'already_archived', true,
        'operation_id', v_operation_id,
        'turn_id', v_turn.id
      );
    ELSIF v_turn.status = 'anulada' THEN
      v_result := jsonb_build_object(
        'ok', true,
        'already_voided', true,
        'operation_id', v_operation_id,
        'turn_id', v_turn.id
      );
    ELSE
      IF v_turn.status <> 'cerrada' THEN
        RAISE EXCEPTION 'solo se pueden anular ventas cerradas' USING ERRCODE = '22023';
      END IF;

      UPDATE turns
      SET status = 'anulada',
          motivo_anulacion = v_reason,
          anulado_at = COALESCE(anulado_at, NOW()),
          anulada_by = v_actor_user_id
      WHERE id = v_turn.id;

      IF v_turn.caja_shift_id IS NOT NULL THEN
        UPDATE caja_shifts
        SET total_facturado_turno = COALESCE(total_facturado_turno, 0) - COALESCE(v_turn.total_facturado, 0)
        WHERE id = v_turn.caja_shift_id;
      END IF;

      v_affected_count := 1;
      v_total_adjusted := COALESCE(v_turn.total_facturado, 0);
      v_result := jsonb_build_object(
        'ok', true,
        'already_applied', false,
        'operation_id', v_operation_id,
        'turn_id', v_turn.id,
        'status', 'anulada',
        'affected_count', v_affected_count,
        'total_adjusted', v_total_adjusted
      );
    END IF;

    INSERT INTO audit_logs (restaurant_id, branch_id, usuario, rol, categoria, accion, detalle, sucursal)
    VALUES (
      v_restaurant_id,
      v_branch_id,
      v_actor_email,
      COALESCE(v_role, ''),
      'Analiticas',
      'Venta anulada',
      'Mesa ' || COALESCE(v_turn.mesa_num::TEXT, '-') || ' - $' || COALESCE(v_turn.total_facturado, 0)::TEXT || ' - Motivo: ' || v_reason,
      COALESCE(v_branch_name, '')
    );

  ELSIF v_operation_type = 'ARCHIVE_SALE' THEN
    IF v_turn.status <> 'anulada' THEN
      RAISE EXCEPTION 'solo se pueden archivar ventas anuladas' USING ERRCODE = '22023';
    END IF;

    IF v_turn.archived_at IS NULL THEN
      UPDATE turns
      SET archived_at = NOW(),
          archived_by = v_actor_user_id,
          archive_reason = v_reason,
          archive_operation_id = v_operation_id
      WHERE id = v_turn.id;
      v_affected_count := 1;
    END IF;

    v_result := jsonb_build_object(
      'ok', true,
      'already_applied', false,
      'operation_id', v_operation_id,
      'turn_id', v_turn.id,
      'archived', true,
      'affected_count', v_affected_count
    );

    INSERT INTO audit_logs (restaurant_id, branch_id, usuario, rol, categoria, accion, detalle, sucursal)
    VALUES (
      v_restaurant_id,
      v_branch_id,
      v_actor_email,
      COALESCE(v_role, ''),
      'Analiticas',
      'Venta archivada',
      'Mesa ' || COALESCE(v_turn.mesa_num::TEXT, '-') || ' - Motivo: ' || v_reason,
      COALESCE(v_branch_name, '')
    );

  ELSE
    SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'cerrada' THEN total_facturado ELSE 0 END), 0)
    INTO v_affected_count, v_total_adjusted
    FROM turns
    WHERE branch_id = v_branch_id
      AND status IN ('cerrada', 'anulada')
      AND archived_at IS NULL;

    UPDATE caja_shifts cs
    SET total_facturado_turno = COALESCE(cs.total_facturado_turno, 0) - totals.total
    FROM (
      SELECT caja_shift_id, SUM(total_facturado) AS total
      FROM turns
      WHERE branch_id = v_branch_id
        AND status = 'cerrada'
        AND archived_at IS NULL
        AND caja_shift_id IS NOT NULL
      GROUP BY caja_shift_id
    ) totals
    WHERE cs.id = totals.caja_shift_id;

    UPDATE turns
    SET status = 'anulada',
        motivo_anulacion = COALESCE(NULLIF(motivo_anulacion, ''), 'Reset analytics: ' || v_reason),
        anulado_at = COALESCE(anulado_at, NOW()),
        anulada_by = COALESCE(anulada_by, v_actor_user_id),
        archived_at = NOW(),
        archived_by = v_actor_user_id,
        archive_reason = v_reason,
        archive_operation_id = v_operation_id
    WHERE branch_id = v_branch_id
      AND status IN ('cerrada', 'anulada')
      AND archived_at IS NULL;

    v_result := jsonb_build_object(
      'ok', true,
      'already_applied', false,
      'operation_id', v_operation_id,
      'branch_id', v_branch_id,
      'archived', true,
      'affected_count', v_affected_count,
      'total_adjusted', v_total_adjusted
    );

    INSERT INTO audit_logs (restaurant_id, branch_id, usuario, rol, categoria, accion, detalle, sucursal)
    VALUES (
      v_restaurant_id,
      v_branch_id,
      v_actor_email,
      COALESCE(v_role, ''),
      'Analiticas',
      'Analiticas reiniciadas',
      'Ventas archivadas: ' || v_affected_count::TEXT || ' - Total ajustado: $' || v_total_adjusted::TEXT || ' - Motivo: ' || v_reason,
      COALESCE(v_branch_name, '')
    );
  END IF;

  UPDATE business_operations
  SET status = 'applied',
      result = v_result,
      applied_at = NOW(),
      last_error = NULL
  WHERE operation_id = v_operation_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_sales_operation(JSONB) TO authenticated;

-- Verification:
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'apply_sales_operation';
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'turns' AND column_name IN ('archived_at','anulada_by','archive_operation_id');
