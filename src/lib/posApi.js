import { supabase } from '@/api/supabaseClient';
import { enqueue } from '@/lib/offlineQueue';

// ── Turn (mesa) ───────────────────────────────────────────────────────────────
// Apertura y cierre se hacen vía base44.entities.Turn y cerrar_mesa_atomico RPC.

export async function dbLoadActiveTurns(branchId) {
  const { data, error } = await supabase
    .from('turns')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', 'abierta');
  if (error) throw error;
  return data ?? [];
}

export async function dbLoadClosedTurns({ branchId, since } = {}) {
  let query = supabase
    .from('turns')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', 'cerrada')
    .order('closed_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  const all = data ?? [];
  if (since) return all.filter(t => t.closed_at >= since);
  return all;
}

// ── TurnItem (ítems de la comanda) ────────────────────────────────────────────

export async function dbAddTurnItem({ turnId, branchId, menuItemId, nombre, precio, qty, notas, clientUid }) {
  const row = {
    turn_id: turnId,
    branch_id: branchId,
    menu_item_id: menuItemId || null,
    menu_item_name: nombre,
    cantidad: qty,
    precio: precio || 0,
    notas: notas || '',
  };
  // Idempotencia: si el cliente generó un uid estable, pasarlo como client_uid.
  // En un retry donde la respuesta se perdió, la DB devolverá el registro ya insertado
  // en lugar de crear un duplicado (ON CONFLICT client_uid DO NOTHING requiere la migración
  // 20260524000004_turn_items_idempotency.sql aplicada en Supabase).
  if (clientUid) row.client_uid = clientUid;

  const { data, error } = await supabase
    .from('turn_items')
    .insert(row)
    .select()
    .single();

  // 23505 = unique_violation en client_uid → ítem ya existe (retry después de drop de red)
  // En este caso no tenemos el ID de la fila para retornar, pero el caller puede ignorar
  // el turnItemId si ya tiene el ítem en el store local.
  if (error && error.code === '23505') return null;
  if (error) throw error;
  return data;
}

export async function dbSaveNota(turnItemId, notas) {
  // Si no hay conexión, encolar directamente sin intentar DB
  if (!navigator.onLine) {
    await enqueue({ type: 'NOTA_SAVE', turnItemId, notas: notas || '' }).catch(() => {});
    return;
  }
  const { error } = await supabase
    .from('turn_items')
    .update({ notas: notas || '' })
    .eq('id', turnItemId);
  if (error) throw error;
}

export async function dbUpdateTurnItem(turnItemId, cantidad) {
  // Si no hay conexión, encolar directamente
  if (!navigator.onLine) {
    if (cantidad <= 0) {
      await enqueue({ type: 'DELETE_TURN_ITEM', turnItemId }).catch(() => {});
      return true;
    }
    await enqueue({ type: 'UPDATE_TURN_ITEM', turnItemId, updates: { cantidad } }).catch(() => {});
    return { cantidad };
  }

  if (cantidad <= 0) {
    const { error } = await supabase.from('turn_items').delete().eq('id', turnItemId);
    if (error) throw error;
    return true;
  }
  const { data, error } = await supabase
    .from('turn_items')
    .update({ cantidad })
    .eq('id', turnItemId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function dbLoadTurnItems(turnId) {
  const { data, error } = await supabase
    .from('turn_items')
    .select('*')
    .eq('turn_id', turnId);
  if (error) throw error;
  return data ?? [];
}
