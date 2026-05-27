import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('close caja shift operation', () => {
  it('moves cash shift opening into an authorized audited RPC', () => {
    const migration = read('supabase/migrations/20260527000004_open_caja_shift_operation.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION open_caja_shift_operation');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('get_user_restaurant_id()');
    expect(migration).toContain("v_role NOT IN ('Dueno', 'Encargado')");
    expect(migration).toContain('business_operations');
    expect(migration).toContain('audit_logs');
    expect(migration).toContain('idx_one_open_caja_per_branch');
    expect(migration).toContain("status = 'abierto'");
  });

  it('prevents the open shift modal from creating caja_shifts directly', () => {
    const modal = read('src/components/caja/OpenShiftModal.jsx');
    const helper = read('src/lib/cajaShiftOperations.js');

    expect(modal).not.toContain('base44.entities.CajaShift.create');
    expect(modal).not.toContain('base44.entities.CajaShift.filter');
    expect(modal).toContain('openCajaShiftOperation');
    expect(helper).toContain("supabase.rpc('open_caja_shift_operation'");
    expect(helper).toContain("operation_type: 'OPEN_CAJA_SHIFT'");
  });

  it('moves cash shift closing into an authorized audited RPC', () => {
    const migration = read('supabase/migrations/20260527000002_close_caja_shift_operation.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION close_caja_shift_operation');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('get_user_restaurant_id()');
    expect(migration).toContain("v_role NOT IN ('Dueno', 'Encargado')");
    expect(migration).toContain('business_operations');
    expect(migration).toContain('audit_logs');
    expect(migration).toContain("status = 'abierta'");
    expect(migration).toContain('total_facturado_turno = v_total_real');
    expect(migration).toContain('v_requested_rest');
  });

  it('prevents the close shift modal from updating caja_shifts directly', () => {
    const modal = read('src/components/caja/CloseShiftModal.jsx');
    const helper = read('src/lib/cajaShiftOperations.js');

    expect(modal).not.toContain('base44.entities.CajaShift.update');
    expect(modal).not.toContain('base44.entities.Turn.filter');
    expect(modal).toContain('closeCajaShiftOperation');
    expect(helper).toContain("supabase.rpc('close_caja_shift_operation'");
    expect(helper).toContain("operation_type: 'CLOSE_CAJA_SHIFT'");
  });
});
