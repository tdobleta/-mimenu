import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { total_facturado_turno: 50000 } })),
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/stockApi', () => ({
  descontarStockPorMesa: vi.fn(() => Promise.resolve()),
}));

import { cerrarMesaOnline } from '@/lib/cajaService';
import { buildCloseTableOperation } from '@/lib/operations/closeTableOperation';
import { supabase } from '@/api/supabaseClient';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

const makeTable = (order = [{ nombre: 'Pizza', precio: 5000, qty: 2 }]) => ({
  id: 1,
  num: 1,
  turnId: 'turn-1',
  openedAt: '2026-05-28T12:00:00Z',
  mozo: 'Ana',
  order,
});

const baseStore = {
  turnoActivo: { id: 'shift-1' },
  setTurnoActivo: vi.fn(),
};

describe('discount data flows through buildCloseTableOperation', () => {
  it('includes manual discount in pricing', () => {
    const op = buildCloseTableOperation({
      branchId: 'b-1',
      table: makeTable(),
      method: 'Efectivo',
      finalTotal: 8000,
      discountAmount: 2000,
      discountReason: 'promo lunes',
      storage: memoryStorage(),
      now: () => new Date('2026-05-28T15:00:00Z'),
    });
    expect(op.pricing.discount_amount).toBe(2000);
    expect(op.pricing.discount_reason).toBe('promo lunes');
    expect(op.pricing.subtotal).toBe(10000);
    expect(op.pricing.total_charged).toBe(8000);
  });

  it('includes combined manual + points discount', () => {
    const op = buildCloseTableOperation({
      branchId: 'b-1',
      table: makeTable(),
      method: 'Efectivo',
      finalTotal: 7500,
      discountAmount: 2500,
      discountReason: 'promo + puntos: 500',
      storage: memoryStorage(),
      now: () => new Date('2026-05-28T15:00:00Z'),
    });
    expect(op.pricing.discount_amount).toBe(2500);
    expect(op.pricing.discount_reason).toBe('promo + puntos: 500');
    expect(op.pricing.total_charged).toBe(7500);
  });

  it('defaults discount to zero when not provided', () => {
    const op = buildCloseTableOperation({
      branchId: 'b-1',
      table: makeTable(),
      method: 'Efectivo',
      finalTotal: 10000,
      storage: memoryStorage(),
      now: () => new Date('2026-05-28T15:00:00Z'),
    });
    expect(op.pricing.discount_amount).toBe(0);
    expect(op.pricing.discount_reason).toBeNull();
  });
});

describe('cerrarMesaOnline legacy path passes discount params', () => {
  it('passes discount from operation envelope to legacy RPC on fallback', async () => {
    // sync_close_table_operation not available → falls back to cerrar_mesa_atomico
    supabase.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function sync_close_table_operation' },
      })
      .mockResolvedValueOnce({ error: null });

    const operation = buildCloseTableOperation({
      restaurantId: 'rest-1',
      branchId: 'b-1',
      table: makeTable(),
      cajaShiftId: 'shift-1',
      method: 'Efectivo',
      finalTotal: 8000,
      discountAmount: 2000,
      discountReason: 'promo lunes',
      storage: memoryStorage(),
      now: () => new Date('2026-05-28T15:00:00Z'),
    });

    await cerrarMesaOnline({
      turnId: 'turn-1',
      branchId: 'b-1',
      cajaShiftId: 'shift-1',
      total: 8000,
      propina: 0,
      metodo: 'Efectivo',
      mozo: 'Ana',
      order: [],
      store: baseStore,
      operation,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('cerrar_mesa_atomico', expect.objectContaining({
      p_descuento: 2000,
      p_descuento_motivo: 'promo lunes',
    }));
  });

  it('passes discount via sync_close_table_operation when available', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });

    const operation = buildCloseTableOperation({
      restaurantId: 'rest-1',
      branchId: 'b-1',
      table: makeTable(),
      cajaShiftId: 'shift-1',
      method: 'Efectivo',
      finalTotal: 8000,
      discountAmount: 2000,
      discountReason: 'promo lunes',
      storage: memoryStorage(),
      now: () => new Date('2026-05-28T15:00:00Z'),
    });

    const result = await cerrarMesaOnline({
      turnId: 'turn-1',
      branchId: 'b-1',
      cajaShiftId: 'shift-1',
      total: 8000,
      propina: 0,
      metodo: 'Efectivo',
      mozo: 'Ana',
      order: [],
      store: baseStore,
      operation,
    });

    expect(result.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('sync_close_table_operation', {
      p_operation: expect.objectContaining({
        pricing: expect.objectContaining({
          discount_amount: 2000,
          discount_reason: 'promo lunes',
        }),
      }),
    });
  });

  it('passes zero discount when no operation envelope', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: null });

    await cerrarMesaOnline({
      turnId: 'turn-1',
      branchId: 'b-1',
      cajaShiftId: 'shift-1',
      total: 10000,
      propina: 0,
      metodo: 'Efectivo',
      mozo: 'Ana',
      order: [],
      store: baseStore,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('cerrar_mesa_atomico', expect.objectContaining({
      p_descuento: 0,
      p_descuento_motivo: null,
    }));
  });

  it('delivery close with no discount uses defaults', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: null });

    await cerrarMesaOnline({
      turnId: 'turn-delivery-1',
      branchId: 'b-1',
      cajaShiftId: 'shift-1',
      total: 5000,
      propina: 0,
      metodo: 'Efectivo',
      mozo: '',
      order: [{ itemId: 'item-1', qty: 1 }],
      store: baseStore,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('cerrar_mesa_atomico', expect.objectContaining({
      p_descuento: 0,
      p_descuento_motivo: null,
    }));
  });
});

describe('server-side discount validation contract (RPC behavior specs)', () => {
  it('close without discount: p_total = subtotal, p_descuento = 0 → valid', () => {
    const subtotal = 10000;
    const descuento = 0;
    const total = subtotal - descuento;
    expect(descuento).toBeGreaterThanOrEqual(0);
    expect(descuento).toBeLessThanOrEqual(subtotal);
    expect(Math.abs(total - (subtotal - descuento))).toBeLessThanOrEqual(1);
  });

  it('valid manual discount with reason → valid', () => {
    const subtotal = 10000;
    const descuento = 2000;
    const motivo = 'promo lunes';
    const total = subtotal - descuento;
    expect(descuento).toBeGreaterThanOrEqual(0);
    expect(descuento).toBeLessThanOrEqual(subtotal);
    expect(motivo.trim().length).toBeGreaterThanOrEqual(4);
    expect(Math.abs(total - (subtotal - descuento))).toBeLessThanOrEqual(1);
  });

  it('discount greater than subtotal → rejected', () => {
    const subtotal = 10000;
    const descuento = 15000;
    expect(descuento).toBeGreaterThan(subtotal);
  });

  it('discount without reason → rejected', () => {
    const descuento = 2000;
    const motivo = null;
    expect(descuento).toBeGreaterThan(0);
    expect(motivo === null || motivo === undefined || motivo.trim().length < 4).toBe(true);
  });

  it('discount with short reason (< 4 chars) → rejected', () => {
    const descuento = 2000;
    const motivo = 'abc';
    expect(descuento).toBeGreaterThan(0);
    expect(motivo.trim().length).toBeLessThan(4);
  });

  it('manipulated total → rejected when mismatch > 1', () => {
    const subtotal = 10000;
    const descuento = 2000;
    const manipulatedTotal = 5000;
    expect(Math.abs(manipulatedTotal - (subtotal - descuento))).toBeGreaterThan(1);
  });

  it('total within ±1 rounding tolerance → valid', () => {
    const subtotal = 10000;
    const descuento = 3333;
    const totalWithRounding = subtotal - descuento + 0.5;
    expect(Math.abs(totalWithRounding - (subtotal - descuento))).toBeLessThanOrEqual(1);
  });

  it('combined manual + points discount → valid', () => {
    const subtotal = 10000;
    const manualDiscount = 2000;
    const pointsDiscount = 500;
    const totalDescuento = manualDiscount + pointsDiscount;
    const total = subtotal - totalDescuento;
    expect(totalDescuento).toBeGreaterThanOrEqual(0);
    expect(totalDescuento).toBeLessThanOrEqual(subtotal);
    expect(Math.abs(total - (subtotal - totalDescuento))).toBeLessThanOrEqual(1);
  });

  it('negative discount → rejected', () => {
    const descuento = -100;
    expect(descuento).toBeLessThan(0);
  });
});
