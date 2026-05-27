import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('sales operations hardening', () => {
  it('moves sale corrections to a server-side idempotent RPC', () => {
    const migration = read('supabase/migrations/20260526000001_sales_operations.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION apply_sales_operation');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('get_user_restaurant_id()');
    expect(migration).toContain('get_user_role()');
    expect(migration).toContain('business_operations');
    expect(migration).toContain('audit_logs');
    expect(migration).toContain('archived_at');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+turns/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+turn_items/i);
  });

  it('prevents analytics UI from updating or deleting sales directly', () => {
    const editor = read('src/components/analytics/SalesEditorPanel.jsx');
    const actions = read('src/components/analytics/AnalyticsActions.jsx');
    const helper = read('src/lib/salesOperations.js');

    for (const source of [editor, actions]) {
      expect(source).not.toContain('base44.entities.Turn.update');
      expect(source).not.toContain('base44.entities.Turn.delete');
      expect(source).not.toContain('base44.entities.TurnItem.delete');
    }

    expect(helper).toContain("supabase.rpc('apply_sales_operation'");
    expect(editor).toContain('voidSale');
    expect(editor).toContain('archiveSale');
    expect(actions).toContain('resetAnalytics');
  });
});
