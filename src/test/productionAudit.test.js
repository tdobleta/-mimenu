import { describe, expect, it } from 'vitest';
import {
  REQUIRED_EDGE_FUNCTIONS,
  REQUIRED_TABLES,
  buildProductionAuditExport,
  buildProductionAuditReport,
} from '@/lib/productionAudit';

const okTables = Object.fromEntries(REQUIRED_TABLES.map(name => [name, { ok: true }]));
const okFunctions = Object.fromEntries(REQUIRED_EDGE_FUNCTIONS.map(name => [name, { ok: true }]));

const base = {
  env: {
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon',
    VITE_SENTRY_DSN: 'https://public@example.ingest.us.sentry.io/1',
  },
  sourceScan: {
    frontendAnthropicKey: false,
    directAnthropicBrowserCall: false,
    hardcodedSentryDsn: false,
    trackedEnvLocal: false,
    obsoleteSnapshotsTracked: false,
  },
  health: {
    ok: true,
    checks: {
      service_role_key: { ok: true },
      database: { ok: true },
      resend_api_key: { ok: true },
    },
  },
  tables: okTables,
  functions: okFunctions,
  deployment: { sentryConfigured: true },
};

describe('productionAudit', () => {
  it('marks a complete platform as production ready', () => {
    const report = buildProductionAuditReport(base);

    expect(report.status).toBe('ready');
    expect(report.critical).toBe(0);
    expect(report.warning).toBe(0);
    expect(report.score).toBe(100);
  });

  it('blocks production when secrets or provider calls leak into frontend', () => {
    const report = buildProductionAuditReport({
      ...base,
      sourceScan: {
        ...base.sourceScan,
        frontendAnthropicKey: true,
        directAnthropicBrowserCall: true,
      },
    });

    expect(report.status).toBe('blocked');
    expect(report.checks.find(c => c.id === 'source_no_browser_anthropic').status).toBe('critical');
  });

  it('warns when Sentry is not configured in the hosting environment', () => {
    const report = buildProductionAuditReport({
      ...base,
      env: { ...base.env, VITE_SENTRY_DSN: '' },
      deployment: { sentryConfigured: false },
    });

    expect(report.status).toBe('ready_with_warnings');
    expect(report.checks.find(c => c.id === 'env_sentry_dsn').status).toBe('warning');
    expect(report.checks.find(c => c.id === 'deployment_sentry_netlify').status).toBe('warning');
  });

  it('blocks when core backend schema is missing', () => {
    const report = buildProductionAuditReport({
      ...base,
      tables: { ...okTables, business_operations: { ok: false, error: 'missing' } },
    });

    expect(report.status).toBe('blocked');
    expect(report.missing_tables).toEqual(['business_operations']);
    expect(report.checks.find(c => c.id === 'schema_required_tables').status).toBe('critical');
  });

  it('builds a support-safe export', () => {
    const report = buildProductionAuditReport({
      ...base,
      generatedAt: '2026-05-26T12:00:00.000Z',
    });
    const exported = buildProductionAuditExport(report, {
      appUrl: 'https://mimenuar.netlify.app',
      supabaseUrl: 'https://project.supabase.co',
      generatedAt: '2026-05-26T12:01:00.000Z',
    });

    expect(exported.supabase_project).toBe('project.supabase.co');
    expect(exported.summary.status).toBe('ready');
    expect(exported.checks[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      area: expect.any(String),
      status: expect.any(String),
      action: expect.any(String),
    }));
  });
});
