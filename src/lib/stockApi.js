import { supabase } from '@/api/supabaseClient';

function isMissingStockDecrementRpc(err) {
  const msg = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
  return (
    msg.includes('decrement_stock_with_egreso') &&
    (msg.includes('not found') || msg.includes('does not exist') || msg.includes('schema cache') || err?.code === 'PGRST202')
  );
}

// ============================================================
// stockApi.js
// API de Supabase para recetas, precios, egresos e ingresos de stock.
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

// ── DESCUENTO AUTOMÁTICO AL CERRAR MESA ──────────────────────

/**
 * Descuenta stock automáticamente según las recetas configuradas,
 * al cerrar una mesa desde Salón o POSView.
 *
 * @param {Array}  order    - items del pedido [{itemId, qty}]
 * @param {string} branchId
 * @param {Object} store    - store de la app (para leer y actualizar stock local)
 * @param {string} [turnId] - UUID del turn (opcional, para idempotencia de egresos en retry)
 */
export async function descontarStockPorMesa(order, branchId, store, turnId = null) {
  try {
    const recetas = await fetchRecetas(branchId);
    if (!recetas || Object.keys(recetas).length === 0) return;
    const stockItems = store.getStock ? store.getStock() : (store.stock?.[branchId] || []);
    // Acumulador de decrementos locales por ingrediente.
    // Evita el race condition donde dos platos que comparten un ingrediente
    // calculan ambos sobre el valor original del array congelado.
    // Ejemplo: 10 medallones, pedido con 2 hamburguesas (1 medallón c/u):
    //   Sin acumulador: iteración 1→9, iteración 2→9 (UI muestra 9, real es 8)
    //   Con acumulador: iteración 1→9, iteración 2→8 (UI y DB coinciden)
    const decrementosLocales = {}; // { [ingredienteId]: totalDecrementado }
    for (const item of order) {
      const menuItemId = item.itemId || item.id;
      const rec = recetas[menuItemId];
      if (!rec || rec.length === 0) continue;
      for (const r of rec) {
        const ing = stockItems.find(s => s.id === r.ingredienteId);
        if (!ing) continue;
        const cantidad = Number(r.cantidad) * (item.qty || 1);
        // Acumular el decremento total de este ingrediente en este pedido
        decrementosLocales[ing.id] = (decrementosLocales[ing.id] || 0) + cantidad;
        // El store local usa el acumulador (refleja todos los decrementos anteriores del mismo ingrediente)
        const nuevoActual = Math.max(0, Number(ing.actual) - decrementosLocales[ing.id]);
        try {
          const lineId = item.turnItemId || item.uid || item.id || menuItemId;
          const stockClientUid = turnId ? `stock_${turnId}_${lineId}_${ing.id}` : null;
          if (stockClientUid) {
            const { data, error } = await supabase.rpc('decrement_stock_with_egreso', {
              p_branch_id:          branchId,
              p_stock_item_id:      ing.id,
              p_qty:                cantidad,
              p_ingrediente_nombre: ing.nombre,
              p_unidad:             ing.unidad,
              p_motivo:             'Mesa (automatico)',
              p_origen:             'automatico',
              p_client_uid:         stockClientUid,
            });
            if (error && !isMissingStockDecrementRpc(error)) throw error;
            if (!error) {
              if (!data?.already_applied) store.updateStockItem(branchId, ing.id, { actual: nuevoActual });
              continue;
            }
          }
          // DB: RPC atómico — siempre correcto independientemente del orden de ejecución
          const { error } = await supabase.rpc('decrement_stock', {
            p_id:  ing.id,
            p_qty: cantidad,
          });
          if (error) throw error;
          store.updateStockItem(branchId, ing.id, { actual: nuevoActual });
          // IDEMPOTENCIA: Si tenemos turnId, generamos un client_uid determinístico.
          // Si este egreso ya fue registrado (retry), addEgreso lo ignorará silenciosamente.
          const egresoClientUid = turnId
            ? `stock_${turnId}_${lineId}_${ing.id}`
            : null;
          await addEgreso(branchId, {
            ingredienteId:      ing.id,
            ingredienteNombre:  ing.nombre,
            cantidad,
            unidad:             ing.unidad,
            motivo:             `Mesa (automático)`,
            origen:             'automatico',
            clientUid:          egresoClientUid,
          });
        } catch(e) { /* un error en un ítem no debe abortar el resto */ }
      }
    }
  } catch(e) { /* silencioso — no debe bloquear el cierre de mesa */ }
}


// ── INGRESOS / COMPRAS ────────────────────────────────────────

/**
 * Trae los últimos N ingresos de una sucursal.
 * Requiere tabla stock_ingresos en DB.
 */
export async function fetchIngresos(branchId, limit = 100) {
  const { data, error } = await supabase
    .from('stock_ingresos')
    .select('*')
    .eq('branch_id', branchId)
    .order('fecha', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * Registra un ingreso/compra de stock y actualiza stock_items.actual.
 * @param {string} branchId
 * @param {Object} params
 * @param {string} params.stockItemId  - UUID del ingrediente
 * @param {number} params.cantidad
 * @param {number} [params.costoUnit]  - Costo unitario para precio promedio
 * @param {string} [params.proveedor]
 * @param {string} [params.notas]
 * @param {string} [params.usuario]
 * @returns {{ ingreso, nuevoActual }}
 */
export async function addIngreso(branchId, { stockItemId, cantidad, costoUnit, proveedor, notas, usuario }) {
  const cantNum = Number(cantidad) || 0;
  if (cantNum <= 0) throw new Error('La cantidad debe ser mayor a 0');

  // 1. Insertar en stock_ingresos
  const { data: ingreso, error: ingError } = await supabase
    .from('stock_ingresos')
    .insert({
      branch_id:    branchId,
      stock_item_id: stockItemId,
      cantidad:     cantNum,
      costo_unit:   costoUnit ? Number(costoUnit) : null,
      proveedor:    proveedor || null,
      notas:        notas || null,
      usuario:      usuario || null,
      fecha:        new Date().toISOString(),
    })
    .select()
    .single();
  if (ingError) throw ingError;

  // 2. Leer stock actual y sumar la cantidad
  const { data: item, error: readErr } = await supabase
    .from('stock_items')
    .select('actual')
    .eq('id', stockItemId)
    .single();
  if (readErr) throw readErr;

  const nuevoActual = (Number(item?.actual) || 0) + cantNum;

  const { error: updError } = await supabase
    .from('stock_items')
    .update({ actual: nuevoActual })
    .eq('id', stockItemId);
  if (updError) throw updError;

  return { ingreso, nuevoActual };
}


// ── EGRESOS / MOVIMIENTOS ─────────────────────────────────────

/**
 * Registra un egreso de stock.
 * @param {string} [clientUid] - ID idempotente para retries offline.
 *   Si se provee, un segundo INSERT con el mismo clientUid retornará
 *   silenciosamente (código 23505) sin lanzar error.
 */
export async function addEgreso(branchId, {
  ingredienteId,
  ingredienteNombre,
  cantidad,
  unidad,
  motivo,
  origen = 'manual',
  clientUid = null,
}) {
  const row = {
    branch_id:          branchId,
    ingrediente_id:     ingredienteId,
    ingrediente_nombre: ingredienteNombre || '',
    cantidad:           Number(cantidad),
    unidad:             unidad || '',
    motivo:             motivo || '',
    origen,
    ts:                 new Date().toISOString(),
  };
  if (clientUid) row.client_uid = clientUid;

  const { data, error } = await supabase
    .from('stock_egresos')
    .insert(row)
    .select()
    .single();

  // 23505 = unique_violation en client_uid → egreso ya registrado → éxito silencioso
  if (error && error.code !== '23505') throw error;
  return data || null;
}
