import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('Mercado Pago Point payment intent hardening', () => {
  it('persists intents for idempotency and tenant-scoped polling', () => {
    const migration = read('supabase/migrations/20260527000003_mp_payment_intents.sql');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS mp_payment_intents');
    expect(migration).toContain('idempotency_key TEXT NOT NULL UNIQUE');
    expect(migration).toContain('mp_intent_id    TEXT NOT NULL UNIQUE');
    expect(migration).toContain('REVOKE ALL ON TABLE public.mp_payment_intents FROM authenticated');
    expect(migration).toContain('GRANT ALL ON TABLE public.mp_payment_intents TO service_role');
  });

  it('validates scope, reuses idempotency keys, and records MP intents server-side', () => {
    const intentFn = read('supabase/functions/mp-payment-intent/index.ts');
    const statusFn = read('supabase/functions/mp-payment-status/index.ts');
    const modal = read('src/components/salon/CloseTableModal.jsx');

    expect(intentFn).toContain('assertBranchAndTurnScope');
    expect(intentFn).toContain('idempotencyKey');
    expect(intentFn).toContain("from('mp_payment_intents')");
    expect(intentFn).toContain('reused: true');
    expect(statusFn).toContain("from('mp_payment_intents')");
    expect(statusFn).toContain('Intent no encontrado para este restaurante');
    expect(modal).toContain('mpIntentKeyRef');
    expect(modal).toContain('idempotencyKey: mpIntentKeyRef.current');
    expect(modal).toContain('branchId');
  });
});
