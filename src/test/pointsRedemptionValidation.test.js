// ── Test: Server-side points redemption validation ──────────────────────
// Contract tests: these validate the expected params, data flow, and
// frontend guard logic. The actual SQL validation runs in Postgres.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase mock ────────────────────────────────────────────────────────
const mockRpc = vi.fn().mockResolvedValue({ data: {}, error: null });
const mockInsert = vi.fn().mockReturnValue({ error: null });
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from: (...args) => mockFrom(...args),
  },
}));

import { addCustomerVisit } from '@/lib/crmApi';
import { buildCloseTableOperation } from '@/lib/operations/closeTableOperation';

// ── localStorage stub ────────────────────────────────────────────────────
const localStorageStub = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub, writable: true });

describe('Points redemption — cerrar_mesa_atomico param contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: {}, error: null });
  });

  it('valid redemption: RPC receives p_puntos_canjeados and p_cliente_id via operation payload', () => {
    const op = buildCloseTableOperation({
      restaurantId: 'r1',
      branchId: 'b1',
      table: { id: 't1', num: 1, turnId: 'turn-1', order: [{ nombre: 'Cafe', precio: 500, qty: 1 }] },
      method: 'Efectivo',
      finalTotal: 300,
      discountAmount: 200,
      discountReason: 'puntos: 200',
      puntosCanjeados: 200,
      clienteId: 'customer-1',
    });

    expect(op.loyalty).toEqual({
      customer_id: 'customer-1',
      puntos_canjeados: 200,
      conversion_rate: 1,
    });
    // pricing still holds combined discount
    expect(op.pricing.discount_amount).toBe(200);
  });

  it('zero points: loyalty section has null customer and zero points', () => {
    const op = buildCloseTableOperation({
      restaurantId: 'r1',
      branchId: 'b1',
      table: { id: 't1', num: 1, turnId: 'turn-1', order: [] },
      method: 'Efectivo',
      finalTotal: 500,
    });

    expect(op.loyalty).toEqual({
      customer_id: null,
      puntos_canjeados: 0,
      conversion_rate: 1,
    });
  });

  it('no customer + zero points: builds valid operation without loyalty data', () => {
    const op = buildCloseTableOperation({
      restaurantId: 'r1',
      branchId: 'b1',
      table: { id: 't1', num: 1, turnId: 'turn-1', order: [{ nombre: 'Agua', precio: 200, qty: 1 }] },
      method: 'Tarjeta',
      finalTotal: 200,
      puntosCanjeados: 0,
      clienteId: null,
    });

    expect(op.loyalty.customer_id).toBeNull();
    expect(op.loyalty.puntos_canjeados).toBe(0);
  });
});

describe('Points redemption — addCustomerVisit skipRedemptionDeduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: {}, error: null });
    mockFrom.mockReturnValue({ insert: vi.fn().mockReturnValue({ error: null }) });
  });

  it('records puntos_canjeados in customer_visits but skips decrement when skipRedemptionDeduction is true', async () => {
    await addCustomerVisit('r1', 'c1', 'turn-1', 5000, 300, { skipRedemptionDeduction: true });

    // customer_visits insert should have been called with puntos_canjeados: 300
    const fromCalls = mockFrom.mock.calls;
    expect(fromCalls.some(c => c[0] === 'customer_visits')).toBe(true);

    // increment_customer_points should be called (earning is not skipped)
    const rpcCalls = mockRpc.mock.calls;
    const incrementCalls = rpcCalls.filter(c => c[0] === 'increment_customer_points');
    expect(incrementCalls.length).toBe(1);

    // decrement_customer_points should NOT be called
    const decrementCalls = rpcCalls.filter(c => c[0] === 'decrement_customer_points');
    expect(decrementCalls.length).toBe(0);
  });

  it('calls decrement_customer_points when skipRedemptionDeduction is false/absent', async () => {
    await addCustomerVisit('r1', 'c1', 'turn-1', 5000, 300);

    const rpcCalls = mockRpc.mock.calls;
    const decrementCalls = rpcCalls.filter(c => c[0] === 'decrement_customer_points');
    expect(decrementCalls.length).toBe(1);
    expect(decrementCalls[0][1]).toEqual({ p_id: 'c1', p_pts: 300 });
  });

  it('does not call decrement when puntosCanjeados is 0 regardless of flag', async () => {
    await addCustomerVisit('r1', 'c1', 'turn-1', 5000, 0, { skipRedemptionDeduction: true });

    const rpcCalls = mockRpc.mock.calls;
    const decrementCalls = rpcCalls.filter(c => c[0] === 'decrement_customer_points');
    expect(decrementCalls.length).toBe(0);
  });
});

describe('Points redemption — server-side validation expectations (contract)', () => {
  // These tests document what the SQL migration enforces.
  // They verify the frontend sends correct params so the server can validate.

  it('points > balance: server would reject — frontend sends the params for server to validate', () => {
    const op = buildCloseTableOperation({
      restaurantId: 'r1',
      branchId: 'b1',
      table: { id: 't1', num: 1, turnId: 'turn-1', order: [{ nombre: 'Cafe', precio: 1000, qty: 1 }] },
      method: 'Efectivo',
      finalTotal: 400,
      discountAmount: 600,
      discountReason: 'puntos: 600',
      puntosCanjeados: 600,
      clienteId: 'customer-1',
    });

    // The operation is built — server validates balance
    expect(op.loyalty.puntos_canjeados).toBe(600);
    expect(op.loyalty.customer_id).toBe('customer-1');
  });

  it('negative points: frontend could send — server must reject p_puntos_canjeados < 0', () => {
    const op = buildCloseTableOperation({
      restaurantId: 'r1',
      branchId: 'b1',
      table: { id: 't1', num: 1, turnId: 'turn-1', order: [] },
      method: 'Efectivo',
      finalTotal: 500,
      puntosCanjeados: -100,
      clienteId: 'customer-1',
    });

    // Frontend doesn't block negative — server RAISE EXCEPTION enforces it
    // The operation is built with the negative value
    expect(op.loyalty.puntos_canjeados).toBe(-100);
  });

  it('points > 0 without clienteId: server must reject — frontend sends null customer', () => {
    const op = buildCloseTableOperation({
      restaurantId: 'r1',
      branchId: 'b1',
      table: { id: 't1', num: 1, turnId: 'turn-1', order: [{ nombre: 'Cafe', precio: 500, qty: 1 }] },
      method: 'Efectivo',
      finalTotal: 300,
      discountAmount: 200,
      discountReason: 'puntos: 200',
      puntosCanjeados: 200,
      clienteId: null,
    });

    // Server will reject: cliente_id obligatorio cuando se canjean puntos
    expect(op.loyalty.puntos_canjeados).toBe(200);
    expect(op.loyalty.customer_id).toBeNull();
  });

  it('points > total discount: server must reject — frontend sends for server to validate', () => {
    const op = buildCloseTableOperation({
      restaurantId: 'r1',
      branchId: 'b1',
      table: { id: 't1', num: 1, turnId: 'turn-1', order: [{ nombre: 'Cafe', precio: 1000, qty: 1 }] },
      method: 'Efectivo',
      finalTotal: 900,
      discountAmount: 100,
      discountReason: 'manual discount',
      puntosCanjeados: 500,
      clienteId: 'customer-1',
    });

    // Server will reject: puntos canjeados (500) exceden descuento total (100)
    expect(op.loyalty.puntos_canjeados).toBe(500);
    expect(op.pricing.discount_amount).toBe(100);
  });
});

describe('Points redemption — legacy RPC path defaults', () => {
  it('operation without loyalty section defaults to 0/null safely', () => {
    // Simulate a legacy operation payload (pre-points)
    const legacyOperation = {
      pricing: { discount_amount: 100, discount_reason: 'promo' },
      // no loyalty section
    };

    const puntosCanjeados = legacyOperation?.loyalty?.puntos_canjeados || 0;
    const clienteId = legacyOperation?.loyalty?.customer_id || null;

    expect(puntosCanjeados).toBe(0);
    expect(clienteId).toBeNull();
  });

  it('operation with loyalty section extracts values correctly', () => {
    const operation = {
      pricing: { discount_amount: 500, discount_reason: 'puntos: 300' },
      loyalty: { customer_id: 'c-abc', puntos_canjeados: 300, conversion_rate: 1 },
    };

    const puntosCanjeados = operation?.loyalty?.puntos_canjeados || 0;
    const clienteId = operation?.loyalty?.customer_id || null;

    expect(puntosCanjeados).toBe(300);
    expect(clienteId).toBe('c-abc');
  });
});
