import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const SERVER_ERROR_EDGE_FUNCTIONS = [
  'afip-settings',
  'cocina-feed',
  'cocina-update',
  'crm-email',
  'facturar',
  'invite-member',
  'mp-payment-intent',
  'mp-payment-status',
  'mp-settings',
  'send-receipt',
  'staff-pin-auth',
];

function sourceFor(functionName) {
  return readFileSync(join(ROOT, 'supabase', 'functions', functionName, 'index.ts'), 'utf8');
}

describe('Edge Function support-safe errors', () => {
  it('returns request ids for unexpected server errors without exposing internals', () => {
    const shared = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'http.ts'), 'utf8');

    expect(shared).toContain('serverErrorResponse');
    expect(shared).toContain('requestId');
    expect(shared).toContain('console.error');
    expect(shared).not.toContain('stack');
  });

  it('does not return debug fields or raw exception messages from sensitive functions', () => {
    for (const functionName of SERVER_ERROR_EDGE_FUNCTIONS) {
      const source = sourceFor(functionName);

      expect(source, functionName).not.toMatch(/\bdebug\s*:/);
      expect(source, functionName).not.toMatch(/return\s+json\([^)]*\{\s*error:\s*err/i);
      expect(source, functionName).not.toMatch(/return\s+json\(req,\s*\{\s*error:\s*\(err/i);
      expect(source, functionName).not.toMatch(/JSON\.stringify\(\{\s*ok:\s*false,\s*error:\s*msg/i);
      expect(source, functionName).toContain('serverErrorResponse');
    }
  });
});
