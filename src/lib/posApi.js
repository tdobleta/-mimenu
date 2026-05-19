import { supabase } from '@/api/supabaseClient';

// ── Turn (mesa) ───────────────────────────────────────────────────────────────

export async function dbOpenTable({ branchId, mesaNum, mozo }) {
  const { data, error } = await supabase
    .from('turns')
    .insert({
      branch_id: branchId,
      mesa_num: mesaNum,
      mozo: mozo || '',
      status: 'abierta',
      total_facturado: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function dbCloseTable({ turnId, total, metodo }) {
  const { data, error } = await supabase
    .from('turns')
    .update({ status: 'cerrada', closed_at: new Date().toISOString(), total_facturado: total, metodo_pago: metodo })
    .eq('id', turnId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

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

export async function dbAddTurnItem({ turnId, branchId, menuItemId, nombre, precio, qty }) {
  const { data, error } = await supabase
    .from('turn_items')
    .insert({
      turn_id: turnId,
      branch_id: branchId,
      menu_item_id: menuItemId || null,
      menu_item_name: nombre,
      cantidad: qty,
      precio: precio || 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function dbUpdateTurnItem(turnItemId, cantidad) {
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
