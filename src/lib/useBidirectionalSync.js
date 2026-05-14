// lib/useBidirectionalSync.js
// Sincronización bidireccional al reconectar.
// Cuando una tablet vuelve a estar online, recarga el estado
// de las mesas activas para recibir cambios de otras tablets.

import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { registerBackgroundSync } from '@/lib/offlineSync';

/**
 * Hook que sincroniza el estado local con Supabase al reconectar.
 * @param {string} branchId - ID de la sucursal activa
 * @param {Function} onSync - callback que recibe los turns actualizados
 */
export function useBidirectionalSync(branchId, onSync) {
  const lastSyncRef = useRef(null);
  const isSyncingRef = useRef(false);

  const pullFromServer = useCallback(async () => {
    if (!branchId || isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      // 1. Traer todos los turns abiertos actuales
      const { data: turns, error } = await supabase
        .from('turns')
        .select('*')
        .eq('branch_id', branchId)
        .eq('status', 'abierta')
        .order('opened_at', { ascending: true });

      if (error) throw error;

      // 2. Para cada turn, traer sus ítems
      const turnsWithItems = await Promise.all(
        (turns || []).map(async (turn) => {
          const { data: items } = await supabase
            .from('turn_items')
            .select('*')
            .eq('turn_id', turn.id);
          return { ...turn, items: items || [] };
        })
      );

      lastSyncRef.current = Date.now();

      // 3. Notificar al componente con el estado actualizado
      onSync?.(turnsWithItems);

    } catch (err) {
      console.error('[bidirectionalSync] Error al sincronizar:', err);
    } finally {
      isSyncingRef.current = false;
    }
  }, [branchId, onSync]);

  useEffect(() => {
    if (!branchId) return;

    // Sync inicial al montar
    pullFromServer();

    // Sync al reconectar
    const handleOnline = async () => {
      // Primero enviar pendientes, luego recibir cambios
      await registerBackgroundSync().catch(() => {});
      // Pequeño delay para que el Background Sync termine primero
      setTimeout(() => pullFromServer(), 1500);
    };

    // Escuchar sync completado del SW
    const handleSwSync = () => {
      setTimeout(() => pullFromServer(), 500);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('mimenu-sync-completed', handleSwSync);

    // Polling cada 60s como fallback
    const interval = setInterval(() => {
      if (navigator.onLine) pullFromServer();
    }, 60000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('mimenu-sync-completed', handleSwSync);
      clearInterval(interval);
    };
  }, [branchId, pullFromServer]);

  return { pullFromServer, lastSync: lastSyncRef.current };
}
