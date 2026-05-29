-- ============================================================
-- E1A Migration 2/2: Employee logins + rate limiting
--
-- Database foundation for employee login via
-- restaurant_slug + username + password.
--
-- Passwords are hashed with bcrypt in the Edge Function before
-- INSERT — plaintext never stored.
--
-- This table does NOT replace team_members or staff_pins.
-- All three systems coexist independently.
--
-- RLS: enabled with NO authenticated browser access.
-- Only service_role (Edge Functions) can read/write.
-- Authenticated policies will be added in a future task
-- when the employee management UI is built.
-- ============================================================

-- ── employee_logins table ───────────────────────────────────

CREATE TABLE employee_logins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  staff_pin_id  uuid REFERENCES staff_pins(id) ON DELETE SET NULL,
  username      text NOT NULL,
  password_hash text NOT NULL,
  nombre        text NOT NULL,
  rol           text NOT NULL CHECK (rol IN ('Encargado', 'Mozo', 'Cocinero')),
  permisos      jsonb NOT NULL DEFAULT '[]'::jsonb,
  activo        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Username must be unique within a restaurant (case-insensitive)
CREATE UNIQUE INDEX employee_logins_restaurant_username
  ON employee_logins (restaurant_id, lower(username));

-- Fast listing by restaurant
CREATE INDEX employee_logins_restaurant_id
  ON employee_logins (restaurant_id);

-- Lookup by linked staff_pin
CREATE INDEX employee_logins_staff_pin_id
  ON employee_logins (staff_pin_id)
  WHERE staff_pin_id IS NOT NULL;

-- Auto-update updated_at using the existing trigger function
-- (defined in 20260524000099_master_setup.sql)
CREATE TRIGGER employee_logins_updated_at
  BEFORE UPDATE ON employee_logins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS: no authenticated access in E1A ─────────────────────

ALTER TABLE employee_logins ENABLE ROW LEVEL SECURITY;

-- Explicitly deny browser client access.
-- service_role bypasses RLS and has full access.
REVOKE ALL ON TABLE employee_logins FROM anon;
REVOKE ALL ON TABLE employee_logins FROM authenticated;

-- ── employee_login_attempts (rate limiting) ─────────────────

CREATE TABLE employee_login_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text NOT NULL UNIQUE,
  failed_count    integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until    timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_login_attempts ENABLE ROW LEVEL SECURITY;

-- No authenticated/anon access — service_role only via RPCs
REVOKE ALL ON TABLE employee_login_attempts FROM anon;
REVOKE ALL ON TABLE employee_login_attempts FROM authenticated;
GRANT ALL ON TABLE employee_login_attempts TO service_role;

-- ── Rate limiting RPCs ──────────────────────────────────────
-- Scope format for E1B Edge Function:
--   {restaurant_id}:{lower(username)}
-- Example: "a1b2c3d4-...:juan"

CREATE OR REPLACE FUNCTION check_employee_login_lockout(p_scope text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt employee_login_attempts%ROWTYPE;
  v_seconds integer := 0;
BEGIN
  SELECT * INTO v_attempt
  FROM employee_login_attempts
  WHERE scope = p_scope
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('locked', false);
  END IF;

  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > now() THEN
    v_seconds := CEIL(EXTRACT(EPOCH FROM (v_attempt.locked_until - now())))::integer;
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

CREATE OR REPLACE FUNCTION record_employee_login_failure(
  p_scope text,
  p_max_failures integer DEFAULT 5,
  p_lock_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row employee_login_attempts%ROWTYPE;
  v_next_count integer;
  v_locked_until timestamptz;
  v_retry_after integer := 0;
BEGIN
  -- Clamp minimums for safety
  IF p_max_failures < 2 THEN p_max_failures := 5; END IF;
  IF p_lock_seconds < 60 THEN p_lock_seconds := 900; END IF;

  INSERT INTO employee_login_attempts (scope, failed_count, last_attempt_at)
  VALUES (p_scope, 1, now())
  ON CONFLICT (scope) DO UPDATE SET
    failed_count = CASE
      -- Reset count if previous lockout has expired
      WHEN employee_login_attempts.locked_until IS NOT NULL
       AND employee_login_attempts.locked_until <= now() THEN 1
      ELSE employee_login_attempts.failed_count + 1
    END,
    locked_until = NULL,
    last_attempt_at = now()
  RETURNING * INTO v_row;

  v_next_count := v_row.failed_count;

  IF v_next_count >= p_max_failures THEN
    v_locked_until := now() + make_interval(secs => p_lock_seconds);
    UPDATE employee_login_attempts
    SET locked_until = v_locked_until
    WHERE id = v_row.id
    RETURNING * INTO v_row;
    v_retry_after := p_lock_seconds;
  END IF;

  RETURN jsonb_build_object(
    'locked', v_row.locked_until IS NOT NULL AND v_row.locked_until > now(),
    'locked_until', v_row.locked_until,
    'retry_after_seconds', v_retry_after,
    'failed_count', v_next_count,
    'remaining_attempts', GREATEST(p_max_failures - v_next_count, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION clear_employee_login_attempts(p_scope text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM employee_login_attempts WHERE scope = p_scope;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Grants: service_role only ───────────────────────────────

REVOKE ALL ON FUNCTION check_employee_login_lockout(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION check_employee_login_lockout(text) FROM anon;
REVOKE ALL ON FUNCTION check_employee_login_lockout(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION check_employee_login_lockout(text) TO service_role;

REVOKE ALL ON FUNCTION record_employee_login_failure(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_employee_login_failure(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION record_employee_login_failure(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_employee_login_failure(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION clear_employee_login_attempts(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION clear_employee_login_attempts(text) FROM anon;
REVOKE ALL ON FUNCTION clear_employee_login_attempts(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION clear_employee_login_attempts(text) TO service_role;
