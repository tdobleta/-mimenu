import { describe, expect, it } from 'vitest';
import {
  buildCloseTableOperation,
  buildCloseTableSyncPayload,
  getOrCreateDeviceId,
} from '@/lib/operations/closeTableOperation';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
}

describe('buildCloseTableOperation', () => {
  it('creates a complete close table operation without changing legacy totals', () => {
    const storage = memoryStorage();
    const table = {
      id: 4,
      num: 4,
      turnId: 'turn-1',
      openedAt: '2026-05-25T12:00:00.000Z',
      mozo: 'Ana',
      order: [
        { uid: 'line-1', itemId: 'menu-1', nombre: 'Milanesa', precio: 1000, qty: 2, nota: 'sin sal' },
        { uid: 'line-2', itemId: 'libre-1', nombre: 'Extra', precio: 500, qty: 1, libre: true },
      ],
    };

    const op = buildCloseTableOperation({
      restaurantId: 'rest-1',
      branchId: 'branch-1',
      table,
      cajaShiftId: 'shift-1',
      method: 'Efectivo',
      finalTotal: 2300,
      discountAmount: 200,
      discountReason: 'promo',
      tipAmount: 300,
      pagos: [{ metodo: 'Efectivo', monto: 2600 }],
      user: { id: 'user-1', email: 'dueno@example.com' },
      userRole: 'Dueno',
      activeStaff: { id: 'pin-1', nombre: 'Ana', rol: 'Mozo' },
      now: () => new Date('2026-05-25T15:00:00.000Z'),
      storage,
    });

    expect(op.operation_type).toBe('CLOSE_TABLE');
    expect(op.operation_version).toBe(1);
    expect(op.tenant).toEqual({ restaurant_id: 'rest-1', branch_id: 'branch-1' });
    expect(op.table.turn_id).toBe('turn-1');
    expect(op.caja.caja_shift_id).toBe('shift-1');
    expect(op.items_snapshot).toHaveLength(2);
    expect(op.items_snapshot[1].is_free_item).toBe(true);
    expect(op.pricing.subtotal).toBe(2500);
    expect(op.pricing.discount_amount).toBe(200);
    expect(op.pricing.discount_reason).toBe('promo');
    expect(op.pricing.total_charged).toBe(2600);
    expect(op.payment.payments_detail[0].amount).toBe(2600);
    expect(op.sync.status).toBe('pending_sync');
  });

  it('keeps a stable local device id in storage', () => {
    const storage = memoryStorage();
    const first = getOrCreateDeviceId(storage);
    const second = getOrCreateDeviceId(storage);
    expect(first).toBe(second);
    expect(first.startsWith('dev_')).toBe(true);
  });

  it('keeps legacy CLOSE_TABLE queue payloads compatible', () => {
    const payload = buildCloseTableSyncPayload({
      id: 'queue-1',
      type: 'CLOSE_TABLE',
      turn_id: 'turn-1',
      table_id: 7,
      branch_id: 'branch-1',
      caja_shift_id: 'shift-1',
      total: 1800,
      propina: 200,
      metodo: 'Efectivo',
      mozo: 'Ana',
      pagos: [{ metodo: 'Efectivo', monto: 2000 }],
    });

    expect(payload).toMatchObject({
      operationId: 'queue-1',
      turnId: 'turn-1',
      tableId: 7,
      branchId: 'branch-1',
      cajaShiftId: 'shift-1',
      total: 1800,
      propina: 200,
      metodo: 'Efectivo',
      mozo: 'Ana',
    });
    expect(payload.pagosDetalle).toEqual([{ metodo: 'Efectivo', monto: 2000 }]);
  });

  it('throws when branchId is missing', () => {
    expect(() =>
      buildCloseTableOperation({
        table: { id: 1, num: 1, order: [] },
        method: 'Efectivo',
        finalTotal: 0,
        storage: memoryStorage(),
      })
    ).toThrow('branchId');
  });

  it('throws when table is missing', () => {
    expect(() =>
      buildCloseTableOperation({
        branchId: 'b-1',
        method: 'Efectivo',
        finalTotal: 0,
        storage: memoryStorage(),
      })
    ).toThrow('table');
  });

  it('throws when method is missing', () => {
    expect(() =>
      buildCloseTableOperation({
        branchId: 'b-1',
        table: { id: 1, num: 1, order: [] },
        finalTotal: 0,
        storage: memoryStorage(),
      })
    ).toThrow('method');
  });

  it('handles table with empty order', () => {
    const op = buildCloseTableOperation({
      branchId: 'b-1',
      table: { id: 1, num: 1, order: [] },
      method: 'Efectivo',
      finalTotal: 0,
      storage: memoryStorage(),
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    expect(op.items_snapshot).toHaveLength(0);
    expect(op.pricing.subtotal).toBe(0);
    expect(op.pricing.total_charged).toBe(0);
  });

  it('handles mixed payment with multiple pagos', () => {
    const op = buildCloseTableOperation({
      branchId: 'b-1',
      table: { id: 1, num: 1, order: [{ nombre: 'Item', precio: 2000, qty: 1 }] },
      method: 'Mixto',
      finalTotal: 2000,
      pagos: [
        { metodo: 'Efectivo', monto: 1000 },
        { metodo: 'Tarjeta', monto: 1000 },
      ],
      storage: memoryStorage(),
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    expect(op.payment.payments_detail).toHaveLength(2);
    expect(op.payment.payments_detail[0].amount).toBe(1000);
    expect(op.payment.payments_detail[1].amount).toBe(1000);
  });

  it('calculates correct subtotal from order items', () => {
    const op = buildCloseTableOperation({
      branchId: 'b-1',
      table: {
        id: 1, num: 1,
        order: [
          { nombre: 'Lomo', precio: 15000, qty: 2 },
          { nombre: 'Agua', precio: 1500, qty: 3 },
          { nombre: 'Postre', precio: 5000, qty: 1 },
        ],
      },
      method: 'Efectivo',
      finalTotal: 39500,
      storage: memoryStorage(),
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    expect(op.pricing.subtotal).toBe(15000 * 2 + 1500 * 3 + 5000);
  });

  it('derives sync payload from the full operation when legacy fields are absent', () => {
    const operation = buildCloseTableOperation({
      restaurantId: 'rest-1',
      branchId: 'branch-1',
      table: {
        id: 'mesa-local-1',
        num: 12,
        turnId: 'turn-12',
        mozo: 'Ana',
        order: [{ uid: 'line-1', itemId: 'menu-1', nombre: 'Pizza', precio: 3000, qty: 1 }],
      },
      cajaShiftId: 'shift-1',
      method: 'Tarjeta',
      finalTotal: 3000,
      tipAmount: 300,
      pagos: [{ metodo: 'Tarjeta', monto: 3300 }],
      storage: memoryStorage(),
      now: () => new Date('2026-05-25T18:00:00.000Z'),
    });

    const payload = buildCloseTableSyncPayload({ type: 'CLOSE_TABLE', operation });

    expect(payload.operationId).toBe(operation.operation_id);
    expect(payload.turnId).toBe('turn-12');
    expect(payload.tableId).toBe('mesa-local-1');
    expect(payload.branchId).toBe('branch-1');
    expect(payload.cajaShiftId).toBe('shift-1');
    expect(payload.total).toBe(3000);
    expect(payload.propina).toBe(300);
    expect(payload.metodo).toBe('Tarjeta');
    expect(payload.pagosDetalle).toEqual([
      { metodo: 'Tarjeta', monto: 3300, provider: 'manual', provider_reference: null },
    ]);
  });
});
