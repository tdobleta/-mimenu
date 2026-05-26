import { describe, expect, it } from 'vitest';
import { buildSupportOpsSnapshot, groupByStatus, groupQueueByType } from '@/lib/supportOps';

describe('supportOps', () => {
  it('groups business operations by status', () => {
    expect(groupByStatus([
      { status: 'applied' },
      { status: 'failed' },
      { status: 'applied' },
      {},
    ])).toEqual({ applied: 2, failed: 1, unknown: 1 });
  });

  it('groups offline queue operations by type', () => {
    expect(groupQueueByType([
      { type: 'CLOSE_TABLE' },
      { type: 'CLOSE_TABLE' },
      { type: 'INSERT_TURN_ITEM' },
      {},
    ])).toEqual({ CLOSE_TABLE: 2, INSERT_TURN_ITEM: 1, UNKNOWN: 1 });
  });

  it('builds a support snapshot with only operational fields', () => {
    const snapshot = buildSupportOpsSnapshot({
      generatedAt: '2026-05-26T12:00:00.000Z',
      businessOperations: [
        {
          operation_id: 'op-1',
          operation_type: 'CLOSE_TABLE',
          status: 'applied',
          turn_id: 'turn-1',
          created_at: '2026-05-26T11:00:00.000Z',
          applied_at: '2026-05-26T11:00:01.000Z',
          payload: { sensitive: 'not exported' },
        },
        {
          operation_id: 'op-2',
          operation_type: 'CLOSE_TABLE',
          status: 'failed',
          last_error: 'network',
        },
      ],
      auditLogs: [{ id: 'a1', accion: 'Abrir caja', usuario: 'admin@test.com', detalle: 'ok' }],
      activeQueue: [{ id: 'q1', type: 'INSERT_TURN_ITEM' }],
      failedQueue: [{ id: 'q2', type: 'CLOSE_TABLE', lastError: 'timeout' }],
    });

    expect(snapshot.summary).toEqual({
      business_operations: 2,
      business_failed: 1,
      business_processing: 0,
      audit_logs: 1,
      offline_active: 1,
      offline_failed: 1,
    });
    expect(snapshot.operation_status).toEqual({ applied: 1, failed: 1 });
    expect(snapshot.offline_queue_by_type).toEqual({ INSERT_TURN_ITEM: 1, CLOSE_TABLE: 1 });
    expect(snapshot.latest_business_operations[0]).not.toHaveProperty('payload');
    expect(snapshot.failed_offline_operations[0].last_error).toBe('timeout');
  });
});
