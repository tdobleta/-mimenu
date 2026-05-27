import { supabase } from '@/api/supabaseClient';

function operationId(prefix, entityId) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${entityId}_${suffix}`;
}

function buildOpenShiftOperation({
  operationId: explicitOperationId,
  restaurantId,
  branchId,
  tipoTurno,
  fondoInicial,
  abiertoAt,
  user,
  role,
  activeStaff,
}) {
  return {
    operation_id: explicitOperationId || operationId('caja_shift_open', branchId || 'unknown'),
    operation_type: 'OPEN_CAJA_SHIFT',
    operation_version: 1,
    tenant: {
      restaurant_id: restaurantId || null,
      branch_id: branchId || null,
    },
    actor: {
      user_id: user?.id || null,
      email: user?.email || '',
      role: role || '',
      staff_pin_id: activeStaff?.id || null,
      staff_name: activeStaff?.nombre || null,
    },
    caja: {
      tipo_turno: tipoTurno || 'general',
      fondo_inicial: fondoInicial || 0,
      abierto_at: abiertoAt || new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
  };
}

function buildCloseShiftOperation({
  operationId: explicitOperationId,
  restaurantId,
  branchId,
  shiftId,
  arqueoEfectivo,
  motivoDiferencia,
  nombreTurno,
  user,
  role,
  activeStaff,
}) {
  return {
    operation_id: explicitOperationId || operationId('caja_shift_close', shiftId || 'unknown'),
    operation_type: 'CLOSE_CAJA_SHIFT',
    operation_version: 1,
    tenant: {
      restaurant_id: restaurantId || null,
      branch_id: branchId || null,
    },
    actor: {
      user_id: user?.id || null,
      email: user?.email || '',
      role: role || '',
      staff_pin_id: activeStaff?.id || null,
      staff_name: activeStaff?.nombre || null,
    },
    caja: {
      caja_shift_id: shiftId,
      arqueo_efectivo: arqueoEfectivo || 0,
      motivo_diferencia: motivoDiferencia || '',
      nombre_turno: nombreTurno || '',
    },
    created_at: new Date().toISOString(),
  };
}

export async function openCajaShiftOperation(input) {
  const operation = buildOpenShiftOperation(input);
  const { data, error } = await supabase.rpc('open_caja_shift_operation', {
    p_operation: operation,
  });
  if (error) throw error;
  return data || { ok: true, operation_id: operation.operation_id };
}

export async function closeCajaShiftOperation(input) {
  const operation = buildCloseShiftOperation(input);
  const { data, error } = await supabase.rpc('close_caja_shift_operation', {
    p_operation: operation,
  });
  if (error) throw error;
  return data || { ok: true, operation_id: operation.operation_id };
}

export function createCloseShiftOperationId(shiftId) {
  return operationId('caja_shift_close', shiftId || 'unknown');
}

export function createOpenShiftOperationId(branchId) {
  return operationId('caja_shift_open', branchId || 'unknown');
}
