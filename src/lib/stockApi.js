import { supabase } from '@/api/supabaseClient';

// ============================================================
// stockApi.js
// API de Supabase para recetas, precios y egresos de stock.
// Reemplaza el uso de localStorage en Stock.jsx y ComandaPanel.jsx
// ============================================================


// ── RECETAS ──────────────────────────────────────────────────

/**
 * Trae todas las recetas de una sucursal.
 * Retorna un objeto { [menuItemId]: [{ ingredienteId, cantidad }] }
 */
export async function fetchRecetas(branchId) {
  const { data, error } = await supabase
    .from('stock_recipes')
    .select('*')
    .eq('branch_id', branchId);
  if (error) throw error;

  // Convertir array a mapa por menuItemId
  const map = {};
  (data || []).forEach(r => {
    if (!map[r.menu_item_id]) map[r.menu_item_id] = [];
    map[r.menu_item_id].push({ ingredienteId: r.ingrediente_id, cantidad: r.cantidad });
  });
  return map;
}

/**
 * Guarda la receta completa de un plato.
 * Borra las anteriores y reinserta las nuevas (upsert completo).
 * @param {string} menuItemId
 * @param {string} branchId
 * @param {Array} items - [{ ingredienteId, cantidad }]
 */
export async function saveReceta(menuItemId, branchId, items) {
  // Borrar receta anterior
  const { error: delError } = await supabase
    .from('stock_recipes')
    .delete()
    .eq('menu_item_id', menuItemId)
    .eq('branch_id', branchId);
  if (delError) throw delError;

  if (!items || items.length === 0) return;

  // Insertar nuevas líneas
  const rows = items
    .filter(r => r.ingredienteId && Number(r.cantidad) > 0)
    .map(r => ({
      menu_item_id:   menuItemId,
      branch_id:      branchId,
      ingrediente_id: r.ingredienteId,
      cantidad:       Number(r.cantidad),
    }));

  if (rows.length === 0) return;

  const { error: insError } = await supabase
    .from('stock_recipes')
    .insert(rows);
  if (insError) throw insError;
}

/**
 * Borra la receta de un plato.
 */
export async function deleteReceta(menuItemId, branchId) {
  const { error } = await supabase
    .from('stock_recipes')
    .delete()
    .eq('menu_item_id', menuItemId)
    .eq('branch_id', branchId);
  if (error) throw error;
}


// ── PRECIOS MAYORISTAS ────────────────────────────────────────

/**
 * Trae todos los precios de una sucursal.
 * Retorna un objeto { [stockItemId]: { costo, proveedor } }
 */
export async function fetchPrecios(branchId) {
  const { data, error } = await supabase
    .from('stock_precios')
    .select('*')
    .eq('branch_id', branchId);
  if (error) throw error;

  const map = {};
  (data || []).forEach(p => {
    map[p.stock_item_id] = { costo: p.costo, proveedor: p.proveedor || '' };
  });
  return map;
}

/**
 * Guarda o actualiza el precio de un ingrediente.
 */
export async function savePrecio(stockItemId, branchId, { costo, proveedor }) {
  const { error } = await supabase
    .from('stock_precios')
    .upsert({
      stock_item_id: stockItemId,
      branch_id:     branchId,
      costo:         Number(costo) || 0,
      proveedor:     proveedor || '',
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'stock_item_id' });
  if (error) throw error;
}

/**
 * Guarda múltiples precios a la vez (batch).
 * @param {string} branchId
 * @param {Object} preciosMap - { [stockItemId]: { costo, proveedor } }
 */
export async function savePrecios(branchId, preciosMap) {
  const rows = Object.entries(preciosMap).map(([stockItemId, p]) => ({
    stock_item_id: stockItemId,
    branch_id:     branchId,
    costo:         Number(p.costo) || 0,
    proveedor:     p.proveedor || '',
    updated_at:    new Date().toISOString(),
  }));
  if (rows.length === 0) return;

  const { error } = await supabase
    .from('stock_precios')
    .upsert(rows, { onConflict: 'stock_item_id' });
  if (error) throw error;
}


// ── EGRESOS / MOVIMIENTOS ─────────────────────────────────────

/**
 * Trae los últimos N egresos de una sucursal.
 */
export async function fetchEgresos(branchId, limit = 100) {
  const { data, error } = await supabase
    .from('stock_egresos')
    .select('*')
    .eq('branch_id', branchId)
    .order('ts', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * Registra un egreso de stock.
 */
export async function addEgreso(branchId, {
  ingredienteId,
  ingredienteNombre,
  cantidad,
  unidad,
  motivo,
  origen = 'manual',
}) {
  const { data, error } = await supabase
    .from('stock_egresos')
    .insert({
      branch_id:          branchId,
      ingrediente_id:     ingredienteId,
      ingrediente_nombre: ingredienteNombre || '',
      cantidad:           Number(cantidad),
      unidad:             unidad || '',
      motivo:             motivo || '',
      origen,
      ts:                 Date.now(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
