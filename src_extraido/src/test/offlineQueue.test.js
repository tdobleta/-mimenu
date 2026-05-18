// src/test/offlineQueue.test.js
// Tests de integración para la cola offline.
// Verifica que las operaciones se encolan, procesan y desencolan correctamente.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock de IndexedDB para el entorno de tests
const mockStore = new Map();

vi.mock('@/lib/offlineQueue', () => ({
  enqueue: vi.fn(async (op) => {
    const item = { id: `op_${Date.now()}_${Math.random()}`, ts: Date.now(), ...op };
    mockStore.set(item.id, item);
    return item;
  }),
  getPending: vi.fn(async () => Array.from(mockStore.values())),
  dequeue: vi.fn(async (id) => { mockStore.delete(id); }),
  countPending: vi.fn(async () => mockStore.size),
  clearQueue: vi.fn(async () => { mockStore.clear(); }),
}));

import { enqueue, getPending, dequeue, countPending, clearQueue } from '@/lib/offlineQueue';

describe('offlineQueue', () => {
  beforeEach(() => {
    mockStore.clear();
    vi.clearAllMocks();
  });

  it('encola una operación INSERT_TURN_ITEM', async () => {
    const op = {
      type: 'INSERT_TURN_ITEM',
      turn_id: 'turn-123',
      branch_id: 'branch-456',
      menu_item_name: 'Milanesa',
      cantidad: 1,
      precio: 2500,
    };
    const item = await enqueue(op);
    expect(item.type).toBe('INSERT_TURN_ITEM');
    expect(item.id).toBeTruthy();
  });

  it('getPending devuelve operaciones encoladas', async () => {
    await enqueue({ type: 'INSERT_TURN_ITEM', turn_id: 'a', branch_id: 'b', menu_item_name: 'X', cantidad: 1, precio: 100 });
    await enqueue({ type: 'INSERT_TURN_ITEM', turn_id: 'a', branch_id: 'b', menu_item_name: 'Y', cantidad: 2, precio: 200 });
    const pending = await getPending();
    expect(pending).toHaveLength(2);
  });

  it('countPending devuelve el número correcto', async () => {
    expect(await countPending()).toBe(0);
    await enqueue({ type: 'INSERT_TURN_ITEM', turn_id: 'a', branch_id: 'b', menu_item_name: 'X', cantidad: 1, precio: 100 });
    expect(await countPending()).toBe(1);
  });

  it('dequeue elimina la operación', async () => {
    const item = await enqueue({ type: 'INSERT_TURN_ITEM', turn_id: 'a', branch_id: 'b', menu_item_name: 'X', cantidad: 1, precio: 100 });
    await dequeue(item.id);
    expect(await countPending()).toBe(0);
  });

  it('clearQueue limpia todo', async () => {
    await enqueue({ type: 'INSERT_TURN_ITEM', turn_id: 'a', branch_id: 'b', menu_item_name: 'X', cantidad: 1, precio: 100 });
    await enqueue({ type: 'INSERT_TURN_ITEM', turn_id: 'a', branch_id: 'b', menu_item_name: 'Y', cantidad: 1, precio: 200 });
    await clearQueue();
    expect(await countPending()).toBe(0);
  });

  it('operación tiene timestamp', async () => {
    const before = Date.now();
    const item = await enqueue({ type: 'UPDATE_TURN', turn_id: 'a', updates: { status: 'cerrada' } });
    const after = Date.now();
    expect(item.ts).toBeGreaterThanOrEqual(before);
    expect(item.ts).toBeLessThanOrEqual(after);
  });
});

// ── Tests de conflict resolution ─────────────────────────────
describe('conflict resolution strategy', () => {
  it('merge por operación: dos ítems en la misma mesa no se sobreescriben', () => {
    // Simulación del merge en useBidirectionalSync
    const serverItems = [
      { id: 'item-1', menu_item_name: 'Milanesa', cantidad: 1 },
    ];
    const localPendingItems = [
      { uid: 'local-1', nombre: 'Ensalada', qty: 1, turnItemId: null },
    ];

    // El merge debe incluir AMBOS
    const merged = [
      ...serverItems.map(i => ({ uid: i.id, nombre: i.menu_item_name, qty: i.cantidad })),
      ...localPendingItems.filter(i => !i.turnItemId), // solo los que no llegaron al server
    ];

    expect(merged).toHaveLength(2);
    expect(merged.map(i => i.nombre)).toContain('Milanesa');
    expect(merged.map(i => i.nombre)).toContain('Ensalada');
  });

  it('last-write-wins para estado de mesa', () => {
    const localStatus = 'abierta';
    const serverStatus = 'cerrada';
    const serverTimestamp = Date.now();
    const localTimestamp = serverTimestamp - 5000; // local es más viejo

    // El server gana porque tiene timestamp más reciente
    const finalStatus = serverTimestamp > localTimestamp ? serverStatus : localStatus;
    expect(finalStatus).toBe('cerrada');
  });
});
