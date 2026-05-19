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
//   const unsub = subscribeToTurnItems((payload) => { ... });

import { supabase } from '@/api/supabaseClient';

// Map<string, { channel: RealtimeChannel, subs: Set<function> }>
const registry = new Map();

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
 *
 * @param {string} branchId - UUID de la sucursal
 * @param {function} callback - fn(payload) llamado en cada evento
 * @returns {function} unsub — llamar en el cleanup del useEffect
 */
export function subscribeToTurns(branchId, callback) {
  if (!branchId) return () => {};
  const key = `turns_${branchId}`;
  const entry = getOrCreate(key, (subs) =>
    supabase
      .channel(key)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turns', filter: `branch_id=eq.${branchId}` },
        (payload) => subs.forEach(fn => fn(payload))
      )
      .subscribe()
  );
  entry.subs.add(callback);

  return () => {
    entry.subs.delete(callback);
    if (entry.subs.size === 0) {
      supabase.removeChannel(entry.channel);
      registry.delete(key);
    }
  };
}

/**
 * Suscribirse a cambios en la tabla `turn_items` (sin filtro de branch).
 * El filtro por branch debe hacerse en el callback si es necesario.
 * Canal global compartido por todos los suscriptores de la pestaña.
 *
 * @param {function} callback - fn(payload) llamado en cada evento
 * @returns {function} unsub — llamar en el cleanup del useEffect
 */
export function subscribeToTurnItems(callback) {
  const key = 'turn_items_global';
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
  entry.subs.add(callback);

  return () => {
    entry.subs.delete(callback);
    if (entry.subs.size === 0) {
      supabase.removeChannel(entry.channel);
      registry.delete(key);
    }
  };
}
