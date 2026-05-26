import { describe, expect, it } from 'vitest';
import { buildJornadaAuditReport, buildJornadaAuditSupportReport } from '@/lib/jornadaAudit';

const base = {
  sucursales: [{ id: 'branch-1', nombre: 'Principal', mesas: 12 }],
  activeBranchId: 'branch-1',
  tables: Array.from({ length: 12 }, (_, i) => ({ id: i + 1 })),
  menuItems: [{ id: 'm1' }, { id: 'm2' }],
  turnoActivo: { id: 'shift-1', branch_id: 'branch-1' },
  teamMembers: [{ id: 'u1' }],
  stockItems: [{ id: 's1', nombre: 'Carne', actual: 10, minimo: 2 }],
  staffPinsCount: 8,
  kitchenDevicesCount: 1,
  printer: { method: 'browser' },
  relay: { enabled: true, connected: true, url: 'ws://mimenu-caja.local:3001' },
  storage: { supported: true, persisted: true },
  mp: { accessToken: true, deviceId: true },
  afip: { enabled: true, credentialsReady: true },
  offline: { active: 0, failed: 0 },
  isOnline: true,
};

describe('buildJornadaAuditReport', () => {
  it('marks a complete restaurant as ready', () => {
    const report = buildJornadaAuditReport(base);
    expect(report.status).toBe('ready');
    expect(report.critical).toBe(0);
    expect(report.warning).toBe(0);
    expect(report.score).toBe(100);
  });

  it('blocks opening when critical operation basics are missing', () => {
    const report = buildJornadaAuditReport({
      ...base,
      turnoActivo: null,
      menuItems: [],
      staffPinsCount: 0,
      offline: { active: 0, failed: 2 },
    });

    expect(report.status).toBe('blocked');
    expect(report.critical).toBeGreaterThanOrEqual(4);
    expect(report.checks.find(c => c.id === 'cash_shift').status).toBe('critical');
    expect(report.checks.find(c => c.id === 'offline_failed').status).toBe('critical');
  });

  it('blocks when the open cash shift belongs to another branch', () => {
    const report = buildJornadaAuditReport({
      ...base,
      turnoActivo: { id: 'shift-2', branch_id: 'branch-2' },
    });

    expect(report.status).toBe('blocked');
    expect(report.checks.find(c => c.id === 'cash_shift').status).toBe('critical');
  });

  it('allows opening with warnings for optional integrations', () => {
    const report = buildJornadaAuditReport({
      ...base,
      kitchenDevicesCount: 0,
      printer: { method: 'epson', epsonIp: '' },
      relay: { enabled: true, connected: false },
      storage: { supported: true, persisted: false },
      mp: {},
      afip: {},
      stockItems: [{ id: 's1', nombre: 'Queso', actual: 1, minimo: 4 }],
      offline: { active: 3, failed: 0 },
    });

    expect(report.status).toBe('ready_with_warnings');
    expect(report.critical).toBe(0);
    expect(report.warning).toBeGreaterThanOrEqual(4);
    expect(report.lowStock).toHaveLength(1);
  });

  it('marks Epson printers as ready only when an IP is configured', () => {
    const ready = buildJornadaAuditReport({
      ...base,
      printer: { method: 'epson', epsonIp: '192.168.1.90' },
    });
    const missingIp = buildJornadaAuditReport({
      ...base,
      printer: { method: 'epson', epsonIp: '' },
    });

    expect(ready.checks.find(c => c.id === 'printer').status).toBe('ok');
    expect(missingIp.checks.find(c => c.id === 'printer').status).toBe('warning');
  });

  it('builds a support-safe export without raw runtime objects', () => {
    const report = buildJornadaAuditReport({
      ...base,
      stockItems: [{ id: 's2', nombre: 'Tomate', actual: 1, minimo: 3, unidad: 'kg' }],
    });
    const exported = buildJornadaAuditSupportReport(report, {
      restaurantId: 'rest-1',
      restaurantName: 'Demo Rest',
      branchId: 'branch-1',
      generatedAt: '2026-05-26T00:00:00.000Z',
      appVersion: 'test',
    });

    expect(exported.restaurant).toEqual({ id: 'rest-1', name: 'Demo Rest' });
    expect(exported.summary.status).toBe('ready_with_warnings');
    expect(exported.checks.every(c => ['id', 'label', 'status', 'detail', 'action'].every(k => k in c))).toBe(true);
    expect(exported.low_stock).toEqual([{ id: 's2', name: 'Tomate', actual: 1, minimo: 3, unidad: 'kg' }]);
  });
});
