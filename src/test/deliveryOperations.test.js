import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('delivery operations hardening', () => {
  it('creates delivery orders through an authorized audited RPC', () => {
    const migration = read('supabase/migrations/20260527000008_delivery_order_operation.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION create_delivery_order_operation');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('get_user_restaurant_id()');
    expect(migration).toContain("v_role NOT IN ('Dueno', 'Encargado', 'Mozo')");
    expect(migration).toContain('business_operations');
    expect(migration).toContain('audit_logs');
    expect(migration).toContain('pedido_codigo');
    expect(migration).toContain('mesa_num');
    expect(migration).toContain('v_mesa_num := 900000');
    expect(migration).toContain('items required');
    expect(migration).toContain('turno de caja invalido');
    expect(migration).toContain("'delivery'");
  });

  it('keeps delivery order creation out of direct browser inserts', () => {
    const page = read('src/pages/Delivery.jsx');

    expect(page).toContain("supabase.rpc('create_delivery_order_operation'");
    expect(page).toContain("operation_type: 'CREATE_DELIVERY_ORDER'");
    expect(page).toContain('pedido_codigo');
    expect(page).not.toContain(".from('turns')\n        .insert");
    expect(page).not.toContain("from('turn_items').insert");
    expect(page).not.toContain('`DEL-${numPedido}`');
  });

  it('routes delivery status and rider updates through an authorized RPC', () => {
    const migration = read('supabase/migrations/20260527000009_delivery_update_operation.sql');
    const page = read('src/pages/Delivery.jsx');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION update_delivery_order_operation');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('get_user_restaurant_id()');
    expect(migration).toContain("v_role NOT IN ('Dueno', 'Encargado', 'Mozo')");
    expect(migration).toContain('business_operations');
    expect(migration).toContain('audit_logs');
    expect(migration).toContain("delivery debe estar cerrado antes de marcar entregado");

    expect(page).toContain("supabase.rpc('update_delivery_order_operation'");
    expect(page).toContain("operation_type: 'UPDATE_DELIVERY_ORDER'");
    expect(page).not.toContain("supabase.from('turns').update({ delivery_estado");
    expect(page).not.toContain("supabase.from('turns').update({ delivery_data");
  });
});
