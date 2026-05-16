// lib/useBidirectionalSync.js
// v2 — 3 fixes críticos:
// 1. Supabase Realtime para turns y turn_items (sync < 2s entre tablets)
// 2. Fix N+1: fetchTurnItemsBatch en vez de 1 query por mesa
// 3. Lock optimista: UPDATE solo si status='abierta'

import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { fetchTurnItemsBatch } from '@/lib/pagination';
import { registerBackgroundSync } from '@/lib/offlineSync';

export function useBidirectionalSync(branchId, onSync) {
  const lastSyncRef  = useRef(null);
  const isSyncingRef = useRef(false);
  const channelRef   = useRef(null);

  // ── 1 query para turns + 1 query para TODOS los items (fix N+1) ───
  const pullFromServer = useCallback(async () => {
    if (!branchId || isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const { data: turns, error } = await supabase
        .from('turns')
        .select('*')
        .eq('branch_id', branchId)
        .eq('status', 'abierta')
        .order('opened_at', { ascending: true });

      if (error) throw error;
      if (!turns?.length) { onSync?.([]); return; }

      // fetchTurnItemsBatch: 1 sola query para todos los items
      const turnIds = turns.map(t => t.id);
      const allItems = await fetchTurnItemsBatch(turnIds);

      // Agrupar por turn_id
      const itemsByTurn = allItems.reduce((acc, item) => {
        if (!acc[item.turn_id]) acc[item.turn_id] = [];
        acc[item.turn_id].push(item);
        return acc;
      }, {});

      onSync?.(turns.map(turn => ({ ...turn, items: itemsByTurn[turn.id] || [] })));
      lastSyncRef.current = Date.now();
    } catch (err) {
      console.error('[bidirectionalSync]', err);
    } finally {
      isSyncingRef.current = false;
    }
  }, [branchId, onSync]);

  // ── Realtime: push en vez de polling cada 60s ─────────────────
  useEffect(() => {
    if (!branchId) return;

    pullFromServer();

    const channel = supabase
      .channel(`salon_rt_${branchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turns', filter: `branch_id=eq.${branchId}` },
        () => pullFromServer())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turn_items' },
        () => pullFromServer())
      .subscribe();

    channelRef.current = channel;

    const handleOnline = async () => {
      await registerBackgroundSync().catch(() => {});
      setTimeout(() => pullFromServer(), 1500);
    };
    const handleSwSync = () => setTimeout(() => pullFromServer(), 500);

    window.addEventListener('online', handleOnline);
    window.addEventListener('mimenu-sync-completed', handleSwSync);

    // Polling de 60s como fallback si Realtime falla
    const interval = setInterval(() => { if (navigator.onLine) pullFromServer(); }, 60000);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('mimenu-sync-completed', handleSwSync);
      clearInterval(interval);
    };
  }, [branchId, pullFromServer]);

  return { pullFromServer, lastSync: lastSyncRef.current };
}

// ── Lock optimista para cerrar mesa ──────────────────────────────
// Si dos mozos intentan cerrar la misma mesa, solo uno gana.
export async function cerrarMesaConLock(turnId, updates) {
  const { data, error } = await supabase
    .from('turns')
    .update({ ...updates, status: 'cerrada' })
    .eq('id', turnId)
    .eq('status', 'abierta')  // Solo cierra si sigue abierta
    .select()
    .single();

  if (error || !data) {
    throw new Error('Esta mesa ya fue cerrada por otro usuario. Recargá la pantalla.');
  }
  return data;
}
