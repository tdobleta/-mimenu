import { supabase } from '@/api/supabaseClient';

function operationId(shiftId) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `caja_shift_close_${shiftId}_${suffix}`;
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
    operation_id: explicitOperationId || operationId(shiftId),
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

export async function closeCajaShiftOperation(input) {
  const operation = buildCloseShiftOperation(input);
  const { data, error } = await supabase.rpc('close_caja_shift_operation', {
    p_operation: operation,
  });
  if (error) throw error;
  return data || { ok: true, operation_id: operation.operation_id };
}

export function createCloseShiftOperationId(shiftId) {
  return operationId(shiftId || 'unknown');
}
