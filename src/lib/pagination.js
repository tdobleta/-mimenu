// lib/pagination.js
// Cursor pagination para queries grandes en Supabase.
// Reemplaza el .filter(..., limit=2000) por páginas de 100.

import { supabase } from '@/api/supabaseClient';

const PAGE_SIZE = 100;

/**
 * Carga turns cerrados con cursor pagination.
 * Evita traer 2000 rows de una vez.
 * @param {string} branchId
 * @param {number} startTs - timestamp de inicio del rango
 * @param {number} endTs - timestamp de fin del rango
 * @param {number} maxRows - máximo de rows a traer (default 500)
 */
export async function fetchClosedTurnsPaginated(branchId, startTs, endTs, maxRows = 500) {
  const results = [];
  let cursor = null; // last closed_at visto
  let page = 0;

  while (results.length < maxRows) {
    let query = supabase
      .from('turns')
      .select('*')
      .eq('branch_id', branchId)
      .eq('status', 'cerrada')
      .order('closed_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (startTs) query = query.gte('closed_at', startTs);
    if (endTs)   query = query.lte('closed_at', endTs);
    if (cursor)  query = query.lt('closed_at', cursor);

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;

    results.push(...data);
    cursor = data[data.length - 1].closed_at;

    // Si la página tiene menos de PAGE_SIZE, no hay más datos
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  return results;
}

/**
 * Carga turn_items de múltiples turns con batching.
 * Evita hacer N+1 queries individuales.
 * @param {string[]} turnIds
 */
export async function fetchTurnItemsBatch(turnIds) {
  if (!turnIds?.length) return [];

  const results = [];
  // Procesar en batches de 50 IDs para no exceder límites de URL
  const BATCH_SIZE = 50;

  for (let i = 0; i < turnIds.length; i += BATCH_SIZE) {
    const batch = turnIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('turn_items')
      .select('*')
      .in('turn_id', batch);

    if (error) throw error;
    if (data) results.push(...data);
  }

  return results;
}

/**
 * Query con rango de fechas — para analíticas y reportes.
 * @param {string} branchId
 * @param {number} fromTs - timestamp inicio
 * @param {number} toTs - timestamp fin
 */
export async function fetchTurnsForRange(branchId, fromTs, toTs) {
  return fetchClosedTurnsPaginated(branchId, fromTs, toTs, 1000);
}
