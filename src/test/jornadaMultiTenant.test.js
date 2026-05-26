import { describe, expect, it } from 'vitest';
import { buildCloseTableOperation, buildCloseTableSyncPayload } from '@/lib/operations/closeTableOperation';

function memoryStorage(name) {
  const data = new Map();
  return {
    getItem: (key) => data.get(`${name}:${key}`) || null,
    setItem: (key, value) => data.set(`${name}:${key}`, value),
  };
}

function makeCompany(slug) {
  const restaurantId = `rest-${slug}`;
  const branchId = `branch-${slug}-principal`;
  const admin = { id: `owner-${slug}`, email: `dueno-${slug}@mimenu.test`, role: 'Dueno' };
  const employees = Array.from({ length: 12 }, (_, index) => {
    const n = index + 1;
    const rol = n <= 2 ? 'Encargado' : n <= 4 ? 'Cocinero' : 'Mozo';
    return {
      id: `staff-${slug}-${n}`,
      user_id: `user-${slug}-${n}`,
      restaurant_id: restaurantId,
      branch_id: branchId,
      nombre: `${slug.toUpperCase()} Staff ${n}`,
      email: `staff-${n}-${slug}@mimenu.test`,
      rol,
      pin_hash: `hash-${slug}-${n}`,
      activo: true,
    };
  });

  const menu = [
    { id: `menu-${slug}-burger`, nombre: 'Burger completa', precio: 6500 },
    { id: `menu-${slug}-pizza`, nombre: 'Pizza muzza', precio: 7200 },
    { id: `menu-${slug}-gaseosa`, nombre: 'Gaseosa', precio: 1800 },
  ];

  const recipes = {
    [menu[0].id]: [{ stockItemId: `stock-${slug}-carne`, cantidad: 0.18 }, { stockItemId: `stock-${slug}-pan`, cantidad: 1 }],
    [menu[1].id]: [{ stockItemId: `stock-${slug}-queso`, cantidad: 0.22 }, { stockItemId: `stock-${slug}-masa`, cantidad: 1 }],
    [menu[2].id]: [{ stockItemId: `stock-${slug}-gaseosa`, cantidad: 1 }],
  };

  const stock = {
    [`stock-${slug}-carne`]: 35,
    [`stock-${slug}-pan`]: 220,
    [`stock-${slug}-queso`]: 28,
    [`stock-${slug}-masa`]: 180,
    [`stock-${slug}-gaseosa`]: 300,
  };

  return { slug, restaurantId, branchId, admin, employees, menu, recipes, stock };
}

function createJornadaSimulator(companies) {
  const state = {
    restaurants: new Map(companies.map((c) => [c.restaurantId, c])),
    shifts: new Map(),
    turns: new Map(),
    kitchenEvents: [],
    operations: new Map(),
    closedTurns: [],
    stock: new Map(companies.map((c) => [c.restaurantId, { ...c.stock }])),
  };

  function userRestaurantIds(user) {
    const ids = [];
    for (const company of companies) {
      if (company.admin.id === user.id) ids.push(company.restaurantId);
      if (company.employees.some((e) => e.user_id === user.id)) ids.push(company.restaurantId);
    }
    return ids;
  }

  function assertCanAccess(user, restaurantId) {
    if (!userRestaurantIds(user).includes(restaurantId)) throw new Error(`forbidden:${user.id}:${restaurantId}`);
  }

  function openShift(company, user) {
    assertCanAccess(user, company.restaurantId);
    const shift = {
      id: `shift-${company.slug}-almuerzo`,
      restaurant_id: company.restaurantId,
      branch_id: company.branchId,
      status: 'abierto',
      opened_by: user.id,
      total_facturado_turno: 0,
    };
    state.shifts.set(shift.id, shift);
    return shift;
  }

  function openTable(company, tableNum, mozo, order) {
    const turn = {
      id: `turn-${company.slug}-${tableNum}`,
      restaurant_id: company.restaurantId,
      branch_id: company.branchId,
      mesa_num: tableNum,
      status: 'abierta',
      opened_at: `2026-05-26T12:${String(tableNum).padStart(2, '0')}:00.000Z`,
      mozo: mozo.nombre,
      order: order.map((line, index) => ({
        uid: `line-${company.slug}-${tableNum}-${index}`,
        itemId: line.item.id,
        nombre: line.item.nombre,
        precio: line.item.precio,
        qty: line.qty,
        nota: line.nota || '',
      })),
    };
    state.turns.set(turn.id, turn);
    return turn;
  }

  function sendToKitchen(turn) {
    turn.enviado_cocina = true;
    turn.cocina_estado = 'pendiente';
    state.kitchenEvents.push({ type: 'NEW_COMANDA', branch_id: turn.branch_id, turn_id: turn.id });
  }

  function markKitchenReady(turn) {
    turn.cocina_estado = 'lista';
    turn.comanda_lista = true;
    state.kitchenEvents.push({ type: 'READY', branch_id: turn.branch_id, turn_id: turn.id });
  }

  function closeTable(company, shift, turn, user, activeStaff, { method, discount = 0, tip = 0, offline = false }) {
    const subtotal = turn.order.reduce((sum, item) => sum + item.precio * item.qty, 0);
    const finalTotal = subtotal - discount;
    const operation = buildCloseTableOperation({
      restaurantId: company.restaurantId,
      branchId: company.branchId,
      table: {
        id: turn.mesa_num,
        num: turn.mesa_num,
        turnId: turn.id,
        openedAt: turn.opened_at,
        mozo: turn.mozo,
        order: turn.order,
      },
      cajaShiftId: shift.id,
      method,
      finalTotal,
      discountAmount: discount,
      tipAmount: tip,
      pagos: [{ metodo: method, monto: finalTotal + tip, provider: offline ? 'offline_manual' : 'manual' }],
      user,
      userRole: user.role,
      activeStaff,
      storage: memoryStorage(`${company.slug}-${turn.id}`),
      now: () => new Date(`2026-05-26T14:${String(turn.mesa_num).padStart(2, '0')}:00.000Z`),
    });

    return { operation, payload: buildCloseTableSyncPayload({ type: 'CLOSE_TABLE', operation }) };
  }

  function applyCloseOperation(operation) {
    if (state.operations.has(operation.operation_id)) return { idempotent: true };
    const restaurantId = operation.tenant.restaurant_id;
    const company = state.restaurants.get(restaurantId);
    const turn = state.turns.get(operation.table.turn_id);
    const shift = state.shifts.get(operation.caja.caja_shift_id);
    if (!company || !turn || !shift) throw new Error('invalid_operation');
    if (turn.restaurant_id !== restaurantId || shift.restaurant_id !== restaurantId) throw new Error('tenant_mismatch');

    turn.status = 'cerrada';
    turn.closed_at = operation.timestamps.created_at_local;
    turn.total_facturado = operation.pricing.total_charged - operation.pricing.tip_amount;
    turn.propina = operation.pricing.tip_amount;
    turn.metodo_pago = operation.payment.method;
    shift.total_facturado_turno += turn.total_facturado;

    const stock = state.stock.get(restaurantId);
    for (const line of operation.items_snapshot) {
      const recipe = company.recipes[line.menu_item_id] || [];
      for (const recipeLine of recipe) {
        stock[recipeLine.stockItemId] = Number((stock[recipeLine.stockItemId] - recipeLine.cantidad * line.qty).toFixed(4));
      }
    }

    state.operations.set(operation.operation_id, operation);
    state.closedTurns.push(turn);
    return { idempotent: false };
  }

  function visibleClosedTurns(user) {
    const allowed = new Set(userRestaurantIds(user));
    return state.closedTurns.filter((turn) => allowed.has(turn.restaurant_id));
  }

  return {
    state,
    openShift,
    openTable,
    sendToKitchen,
    markKitchenReady,
    closeTable,
    applyCloseOperation,
    visibleClosedTurns,
    userRestaurantIds,
  };
}

describe('jornada multi-tenant realista', () => {
  it('simula dos empresas con admins, 12 empleados cada una, cocina, stock, cobros online/offline y aislamiento', () => {
    const empresaA = makeCompany('a');
    const empresaB = makeCompany('b');
    const sim = createJornadaSimulator([empresaA, empresaB]);

    expect(empresaA.employees).toHaveLength(12);
    expect(empresaB.employees).toHaveLength(12);

    const shiftA = sim.openShift(empresaA, empresaA.admin);
    const shiftB = sim.openShift(empresaB, empresaB.admin);
    const mozosA = empresaA.employees.filter((e) => e.rol === 'Mozo');
    const mozosB = empresaB.employees.filter((e) => e.rol === 'Mozo');

    const turnsA = Array.from({ length: 14 }, (_, index) => {
      const menu = empresaA.menu;
      return sim.openTable(empresaA, index + 1, mozosA[index % mozosA.length], [
        { item: menu[index % menu.length], qty: 1 + (index % 3), nota: index % 2 ? 'sin cebolla' : '' },
        { item: menu[2], qty: 2 },
      ]);
    });

    const turnsB = Array.from({ length: 16 }, (_, index) => {
      const menu = empresaB.menu;
      return sim.openTable(empresaB, index + 1, mozosB[index % mozosB.length], [
        { item: menu[(index + 1) % menu.length], qty: 1 + (index % 2), nota: index % 3 ? '' : 'sale primero' },
        { item: menu[2], qty: 1 },
      ]);
    });

    [...turnsA, ...turnsB].forEach((turn) => {
      sim.sendToKitchen(turn);
      sim.markKitchenReady(turn);
    });

    const closeOpsA = turnsA.map((turn, index) => sim.closeTable(
      empresaA,
      shiftA,
      turn,
      empresaA.admin,
      mozosA[index % mozosA.length],
      { method: index % 4 === 0 ? 'Transferencia' : 'Efectivo', tip: 500, offline: index % 5 === 0 }
    ));

    const closeOpsB = turnsB.map((turn, index) => sim.closeTable(
      empresaB,
      shiftB,
      turn,
      empresaB.admin,
      mozosB[index % mozosB.length],
      { method: index % 3 === 0 ? 'Tarjeta' : 'MercadoPago', discount: index % 4 === 0 ? 300 : 0, tip: 300, offline: index % 6 === 0 }
    ));

    [...closeOpsA, ...closeOpsB].forEach(({ operation, payload }) => {
      expect(payload.turnId).toBe(operation.table.turn_id);
      expect(payload.branchId).toBe(operation.tenant.branch_id);
      expect(sim.applyCloseOperation(operation).idempotent).toBe(false);
    });

    // Reintento offline: misma operacion no debe duplicar caja, ventas ni stock.
    const totalBeforeRetry = shiftA.total_facturado_turno;
    const stockBeforeRetry = { ...sim.state.stock.get(empresaA.restaurantId) };
    expect(sim.applyCloseOperation(closeOpsA[0].operation).idempotent).toBe(true);
    expect(shiftA.total_facturado_turno).toBe(totalBeforeRetry);
    expect(sim.state.stock.get(empresaA.restaurantId)).toEqual(stockBeforeRetry);

    expect(sim.state.closedTurns).toHaveLength(30);
    expect(sim.state.kitchenEvents).toHaveLength(60);
    expect(turnsA.every((turn) => turn.status === 'cerrada' && turn.comanda_lista === true)).toBe(true);
    expect(turnsB.every((turn) => turn.status === 'cerrada' && turn.comanda_lista === true)).toBe(true);

    const visibleA = sim.visibleClosedTurns(empresaA.admin);
    const visibleB = sim.visibleClosedTurns(empresaB.admin);
    expect(visibleA).toHaveLength(14);
    expect(visibleB).toHaveLength(16);
    expect(visibleA.every((turn) => turn.restaurant_id === empresaA.restaurantId)).toBe(true);
    expect(visibleB.every((turn) => turn.restaurant_id === empresaB.restaurantId)).toBe(true);

    const attackerSameEmail = { id: 'attacker-not-member', email: empresaA.employees[0].email, role: 'user' };
    expect(sim.userRestaurantIds(attackerSameEmail)).toEqual([]);
    expect(sim.visibleClosedTurns(attackerSameEmail)).toEqual([]);

    const stockA = sim.state.stock.get(empresaA.restaurantId);
    const stockB = sim.state.stock.get(empresaB.restaurantId);
    expect(stockA['stock-a-gaseosa']).toBeLessThan(300);
    expect(stockB['stock-b-gaseosa']).toBeLessThan(300);
    expect(stockA['stock-a-gaseosa']).not.toBe(stockB['stock-b-gaseosa']);
    expect(shiftA.total_facturado_turno).toBeGreaterThan(0);
    expect(shiftB.total_facturado_turno).toBeGreaterThan(shiftA.total_facturado_turno * 0.5);
  });
});
