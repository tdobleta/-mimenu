import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('stock operations hardening', () => {
  it('adds purchases through an authorized atomic ingreso RPC', () => {
    const migration = read('supabase/migrations/20260527000006_stock_ingreso_idempotent.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION increment_stock_with_ingreso');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('get_user_restaurant_id()');
    expect(migration).toContain('stock_ingresos');
    expect(migration).toContain('client_uid');
    expect(migration).toContain('UPDATE stock_items');
  });

  it('keeps manual stock movements atomic from the UI layer', () => {
    const api = read('src/lib/stockApi.js');
    const stockPage = read('src/pages/Stock.jsx');

    expect(api).toContain("supabase.rpc('increment_stock_with_ingreso'");
    expect(api).toContain("supabase.rpc('decrement_stock_with_egreso'");
    expect(stockPage).toContain('decrementStockWithEgreso');
    expect(stockPage).not.toContain('addEgreso as dbAddEgreso');
    expect(stockPage).not.toContain('base44.entities.StockItem.update(it.id, { actual: nuevoStock })');
  });
});
