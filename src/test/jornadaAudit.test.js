import { describe, expect, it } from 'vitest';
import { buildJornadaAuditReport } from '@/lib/jornadaAudit';

const base = {
  sucursales: [{ id: 'branch-1', nombre: 'Principal', mesas: 12 }],
  activeBranchId: 'branch-1',
  tables: Array.from({ length: 12 }, (_, i) => ({ id: i + 1 })),
  menuItems: [{ id: 'm1' }, { id: 'm2' }],
  turnoActivo: { id: 'shift-1' },
  teamMembers: [{ id: 'u1' }],
  stockItems: [{ id: 's1', nombre: 'Carne', actual: 10, minimo: 2 }],
  staffPinsCount: 8,
  kitchenDevicesCount: 1,
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

  it('allows opening with warnings for optional integrations', () => {
    const report = buildJornadaAuditReport({
      ...base,
      kitchenDevicesCount: 0,
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
});
