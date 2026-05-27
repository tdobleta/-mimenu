import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('fiscal contingency hardening', () => {
  it('creates contingency records through an authorized RPC', () => {
    const migration = read('supabase/migrations/20260527000007_fiscal_contingencia_rpc.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION create_factura_contingencia');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('get_user_restaurant_id()');
    expect(migration).toContain('facturas_contingencia');
    expect(migration).toContain('audit_logs');
    expect(migration).toContain('venta invalida para esta sucursal');
  });

  it('prevents FacturaModal from inserting fiscal rows directly', () => {
    const modal = read('src/components/facturacion/FacturaModal.jsx');

    expect(modal).not.toContain("from('facturas').insert");
    expect(modal).not.toContain("from('facturas_contingencia').insert");
    expect(modal).toContain("supabase.rpc('create_factura_contingencia'");
  });
});
