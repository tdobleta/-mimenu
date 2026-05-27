import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('crm operations hardening', () => {
  it('archives customers through an authorized audited RPC', () => {
    const migration = read('supabase/migrations/20260527000005_customer_archive_operation.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION archive_customer_operation');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('get_user_restaurant_id()');
    expect(migration).toContain("v_role NOT IN ('Dueno', 'Encargado')");
    expect(migration).toContain('business_operations');
    expect(migration).toContain('audit_logs');
    expect(migration).toContain('deleted_at');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+customers/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+customer_visits/i);
  });

  it('keeps CRM UI from physically deleting customers', () => {
    const api = read('src/lib/crmApi.js');
    const page = read('src/pages/Clientes.jsx');

    expect(api).not.toContain("from('customers').delete");
    expect(api).toContain("supabase.rpc('archive_customer_operation'");
    expect(api).toContain("operation_type: 'ARCHIVE_CUSTOMER'");
    expect(api).toContain(".is('deleted_at', null)");
    expect(page).toContain('deleteCustomer(restaurantId');
  });
});
