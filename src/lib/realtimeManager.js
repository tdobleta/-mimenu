// lib/realtimeManager.js
// Singleton de canales Supabase Realtime por branchId.
//
// Problema que resuelve:
// Cada componente que usa `supabase.channel(...)` abre su propio WebSocket independiente.
// Con 6 componentes escuchando `turns` con el mismo branch_id filter, son 6 conexiones
// duplicadas. Con 5 tablets en el mismo restaurante = 30 canales innecesarios.
//
// Solución: Map module-level (singleton por pestaña). El primer suscriptor crea el canal,
// los siguientes solo agregan su callback. El último que se va cierra el canal.
//
// Uso:
//   const unsub = subscribeToTurns(branchId, (payload) => { ... });
//   // En cleanup: unsub();
//
//   const unsub = subscribeToTurnItems(branchId, (payload) => { ... });

import { supabase } from '@/api/supabaseClient';

// Map<string, { channel: RealtimeChannel, subs: Set<function> }>
const registry = new Map();

// Map<branchId, Set<turnId>> — turns activos por branch.
// Se actualiza cuando subscribeToTurns recibe INSERT/UPDATE de turns.
// Permite filtrar eventos de turn_items por branch sin subquery (Realtime v2 no lo soporta).
const activeTurnIdsByBranch = new Map();

/**
 * Crea o reutiliza un canal Realtime para el key dado.
 * @param {string} key - Clave única del canal (ej: "turns_uuid")
 * @param {function} setup - (subs: Set) => RealtimeChannel — se llama solo si el canal no existe
 * @returns {{ channel, subs }}
 */
function getOrCreate(key, setup) {
  if (!registry.has(key)) {
    const subs = new Set();
    const channel = setup(subs);
    registry.set(key, { channel, subs });
  }
  return registry.get(key);
}

/**
 * Suscribirse a cambios en la tabla `turns` para un branchId específico.
 * Todos los suscriptores del mismo branchId comparten un único canal WebSocket.
 * Además mantiene el Map activeTurnIdsByBranch para filtrar turn_items.
 *
 * @param {string} branchId - UUID de la sucursal
 * @param {function} callback - fn(payload) llamado en cada evento
 * @returns {function} unsub — llamar en el cleanup del useEffect
 */
export function subscribeToTurns(branchId, callback) {
  if (!branchId) return () => {};

  // Asegurar que el Set para este branch existe
  if (!activeTurnIdsByBranch.has(branchId)) {
    activeTurnIdsByBranch.set(branchId, new Set());
  }

  const key = `turns_${branchId}`;
  const entry = getOrCreate(key, (subs) =>
    supabase
      .channel(key)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turns', filter: `branch_id=eq.${branchId}` },
        (payload) => {
          // Mantener el Set de turns activos para filtrar turn_items por branch
          const turnId = payload.new?.id || payload.old?.id;
          if (turnId) {
            const set = activeTurnIdsByBranch.get(branchId) || new Set();
            const status = payload.new?.status;
            if (payload.eventType === 'INSERT' || status === 'abierta') {
              set.add(turnId);
            } else if (status === 'cerrada' || status === 'anulada') {
              set.delete(turnId);
            }
            activeTurnIdsByBranch.set(branchId, set);
          }
          subs.forEach(fn => fn(payload));
        }
      )
      .subscribe()
  );
  entry.subs.add(callback);

  return () => {
    entry.subs.delete(callback);
    if (entry.subs.size === 0) {
      supabase.removeChannel(entry.channel);
      registry.delete(key);
      activeTurnIdsByBranch.delete(branchId);
    }
  };
}

/**
 * Registrar manualmente los turn_ids activos de un branch.
 * Llamar después de cargar turns desde DB para que el filtro funcione desde el inicio
 * (antes de que llegue el primer evento Realtime).
 *
 * @param {string} branchId - UUID de la sucursal
 * @param {string[]} turnIds - IDs de turns con status='abierta'
 */
export function registerActiveTurns(branchId, turnIds) {
  if (!branchId || !turnIds?.length) return;
  const set = activeTurnIdsByBranch.get(branchId) || new Set();
  turnIds.forEach(id => set.add(id));
  activeTurnIdsByBranch.set(branchId, set);
}

/**
 * Suscribirse a cambios en la tabla `turn_items` con filtro por branchId.
 * Canal global compartido; el filtro se aplica client-side usando el Map de turns activos.
 * Supabase Realtime v2 no soporta subqueries como filtros, por eso el filtro es client-side.
 *
 * @param {string} branchId - UUID de la sucursal (para filtrar eventos de otros restaurants)
 * @param {function} callback - fn(payload) llamado solo para items del branch indicado
 * @returns {function} unsub — llamar en el cleanup del useEffect
 */
export function subscribeToTurnItems(branchId, callback) {
  const key = 'turn_items_global';

  // Wrapper que filtra por branch antes de llamar al callback real
  const filteredCallback = (payload) => {
    const activeTurns = activeTurnIdsByBranch.get(branchId);
    const itemTurnId = payload?.new?.turn_id || payload?.old?.turn_id;
    // Si el Map ya tiene datos para este branch, filtrar estrictamente.
    // Si el Map aún está vacío (antes del primer evento de turns), dejar pasar todo
    // para no perder eventos al inicio.
    if (activeTurns && activeTurns.size > 0 && itemTurnId && !activeTurns.has(itemTurnId)) return;
    callback(payload);
  };

  const entry = getOrCreate(key, (subs) =>
    supabase
      .channel(key)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turn_items' },
        (payload) => subs.forEach(fn => fn(payload))
      )
      .subscribe()
  );
  entry.subs.add(filteredCallback);

  return () => {
    entry.subs.delete(filteredCallback);
    if (entry.subs.size === 0) {
      supabase.removeChannel(entry.channel);
      registry.delete(key);
    }
  };
}
