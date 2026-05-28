// lib/offlineSync.js
// Motor de sincronización offline-first.
// Drena la cola de IndexedDB al reconectar.
//
// Operaciones soportadas:
//   INSERT_TURN       — crear un turno (apertura de mesa)
//   INSERT_TURN_ITEM  — agregar ítem a comanda
//   UPDATE_TURN       — actualizar campo de turno (ej: enviado_cocina)
//   DELETE_TURN_ITEM  — eliminar ítem de comanda
//   UPDATE_TURN_ITEM  — cambiar cantidad o notas de ítem
//   NOTA_SAVE         — guardar nota en ítem existente
//   CAJA_RETIRO       — persistir retiro de caja a DB
//   STOCK_DECREMENT   — descontar stock por ítem [{stockItemId, cantidad}]
//   KITCHEN_STATE_CHANGE — cambiar estado de comanda en cocina
//
// Conflict resolution:
//   - Mesa cerrada offline: ítems descartados con log, no error fatal
//   - NOTA_SAVE sin turnItemId: descartada (uid nunca resuelto — raro)
//   - CAJA_RETIRO duplicado: detectado por ts, no se inserta dos veces
//   - Dead letter: después de MAX_RETRIES fallas, se marca status='failed'

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { getActive, dequeue, updateOp, countActive, countFailed, clearFailed, retryFailed } from '@/lib/offlineQueue';
import { buildCloseTableSyncPayload } from '@/lib/operations/closeTableOperation';

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1500;   // 1.5s → 3s → 6s

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isJWTError(err) {
  return (
    err?.status === 401 ||
    err?.message?.includes('JWT') ||
    err?.message?.includes('token is expired') ||
    err?.message?.includes('not authenticated')
  );
}

function isMissingCloseOperationRpc(err) {
  const msg = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
  return (
    msg.includes('sync_close_table_operation') &&
    (msg.includes('not found') || msg.includes('does not exist') || msg.includes('schema cache') || err?.code === 'PGRST202')
  );
}

// ── Procesar una operación individual ────────────────────────
async function processOperation(op) {
  switch (op.type) {

    // ── Operaciones originales ────────────────────────────────

    case 'INSERT_TURN_ITEM': {
      // Verificar que el turno sigue abierto — conflict resolution
      const { data: turn } = await supabase
        .from('turns').select('status').eq('id', op.turn_id).single();

      if (!turn || turn.status !== 'abierta') {
        console.warn('[offlineSync] INSERT_TURN_ITEM descartado — mesa ya cerrada:', op.turn_id);
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
        // IDEMPOTENCIA: client_uid = op.id (ID estable de IndexedDB).
        // Si la red cae después de que PG insertó pero antes de recibir la respuesta,
        // el retry encontrará el mismo client_uid y recibirá error 23505.
        // Tratamos 23505 como éxito: el ítem ya está en la DB, no hay duplicado.
        client_uid:     op.id,
      });
      // 23505 = unique_violation en client_uid → ítem ya insertado → éxito silencioso
      if (error && error.code !== '23505') throw error;
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
      // 23505 = unique_violation en turns.id → turno ya insertado en un retry previo → éxito silencioso
      if (error && error.code !== '23505') throw error;
      break;
    }

    // ── Nuevas operaciones Semana 1 ───────────────────────────

    case 'DELETE_TURN_ITEM': {
      const { error } = await supabase
        .from('turn_items').delete().eq('id', op.turnItemId);
      if (error) throw error;
      break;
    }

    case 'UPDATE_TURN_ITEM': {
      const { error } = await supabase
        .from('turn_items').update(op.updates).eq('id', op.turnItemId);
      if (error) throw error;
      break;
    }

    case 'NOTA_SAVE': {
      if (!op.turnItemId) {
        // El turnItemId nunca se resolvió (uid aún pendiente) — descartar silenciosamente
        console.warn('[offlineSync] NOTA_SAVE descartada — sin turnItemId, uid:', op.uid);
        break;
      }
      const { error } = await supabase
        .from('turn_items').update({ notas: op.notas || '' }).eq('id', op.turnItemId);
      if (error) throw error;
      break;
    }

    case 'CAJA_RETIRO': {
      // Verificar idempotencia: leer retiros actuales para no duplicar por ts
      // El RPC append_caja_retiro usa || atómico de PostgreSQL — sin race conditions.
      // Aún así necesitamos la lectura para idempotencia (evitar duplicar en retry).
      const { data: shift, error: fetchErr } = await supabase
        .from('caja_shifts').select('retiros').eq('id', op.cajaShiftId).single();
      if (fetchErr) throw fetchErr;

      let current = [];
      try { current = Array.isArray(shift?.retiros) ? shift.retiros : JSON.parse(shift?.retiros || '[]'); } catch(e) {}

      // Idempotencia por timestamp: no insertar si ya existe
      const alreadyExists = current.some(r => r.ts === op.retiro.ts);
      if (!alreadyExists) {
        // RPC atómico — PostgreSQL garantiza que no se pierden retiros concurrentes
        const { error } = await supabase.rpc('append_caja_retiro', {
          p_shift_id:    op.cajaShiftId,
          p_retiro_json: op.retiro,
        });
        if (error) throw error;
      }
      break;
    }

    case 'STOCK_DECREMENT': {
      // op.items = [{stockItemId, cantidad}] — decrementos, NO valores absolutos
      // decrement_stock RPC usa GREATEST(0, actual - qty) — atómico, sin race conditions,
      // y nunca produce stock negativo aunque haya dos tablets simultáneas.
      //
      // Operacion legacy/manual. El cierre de mesa moderno descuenta stock en el
      // servidor dentro de sync_close_table_operation para que online/offline tengan
      // el mismo efecto idempotente.
      for (const item of (op.items || [])) {
        const { error } = await supabase.rpc('decrement_stock', {
          p_id:  item.stockItemId,
          p_qty: item.cantidad,
        });
        if (error) throw error;
      }
      break;
    }

    case 'CLOSE_TABLE': {
      // Cobro diferido: el mozo cobró sin internet.
      // Ahora que hay conexión, ejecutamos el RPC atómico cerrar_mesa_atomico.
      //
      // COMPATIBILIDAD: aceptar tanto camelCase como snake_case en los campos del op
      // porque POSView.jsx (Sprint 7.3) encoló con snake_case y las versiones futuras
      // podrían usar camelCase.
      const closePayload = buildCloseTableSyncPayload(op);
      const {
        turnId,
        cajaShiftId,
        pagosDetalle,
        branchId,
        tableId,
        total,
        propina,
        metodo,
        mozo,
      } = closePayload;

      if (!turnId || total === undefined || !metodo) {
        throw new Error(`CLOSE_TABLE incompleta: ${closePayload.operationId || op.id || 'sin_id'}`);
      }

      if (op.operation?.operation_type === 'CLOSE_TABLE') {
        const { data, error } = await supabase.rpc('sync_close_table_operation', {
          p_operation: op.operation,
        });

        if (!error && data?.ok !== false) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mimenu-table-synced', {
              detail: { branchId, tableId },
            }));
          }
          break;
        }

        if (error) {
          const msgLower = error.message?.toLowerCase() || '';
          if (msgLower.includes('ya cerrado') || error.code === 'P0001') break;
          if (!isMissingCloseOperationRpc(error)) throw error;
          console.warn('[offlineSync] sync_close_table_operation no disponible; usando cerrar_mesa_atomico legacy.');
        } else {
          throw new Error(data?.error || 'sync_close_table_operation fallo');
        }
      }

      const opPricing = op.operation?.pricing || {};
      const descuento = Number(opPricing.discount_amount || 0);
      const descuentoMotivo = opPricing.discount_reason || null;

      const { error: rpcError } = await supabase.rpc('cerrar_mesa_atomico', {
        p_turn_id:          turnId,
        p_total:            total,
        p_propina:          propina || 0,
        p_metodo:           metodo,
        p_mozo:             mozo || '',
        p_caja_shift_id:    cajaShiftId,
        p_pagos_detalle:    pagosDetalle,
        p_descuento:        descuento,
        p_descuento_motivo: descuentoMotivo,
        p_puntos_canjeados: op.operation?.loyalty?.puntos_canjeados || 0,
        p_cliente_id:       op.operation?.loyalty?.customer_id || null,
      });
      if (rpcError) {
        const msgLower = rpcError.message?.toLowerCase() || '';
        // Idempotencia: si ya fue cerrado (por el polling de Salon.jsx p.e.) → ok silencioso
        if (msgLower.includes('ya cerrado') || rpcError.code === 'P0001') break;
        throw rpcError;
      }
      // Notificar a Salon.jsx para que limpie el estado pendiente_cobro → libre
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mimenu-table-synced', {
          detail: { branchId, tableId },
        }));
      }
      break;
    }

    case 'KITCHEN_STATE_CHANGE': {
      const updateData = {};
      if (op.cocina_estado !== undefined) updateData.cocina_estado = op.cocina_estado;
      if (typeof op.comanda_lista === 'boolean') updateData.comanda_lista = op.comanda_lista;
      const { error } = await supabase
        .from('turns').update(updateData).eq('id', op.turnId);
      if (error) throw error;
      break;
    }

    default:
      console.warn('[offlineSync] Operación desconocida — descartando:', op.type);
  }
}

// ── Drenar la cola con retry + exponential backoff ────────────
export async function drainQueue(onProgress) {
  const pending = await getActive();          // Solo las activas (no failed)
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  let jwtRefreshed = false;

  for (const op of pending) {
    let lastErr = null;
    let success = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Backoff exponencial en reintentos (no en el primero)
        if (attempt > 0) {
          const base   = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
          const jitter = Math.random() * base * 0.3;   // 0-30% del delay base
          await sleep(base + jitter);
          // Resultado: retry 1 → 1500-1950ms, retry 2 → 3000-3900ms
          // Distribuye reintentos en el tiempo → evita thundering herd con 50+ restaurantes
        }

        // Si el error previo fue JWT, refrescar sesión una sola vez
        if (attempt > 0 && lastErr && isJWTError(lastErr) && !jwtRefreshed) {
          console.log('[offlineSync] Refrescando sesión JWT...');
          await supabase.auth.refreshSession();
          jwtRefreshed = true;
        }

        await processOperation(op);
        await dequeue(op.id);
        synced++;
        success = true;
        onProgress?.({ synced, failed, total: pending.length });
        break;
      } catch (err) {
        lastErr = err;
        console.warn(
          `[offlineSync] Intento ${attempt + 1}/${MAX_RETRIES} fallido [${op.type}] ${op.id}:`,
          err?.message
        );
      }
    }

    if (!success) {
      // Dead letter: marcar como fallida permanente — no se reintentará
      await updateOp(op.id, {
        status: 'failed',
        lastError: lastErr?.message || 'unknown error',
        failedAt: Date.now(),
      }).catch(() => {});
      failed++;
      console.error('[offlineSync] Dead letter:', op.type, op.id, lastErr?.message);
    }
  }

  return { synced, failed };
}

// ── Hook React para usar el sync en componentes ───────────────
export function useOfflineSync() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const [active, failedCount] = await Promise.all([countActive(), countFailed()]);
      setPending(active);
      setFailed(failedCount);
    } catch {}
  }, []);

  const dismissFailed = useCallback(async () => {
    try { await clearFailed(); await refreshCount(); } catch {}
  }, [refreshCount]);

  const sync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const { synced, failed: failedCount } = await drainQueue(() => refreshCount());
      if (synced > 0) {
        console.log(`[offlineSync] Sincronizados ${synced}`);
        setLastSync(Date.now());
      }
      if (failedCount > 0) {
        console.error(`[offlineSync] ${failedCount} operaciones fallaron permanentemente`);
      }
    } catch (err) {
      console.error('[offlineSync]', err);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      refreshCount();
    }
  }, [refreshCount]);

  const retryAllFailed = useCallback(async () => {
    try {
      const n = await retryFailed();
      await refreshCount();
      if (n > 0) sync();
    } catch {}
  }, [refreshCount, sync]);

  useEffect(() => {
    refreshCount();
    window.addEventListener('online', sync);
    window.addEventListener('mimenu-offline-retry', sync);
    if (navigator.onLine) sync();
    const interval = setInterval(() => { if (navigator.onLine) sync(); }, 30000);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('mimenu-offline-retry', sync);
      clearInterval(interval);
    };
  }, [sync, refreshCount]);

  return { pending, failed, syncing, lastSync, sync, refreshCount, dismissFailed, retryAllFailed };
}

// ── Background Sync via Service Worker ───────────────────────
export async function registerBackgroundSync() {
  try {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('mimenu-sync');
    }
  } catch {
    // Background Sync no soportado — el evento 'online' es suficiente fallback
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
