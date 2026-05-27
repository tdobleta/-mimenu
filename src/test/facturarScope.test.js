import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('AFIP facturar scope validation', () => {
  it('validates both branch and turn ownership before fiscal emission', () => {
    const fn = read('supabase/functions/facturar/index.ts');

    expect(fn).toContain('assertBranchAndTurnScope');
    expect(fn).toContain("from('turns')");
    expect(fn).toContain('turn.branch_id !== branchId');
    expect(fn).toContain("eq('restaurant_id', restaurantId)");
    expect(fn).toContain('Sucursal o venta invalida para este restaurante');
  });
});
