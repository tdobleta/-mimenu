import { supabase } from '@/api/supabaseClient';

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

export async function dbAddTurnItem({ turnId, branchId, menuItemId, nombre, precio, qty, notas }) {
  const { data, error } = await supabase
    .from('turn_items')
    .insert({
      turn_id: turnId,
      branch_id: branchId,
      menu_item_id: menuItemId || null,
      menu_item_name: nombre,
      cantidad: qty,
      precio: precio || 0,
      notas: notas || '',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function dbSaveNota(turnItemId, notas) {
  const { error } = await supabase
    .from('turn_items')
    .update({ notas: notas || '' })
    .eq('id', turnItemId);
  if (error) throw error;
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
