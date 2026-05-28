const DEVICE_ID_KEY = 'mimenu_device_id';
const OPERATION_VERSION = 1;

function randomId(prefix) {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  const rand = Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function getOrCreateDeviceId(storage = globalThis.localStorage) {
  try {
    const existing = storage?.getItem?.(DEVICE_ID_KEY);
    if (existing) return existing;
    const next = randomId('dev');
    storage?.setItem?.(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return randomId('dev');
  }
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeItems(order = []) {
  return (order || []).map((item) => ({
    line_id: item.uid || item.turnItemId || item.itemId || item.id || null,
    turn_item_id: item.turnItemId || null,
    menu_item_id: item.itemId && !String(item.itemId).startsWith('libre_') ? item.itemId : null,
    name: item.nombre || item.name || '',
    qty: Number(item.qty || item.cantidad || 1),
    unit_price: Number(item.precio || item.price || 0),
    note: item.nota || item.notas || '',
    modifiers: item.modificadores || item.modifiers || [],
    is_free_item: Boolean(item.libre || String(item.itemId || '').startsWith('libre_')),
  }));
}

function normalizePayments(pagos, method, totalWithTip) {
  if (Array.isArray(pagos) && pagos.length > 0) {
    return pagos.map((p) => ({
      method: p.metodo || p.method || method,
      amount: Number(p.monto ?? p.amount ?? 0),
      provider: p.provider || 'manual',
      provider_reference: p.provider_reference || p.providerReference || null,
    }));
  }
  return [{ method, amount: Number(totalWithTip || 0), provider: 'manual', provider_reference: null }];
}

function legacyPaymentsFromOperation(operation) {
  const payments = operation?.payment?.payments_detail;
  if (!Array.isArray(payments) || payments.length === 0) return null;
  return payments.map((payment) => ({
    metodo: payment.method,
    monto: Number(payment.amount || 0),
    provider: payment.provider || 'manual',
    provider_reference: payment.provider_reference || null,
  }));
}

export function buildCloseTableOperation({
  restaurantId,
  branchId,
  table,
  cajaShiftId = null,
  method,
  finalTotal,
  discountAmount = 0,
  discountReason = null,
  tipAmount = 0,
  pagos = null,
  puntosCanjeados = 0,
  clienteId = null,
  user = null,
  userRole = null,
  activeStaff = null,
  deviceId = null,
  appVersion = null,
  now = () => new Date(),
  storage,
} = {}) {
  if (!branchId) throw new Error('buildCloseTableOperation: branchId requerido');
  if (!table) throw new Error('buildCloseTableOperation: table requerido');
  if (!method) throw new Error('buildCloseTableOperation: method requerido');

  const createdAt = now();
  const createdAtIso = createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();
  const subtotal = (table.order || []).reduce(
    (sum, item) => sum + Number(item.precio || 0) * Number(item.qty || 1),
    0
  );
  const totalCharged = Number(finalTotal || 0) + Number(tipAmount || 0);
  const stableDeviceId = deviceId || getOrCreateDeviceId(storage);

  return {
    operation_id: randomId('op_close_table'),
    operation_type: 'CLOSE_TABLE',
    operation_version: OPERATION_VERSION,

    tenant: {
      restaurant_id: restaurantId || null,
      branch_id: branchId,
    },

    device: {
      device_id: stableDeviceId,
      app_version: appVersion || null,
    },

    actor: {
      user_id: user?.id || null,
      staff_pin_id: activeStaff?.id || null,
      staff_name: activeStaff?.nombre || table.mozo || user?.email || null,
      role: userRole || activeStaff?.rol || null,
    },

    table: {
      local_table_id: table.id,
      mesa_num: table.num,
      turn_id: table.turnId || null,
      opened_at: toIso(table.openedAt),
      mozo: table.mozo || '',
    },

    caja: {
      caja_shift_id: cajaShiftId || null,
    },

    items_snapshot: normalizeItems(table.order || []),

    pricing: {
      subtotal,
      discount_amount: Number(discountAmount || 0),
      discount_reason: discountReason || null,
      tip_amount: Number(tipAmount || 0),
      total_charged: totalCharged,
    },

    payment: {
      method,
      payments_detail: normalizePayments(pagos, method, totalCharged),
      offline_payment: true,
      provider_status: method?.includes('MercadoPago') ? 'pending_online' : 'not_required',
    },

    loyalty: {
      customer_id: clienteId || null,
      puntos_canjeados: Number(puntosCanjeados || 0),
      conversion_rate: 1, // 1 punto = $1
    },

    stock_intent: {
      mode: 'derive_from_current_recipes',
      recipe_snapshot: null,
    },

    fiscal_intent: {
      required: false,
      status: 'not_requested',
      document_type: null,
      customer_snapshot: null,
    },

    timestamps: {
      created_at_local: createdAtIso,
      business_date: createdAtIso.slice(0, 10),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires',
    },

    sync: {
      status: 'pending_sync',
      attempts: 0,
      last_error: null,
    },
  };
}

export function buildCloseTableSyncPayload(queueOperation = {}) {
  const operation = queueOperation.operation?.operation_type === 'CLOSE_TABLE'
    ? queueOperation.operation
    : null;
  const pricing = operation?.pricing || {};
  const tipAmount = Number(queueOperation.propina ?? pricing.tip_amount ?? 0);
  const total = queueOperation.total ?? (
    operation ? Number(pricing.total_charged || 0) - tipAmount : undefined
  );

  return {
    operationId: operation?.operation_id || queueOperation.operation_id || queueOperation.id || null,
    turnId: queueOperation.turnId || queueOperation.turn_id || operation?.table?.turn_id || null,
    cajaShiftId: queueOperation.cajaShiftId || queueOperation.caja_shift_id || operation?.caja?.caja_shift_id || null,
    pagosDetalle: queueOperation.pagosDetalle || queueOperation.pagos || legacyPaymentsFromOperation(operation),
    branchId: queueOperation.branchId || queueOperation.branch_id || operation?.tenant?.branch_id || null,
    tableId: queueOperation.tableId || queueOperation.table_id || operation?.table?.local_table_id || null,
    total,
    propina: tipAmount,
    metodo: queueOperation.metodo || operation?.payment?.method || null,
    mozo: queueOperation.mozo || operation?.table?.mozo || operation?.actor?.staff_name || '',
  };
}
