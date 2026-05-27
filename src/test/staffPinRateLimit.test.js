import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('staff PIN rate limiting', () => {
  it('defines database-backed lockout state and RPC helpers', () => {
    const migration = read('supabase/migrations/20260527000001_staff_pin_rate_limit.sql');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS staff_pin_attempts');
    expect(migration).toContain('UNIQUE (branch_id, staff_pin_id, actor_user_id, ip_hash)');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION check_staff_pin_lockout');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION record_staff_pin_failure');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION clear_staff_pin_attempts');
    expect(migration).toContain('REVOKE ALL ON TABLE public.staff_pin_attempts FROM authenticated');
    expect(migration).toContain('GRANT ALL ON TABLE public.staff_pin_attempts TO service_role');
  });

  it('enforces lockouts from the staff-pin-auth edge function', () => {
    const fn = read('supabase/functions/staff-pin-auth/index.ts');

    expect(fn).toContain('MAX_PIN_FAILURES = 5');
    expect(fn).toContain("supabase.rpc('check_staff_pin_lockout'");
    expect(fn).toContain("supabase.rpc('record_staff_pin_failure'");
    expect(fn).toContain("supabase.rpc('clear_staff_pin_attempts'");
    expect(fn).toContain('pinLockedResponse');
    expect(fn).toContain('Retry-After');
    expect(fn).toContain('remainingAttempts');
  });
});
