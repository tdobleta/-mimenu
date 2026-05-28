// lib/cajaService.js
// Lógica de cierre de mesa — separada de la UI.
//
// Principios:
//   - No usa React state, no lanza toasts, no cierra modales.
//   - Retorna { ok, alreadyClosed, error } — el caller decide qué mostrar.
//   - Cualquier error interno no bloquea el flujo principal (descontarStock es fire-and-forget).
//   - Compatible con POSView.jsx, ComandaPanel.jsx y Delivery.jsx.
//
// Uso:
//   const result = await cerrarMesaOnline({ turnId, branchId, cajaShiftId, total, propina,
//                                           metodo, mozo, pagos, order, store });
//   if (!result.ok) {
//     if (result.alreadyClosed) { // mostrar warning "ya cobrada" }
//     else { throw result.error; }
//   }
//   // Aquí el turn está cerrado en DB, caja actualizada, stock descontado (async).

import { supabase } from '@/api/supabaseClient';
import { descontarStockPorMesa } from '@/lib/stockApi';

function isMissingCloseOperationRpc(err) {
  const msg = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
  return (
    msg.includes('sync_close_table_operation') &&
    (msg.includes('not found') || msg.includes('does not exist') || msg.includes('schema cache') || err?.code === 'PGRST202')
  );
}

/**
 * Cierra una mesa de forma atómica (solo cuando hay internet).
 *
 * @param {object} params
 * @param {string}   params.turnId        - UUID del turn (requerido)
 * @param {string}   params.branchId      - UUID de la sucursal
 * @param {string}   [params.cajaShiftId] - UUID del turno de caja activo (null = sin caja)
 * @param {number}   params.total         - Total facturado
 * @param {number}   [params.propina]     - Propina (default 0)
 * @param {string}   params.metodo        - Método de pago ('Efectivo', 'Tarjeta', etc.)
 * @param {string}   [params.mozo]        - Nombre del mozo (default '')
 * @param {Array}    [params.pagos]       - Pagos mixtos [{ metodo, monto }] (null = pago único)
 * @param {Array}    [params.order]       - Ítems de la comanda para descontar stock
 * @param {object}   [params.store]       - Store de Zustand (para actualizar caja cache)
 *
 * @returns {Promise<{ ok: boolean, alreadyClosed?: boolean, error?: Error }>}
 */
export async function cerrarMesaOnline({
  turnId,
  branchId,
  cajaShiftId = null,
  total,
  propina = 0,
  metodo,
  mozo = '',
  pagos = null,
  order = [],
  store = null,
  operation = null,
}) {
  if (!turnId) {
    return { ok: false, error: new Error('cerrarMesaOnline: turnId requerido') };
  }

  // ── 1. Cierre atómico: FOR UPDATE + UPDATE turns + UPDATE caja_shifts ────────
  let alreadyApplied = false;
  let serverAppliedStock = false;
  let useLegacyClose = !operation?.operation_type;

  if (operation?.operation_type === 'CLOSE_TABLE') {
    const { data, error } = await supabase.rpc('sync_close_table_operation', {
      p_operation: operation,
    });

    if (!error && data?.ok !== false) {
      alreadyApplied = Boolean(data?.already_applied);
      serverAppliedStock = Boolean(data?.stock_applied);
    } else if (error) {
      const msgLower = error.message?.toLowerCase() || '';
      if (msgLower.includes('ya cerrado') || error.code === 'P0001') {
        return { ok: false, alreadyClosed: true };
      }
      if (!isMissingCloseOperationRpc(error)) {
        return { ok: false, error };
      }
      console.warn('[cajaService] sync_close_table_operation no disponible; usando cerrar_mesa_atomico legacy.');
      useLegacyClose = true;
    } else {
      return { ok: false, error: new Error(data?.error || 'sync_close_table_operation fallo') };
    }
  }

  const descuento = operation?.pricing?.discount_amount || 0;
  const descuentoMotivo = operation?.pricing?.discount_reason || null;

  const { error: rpcError } = useLegacyClose ? await supabase.rpc('cerrar_mesa_atomico', {
    p_turn_id:          turnId,
    p_total:            total,
    p_propina:          propina,
    p_metodo:           metodo,
    p_mozo:             mozo,
    p_caja_shift_id:    cajaShiftId || null,
    p_pagos_detalle:    pagos?.length > 0 ? pagos : null,
    p_descuento:        descuento,
    p_descuento_motivo: descuentoMotivo,
  }) : { error: null };

  if (rpcError) {
    // P0001 = turn ya cerrado (cerrar_mesa_atomico lanza RAISE EXCEPTION USING ERRCODE='P0001')
    // Puede ocurrir si dos dispositivos cierran la misma mesa simultáneamente.
    const msgLower = rpcError.message?.toLowerCase() || '';
    if (msgLower.includes('ya cerrado') || rpcError.code === 'P0001') {
      return { ok: false, alreadyClosed: true };
    }
    return { ok: false, error: rpcError };
  }

  // ── 2. Actualizar cache de caja en el store (fire-and-forget, no bloquea) ────
  // El RPC ya actualizó caja_shifts.total_facturado_turno incrementalmente (Fase 0).
  // Leemos el nuevo valor para que el UI de caja se actualice sin esperar realtime.
  if (cajaShiftId && store) {
    supabase
      .from('caja_shifts')
      .select('total_facturado_turno')
      .eq('id', cajaShiftId)
      .single()
      .then(({ data: cajaData }) => {
        if (cajaData && store.turnoActivo) {
          store.setTurnoActivo({
            ...store.turnoActivo,
            totalCache: cajaData.total_facturado_turno,
          });
        }
      })
      .catch((e) => {
        // No bloqueante — la UI de caja se actualizará en el próximo realtime event
        console.warn('[cajaService] Cache de caja no actualizado:', e.message);
      });
  }

  // ── 3. Descontar stock según recetas configuradas (fire-and-forget) ──────────
  // No bloquea el flujo de cobro. Si falla, el caller puede mostrar un warning.
  // Se pasa turnId para idempotencia: si se reintenta, los egresos con el mismo
  // turnId+lineId+ingredienteId se ignorarán silenciosamente (código 23505).
  if (!alreadyApplied && !serverAppliedStock && order?.length > 0 && store) {
    descontarStockPorMesa(order, branchId, store, turnId).catch((err) => {
      console.error('[cajaService] Fallo al descontar stock (no bloquea):', err?.message);
    });
  }

  return { ok: true };
}
