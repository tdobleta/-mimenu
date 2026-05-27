import { supabase } from '@/api/supabaseClient';

function operationId(type, scopeId) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `sales_${type.toLowerCase()}_${scopeId}_${suffix}`;
}

async function applySalesOperation(operation) {
  const { data, error } = await supabase.rpc('apply_sales_operation', {
    p_operation: operation,
  });
  if (error) throw error;
  return data || { ok: true };
}

function baseOperation({ type, restaurantId, branchId, reason, user, role }) {
  return {
    operation_id: operationId(type, branchId || restaurantId || 'global'),
    operation_type: type,
    operation_version: 1,
    tenant: {
      restaurant_id: restaurantId,
      branch_id: branchId,
    },
    actor: {
      user_id: user?.id || null,
      email: user?.email || '',
      role: role || '',
    },
    reason,
    created_at: new Date().toISOString(),
  };
}

export function voidSale({ restaurantId, branchId, turnId, reason, user, role }) {
  return applySalesOperation({
    ...baseOperation({ type: 'VOID_SALE', restaurantId, branchId, reason, user, role }),
    sale: { turn_id: turnId, reason },
  });
}

export function archiveSale({ restaurantId, branchId, turnId, reason, user, role }) {
  return applySalesOperation({
    ...baseOperation({ type: 'ARCHIVE_SALE', restaurantId, branchId, reason, user, role }),
    sale: { turn_id: turnId, reason },
  });
}

export function resetAnalytics({ restaurantId, branchId, reason, user, role }) {
  return applySalesOperation({
    ...baseOperation({ type: 'RESET_ANALYTICS', restaurantId, branchId, reason, user, role }),
    sale: { reason },
  });
}
