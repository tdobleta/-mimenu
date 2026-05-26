import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const SENSITIVE_EDGE_FUNCTIONS = [
  'afip-settings',
  'crm-email',
  'facturar',
  'health',
  'invite-member',
  'mp-list-devices',
  'mp-payment-intent',
  'mp-payment-status',
  'mp-settings',
  'mp-test-device',
  'send-receipt',
  'staff-pin-auth',
];

function sourceFor(functionName) {
  return readFileSync(join(ROOT, 'supabase', 'functions', functionName, 'index.ts'), 'utf8');
}

describe('Edge Function CORS hardening', () => {
  it('centralizes CORS allowlist logic in the shared helper', () => {
    const shared = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'http.ts'), 'utf8');
    expect(shared).toContain('APP_ALLOWED_ORIGINS');
    expect(shared).toContain('https://mimenuar.netlify.app');
    expect(shared).toContain('Vary');
    expect(shared).not.toContain("'Access-Control-Allow-Origin': '*'");
  });

  it('does not allow wildcard origins in sensitive Edge Functions', () => {
    for (const functionName of SENSITIVE_EDGE_FUNCTIONS) {
      const source = sourceFor(functionName);
      expect(source, functionName).not.toContain("'Access-Control-Allow-Origin': '*'");
      expect(source, functionName).not.toContain('"Access-Control-Allow-Origin": "*"');
      expect(source, functionName).toContain("../_shared/http.ts");
    }
  });
});
