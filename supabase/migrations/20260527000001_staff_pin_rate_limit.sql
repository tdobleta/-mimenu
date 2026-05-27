-- ============================================================
-- Staff PIN anti-bruteforce
--
-- PINs are short by design for shared restaurant tablets. This table and the
-- RPC helpers make PIN verification rate-limited without exposing PIN hashes
-- or relying on browser-side throttling.
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_pin_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  staff_pin_id    UUID NOT NULL REFERENCES staff_pins(id) ON DELETE CASCADE,
  actor_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_hash         TEXT NOT NULL DEFAULT '',
  failed_count    INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until    TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, staff_pin_id, actor_user_id, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_staff_pin_attempts_lockout
  ON staff_pin_attempts(branch_id, staff_pin_id, locked_until)
  WHERE locked_until IS NOT NULL;

ALTER TABLE staff_pin_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staff_pin_attempts FROM authenticated;
GRANT ALL ON TABLE public.staff_pin_attempts TO service_role;

CREATE OR REPLACE FUNCTION check_staff_pin_lockout(
  p_branch_id UUID,
  p_staff_pin_id UUID,
  p_actor_user_id UUID,
  p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt staff_pin_attempts%ROWTYPE;
  v_seconds INTEGER := 0;
BEGIN
  SELECT *
  INTO v_attempt
  FROM staff_pin_attempts
  WHERE branch_id = p_branch_id
    AND staff_pin_id = p_staff_pin_id
    AND actor_user_id = p_actor_user_id
    AND ip_hash = COALESCE(p_ip_hash, '')
  LIMIT 1;

  IF FOUND AND v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > NOW() THEN
    v_seconds := CEIL(EXTRACT(EPOCH FROM (v_attempt.locked_until - NOW())))::INTEGER;
    RETURN jsonb_build_object(
      'locked', true,
      'locked_until', v_attempt.locked_until,
      'retry_after_seconds', GREATEST(v_seconds, 1),
      'failed_count', v_attempt.failed_count
    );
  END IF;

  RETURN jsonb_build_object('locked', false);
END;
$$;

CREATE OR REPLACE FUNCTION record_staff_pin_failure(
  p_branch_id UUID,
  p_staff_pin_id UUID,
  p_actor_user_id UUID,
  p_ip_hash TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_lock_seconds INTEGER DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row staff_pin_attempts%ROWTYPE;
  v_next_count INTEGER;
  v_locked_until TIMESTAMPTZ;
  v_retry_after INTEGER := 0;
BEGIN
  IF p_max_attempts < 2 THEN
    p_max_attempts := 5;
  END IF;
  IF p_lock_seconds < 30 THEN
    p_lock_seconds := 300;
  END IF;

  INSERT INTO staff_pin_attempts (
    branch_id,
    staff_pin_id,
    actor_user_id,
    ip_hash,
    failed_count,
    locked_until,
    last_attempt_at
  )
  VALUES (
    p_branch_id,
    p_staff_pin_id,
    p_actor_user_id,
    COALESCE(p_ip_hash, ''),
    1,
    NULL,
    NOW()
  )
  ON CONFLICT (branch_id, staff_pin_id, actor_user_id, ip_hash)
  DO UPDATE SET
    failed_count = CASE
      WHEN staff_pin_attempts.locked_until IS NOT NULL
       AND staff_pin_attempts.locked_until <= NOW() THEN 1
      ELSE staff_pin_attempts.failed_count + 1
    END,
    locked_until = NULL,
    last_attempt_at = NOW(),
    updated_at = NOW()
  RETURNING * INTO v_row;

  v_next_count := v_row.failed_count;

  IF v_next_count >= p_max_attempts THEN
    v_locked_until := NOW() + make_interval(secs => p_lock_seconds);
    UPDATE staff_pin_attempts
    SET locked_until = v_locked_until,
        updated_at = NOW()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
    v_retry_after := p_lock_seconds;
  END IF;

  RETURN jsonb_build_object(
    'locked', v_row.locked_until IS NOT NULL AND v_row.locked_until > NOW(),
    'locked_until', v_row.locked_until,
    'retry_after_seconds', v_retry_after,
    'failed_count', v_next_count,
    'remaining_attempts', GREATEST(p_max_attempts - v_next_count, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION clear_staff_pin_attempts(
  p_branch_id UUID,
  p_staff_pin_id UUID,
  p_actor_user_id UUID,
  p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM staff_pin_attempts
  WHERE branch_id = p_branch_id
    AND staff_pin_id = p_staff_pin_id
    AND actor_user_id = p_actor_user_id
    AND ip_hash = COALESCE(p_ip_hash, '');

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION check_staff_pin_lockout(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_staff_pin_failure(UUID, UUID, UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION clear_staff_pin_attempts(UUID, UUID, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION check_staff_pin_lockout(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_staff_pin_failure(UUID, UUID, UUID, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION clear_staff_pin_attempts(UUID, UUID, UUID, TEXT) TO service_role;

-- Verification:
-- SELECT proname FROM pg_proc
-- WHERE proname IN ('check_staff_pin_lockout','record_staff_pin_failure','clear_staff_pin_attempts');
