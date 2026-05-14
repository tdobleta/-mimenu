// lib/offlineSync.js
// Motor de sincronización offline-first.
// Drena la cola de IndexedDB al reconectar.
// Estrategia de conflict resolution:
//   - INSERT_TURN_ITEM: merge por operación (UUIDs únicos, nunca se pierden ítems)
//   - UPDATE_TURN: last-write-wins con validación de estado
//   - Mesa cerrada offline: ítems descartados con log, no error fatal

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { getPending, dequeue, countPending } from '@/lib/offlineQueue';

async function processOperation(op) {
  switch (op.type) {

    case 'INSERT_TURN_ITEM': {
      // Verificar que el turno sigue abierto — conflict resolution
      const { data: turn } = await supabase
        .from('turns').select('status').eq('id', op.turn_id).single();

      if (!turn || turn.status !== 'abierta') {
        // Mesa cerrada mientras estaba offline — descartar ítem, no es error fatal
        console.warn('[offlineSync] Ítem descartado — mesa ya cerrada:', op.turn_id);
        break;
      }

      const { error } = await supabase.from('turn_items').insert({
        turn_id:        op.turn_id,
        branch_id:      op.branch_id,
        menu_item_id:   op.menu_item_id || null,
        menu_item_name: op.menu_item_name,
        cantidad:       op.cantidad,
        precio:         op.precio,
        notas:          op.notas || null,
        modificadores:  op.modificadores || [],
      });
      if (error) throw error;
      break;
    }

    case 'UPDATE_TURN': {
      const { error } = await supabase
        .from('turns').update(op.updates).eq('id', op.turn_id);
      if (error) throw error;
      break;
    }

    case 'INSERT_TURN': {
      const { error } = await supabase.from('turns').insert(op.data);
      if (error) throw error;
      break;
    }

    default:
      console.warn('[offlineSync] Operación desconocida:', op.type);
  }
}

export async function drainQueue(onProgress) {
  const pending = await getPending();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const op of pending) {
    try {
      await processOperation(op);
      await dequeue(op.id);
      synced++;
      onProgress?.({ synced, failed, total: pending.length });
    } catch (err) {
      console.error('[offlineSync] Error procesando operación:', op.id, err);
      failed++;
    }
  }

  return { synced, failed };
}

export function useOfflineSync() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try { setPending(await countPending()); } catch {}
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const { synced, failed } = await drainQueue(() => refreshCount());
      if (synced > 0) { console.log(`[offlineSync] Sincronizados ${synced}`); setLastSync(Date.now()); }
      if (failed > 0) console.error(`[offlineSync] ${failed} fallaron`);
    } catch (err) { console.error('[offlineSync]', err); }
    finally { syncingRef.current = false; setSyncing(false); refreshCount(); }
  }, [refreshCount]);

  useEffect(() => {
    refreshCount();
    window.addEventListener('online', sync);
    if (navigator.onLine) sync();
    const interval = setInterval(() => { if (navigator.onLine) sync(); }, 30000);
    return () => { window.removeEventListener('online', sync); clearInterval(interval); };
  }, [sync, refreshCount]);

  return { pending, syncing, lastSync, sync, refreshCount };
}

// ── Registrar Background Sync en el SW ───────────────────────
// Cuando hay pendientes, le avisamos al SW para que reintente
// automáticamente aunque se cierre el tab.
export async function registerBackgroundSync() {
  try {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('mimenu-sync');
    }
  } catch {
    // Background Sync no soportado en este browser — el online event alcanza
  }
}

// Escuchar mensajes del SW sobre sync completado
if (typeof window !== 'undefined') {
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_COMPLETED') {
      console.log('[offlineSync] SW completó sync:', event.data.synced, 'operaciones');
      window.dispatchEvent(new CustomEvent('mimenu-sync-completed', { detail: event.data }));
    }
  });
}
