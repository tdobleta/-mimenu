import { describe, expect, it } from 'vitest';
import {
  HORA_PICO_STEPS,
  buildHoraPicoEvidenceReport,
  groupStepsByPhase,
  summarizeHoraPicoRunbook,
} from '@/lib/horaPicoRunbook';

describe('horaPicoRunbook', () => {
  it('keeps every step with a phase, label and evidence', () => {
    expect(HORA_PICO_STEPS.length).toBeGreaterThan(10);
    expect(HORA_PICO_STEPS.every(step => step.id && step.phase && step.label && step.objective && step.evidence)).toBe(true);
  });

  it('summarizes critical progress separately from total progress', () => {
    const requiredIds = HORA_PICO_STEPS.filter(step => step.required).map(step => step.id);
    const partial = summarizeHoraPicoRunbook(HORA_PICO_STEPS, requiredIds.slice(0, 2));
    const ready = summarizeHoraPicoRunbook(HORA_PICO_STEPS, requiredIds);

    expect(partial.status).toBe('in_progress');
    expect(partial.required_completed).toBe(2);
    expect(ready.status).toBe('ready_to_run');
    expect(ready.blocked).toHaveLength(0);
  });

  it('groups steps by phase', () => {
    const grouped = groupStepsByPhase(HORA_PICO_STEPS);
    expect(Object.keys(grouped)).toContain('Caja');
    expect(Object.keys(grouped)).toContain('Offline');
    expect(grouped.Caja.some(step => step.id === 'open_cash_shift')).toBe(true);
  });

  it('builds exportable evidence report', () => {
    const report = buildHoraPicoEvidenceReport({
      completedIds: ['pre_audit_ready', 'open_cash_shift'],
      notes: 'Monitor cocina + iPad + Point Smart',
      operator: 'QA',
      generatedAt: '2026-05-26T12:00:00.000Z',
    });

    expect(report.operator).toBe('QA');
    expect(report.notes).toContain('Point Smart');
    expect(report.steps.find(step => step.id === 'open_cash_shift').completed).toBe(true);
    expect(report.steps.find(step => step.id === 'offline_sale').completed).toBe(false);
  });
});
