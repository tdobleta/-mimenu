import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildObservabilityContext, sanitizeBreadcrumbData } from '@/lib/observability';

describe('observability', () => {
  it('builds operational context without user email', () => {
    const context = buildObservabilityContext({
      user: { id: 'user-1', email: 'owner@example.com' },
      route: '/salon',
      online: false,
      store: {
        restaurantId: 'rest-1',
        branchId: 'branch-1',
        userRole: 'Dueno',
        sucursales: [{ id: 'branch-1' }],
        turnoActivo: { id: 'shift-1', branch_id: 'branch-1' },
      },
    });

    expect(context.user).toEqual({ id: 'user-1' });
    expect(context.tags).toMatchObject({
      restaurant_id: 'rest-1',
      branch_id: 'branch-1',
      role: 'Dueno',
      route: '/salon',
      online: 'false',
    });
    expect(JSON.stringify(context)).not.toContain('owner@example.com');
  });

  it('falls back to first branch when global branch selector is active', () => {
    const context = buildObservabilityContext({
      store: {
        restaurantId: 'rest-1',
        branchId: 'todas',
        sucursales: [{ id: 'branch-main' }],
      },
    });

    expect(context.tags.branch_id).toBe('branch-main');
  });

  it('removes secrets from breadcrumb data', () => {
    const clean = sanitizeBreadcrumbData({
      token: 'secret',
      access_token: 'secret',
      mp_access_token: 'secret',
      email: 'owner@example.com',
      operation_id: 'op-1',
      nested: { nope: true },
    });

    expect(clean).toEqual({ operation_id: 'op-1', nested: '[object]' });
  });

  it('keeps Sentry DSN environment-driven instead of hardcoded', () => {
    const source = readFileSync('src/main.jsx', 'utf8');

    expect(source).toContain('VITE_SENTRY_DSN');
    expect(source).not.toMatch(/https:\/\/[^'"]+\.ingest\.us\.sentry\.io\/\d+/);
  });

  it('does not expose Anthropic credentials through frontend Vite variables', () => {
    const source = readFileSync('src/components/MimenuChatbot.jsx', 'utf8');

    expect(source).not.toContain('VITE_ANTHROPIC_API_KEY');
    expect(source).not.toContain('api.anthropic.com');
    expect(source).not.toContain('anthropic-dangerous-direct-browser-access');
    expect(source).toContain("supabase.functions.invoke('chat'");
  });
});
