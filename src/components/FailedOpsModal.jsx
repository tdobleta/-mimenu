// FailedOpsModal.jsx
// Modal de recuperación de operaciones fallidas (dead letters).
// Muestra qué operaciones fallaron y por qué, con acciones individuales o en lote.

import { useState, useEffect, useCallback } from 'react';
import { getFailed, dequeue, updateOp } from '@/lib/offlineQueue';
import { G } from '@/lib/glass';

const OP_LABELS = {
  INSERT_TURN:         'Apertura de mesa',
  INSERT_TURN_ITEM:    'Agregar ítem a comanda',
  UPDATE_TURN:         'Actualizar mesa',
  UPDATE_TURN_ITEM:    'Modificar ítem',
  DELETE_TURN_ITEM:    'Eliminar ítem',
  NOTA_SAVE:           'Guardar nota',
  CAJA_RETIRO:         'Retiro de caja',
  STOCK_DECREMENT:     'Descuento de stock',
  CLOSE_TABLE:         'Cobro de mesa',
  KITCHEN_STATE_CHANGE:'Cambio estado cocina',
};

function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
}

function OpRow({ op, onRetry, onDiscard }) {
  const [loading, setLoading] = useState(false);

  const label = OP_LABELS[op.type] || op.type;
  const errMsg = op.lastError || 'Error desconocido';
  const failedAt = fmtTs(op.failedAt || op.ts);

  const details = [];
  if (op.turn_id) details.push(`Mesa ${op.mesa_num || 'desconocida'}`);
  if (op.menu_item_name) details.push(op.menu_item_name);
  if (op.cajaShiftId) details.push('Retiro');
  const detailStr = details.length ? details.join(' · ') : null;

  async function handleRetry() {
    setLoading(true);
    try { await onRetry(op.id); } finally { setLoading(false); }
  }
  async function handleDiscard() {
    setLoading(true);
    try { await onDiscard(op.id); } finally { setLoading(false); }
  }

  return (
    <div style={{
      borderRadius: 10,
      border: '1px solid rgba(220,38,38,0.18)',
      background: 'rgba(220,38,38,0.04)',
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
          <span style={{
            fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99,
            background:'rgba(220,38,38,0.12)', color:'#B91C1C', flexShrink:0,
          }}>
            {label}
          </span>
          {detailStr && (
            <span style={{ fontSize:12, color:G.textMid, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {detailStr}
            </span>
          )}
        </div>
        <span style={{ fontSize:11, color:G.textFaint, flexShrink:0 }}>{failedAt}</span>
      </div>

      <div style={{ fontSize:11, color:'#7F1D1D', background:'rgba(127,29,29,0.06)', borderRadius:6, padding:'4px 8px', fontFamily:'monospace', wordBreak:'break-all' }}>
        {errMsg}
      </div>

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button
          onClick={handleDiscard}
          disabled={loading}
          style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:6, border:'1px solid rgba(0,0,0,0.12)', background:'rgba(255,255,255,0.7)', color:G.textMid, cursor:'pointer', opacity: loading ? 0.5 : 1 }}>
          Descartar
        </button>
        <button
          onClick={handleRetry}
          disabled={loading}
          style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:6, border:'none', background:G.teal, color:'white', cursor:'pointer', opacity: loading ? 0.5 : 1 }}>
          Reintentar
        </button>
      </div>
    </div>
  );
}

export default function FailedOpsModal({ onClose, onRetryAll, onDiscardAll, onChanged }) {
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const reload = useCallback(async () => {
    try {
      const failed = await getFailed();
      setOps(failed);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleRetryOne(id) {
    await updateOp(id, { status: 'pending', lastError: null, failedAt: null });
    await reload();
    onChanged?.();
  }

  async function handleDiscardOne(id) {
    await dequeue(id);
    await reload();
    onChanged?.();
  }

  async function handleRetryAll() {
    setWorking(true);
    try { await onRetryAll?.(); await reload(); } finally { setWorking(false); }
  }

  async function handleDiscardAll() {
    setWorking(true);
    try { await onDiscardAll?.(); await reload(); onClose?.(); } finally { setWorking(false); }
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:10010,
      background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={{
        background:'white', borderRadius:18, boxShadow:'0 24px 80px rgba(0,0,0,0.22)',
        width:'100%', maxWidth:520, maxHeight:'80vh',
        display:'flex', flexDirection:'column',
        overflow:'hidden',
      }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px 14px', borderBottom:'1px solid rgba(0,0,0,0.07)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(220,38,38,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:G.text }}>Operaciones fallidas</div>
              <div style={{ fontSize:11, color:G.textFaint }}>
                {loading ? 'Cargando...' : `${ops.length} operación${ops.length !== 1 ? 'es' : ''} pendiente${ops.length !== 1 ? 's' : ''} de resolver`}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, borderRadius:8, border:'none', background:'rgba(0,0,0,0.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={G.textMid} strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 20px', display:'flex', flexDirection:'column', gap:8 }}>
          {loading ? (
            <div style={{ textAlign:'center', color:G.textFaint, fontSize:13, padding:'24px 0' }}>Cargando operaciones...</div>
          ) : ops.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={G.teal} strokeWidth="1.5" style={{ marginBottom:10 }}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <div style={{ fontSize:14, fontWeight:600, color:G.text }}>Todo sincronizado</div>
              <div style={{ fontSize:12, color:G.textFaint }}>No hay operaciones fallidas.</div>
            </div>
          ) : (
            ops.map(op => (
              <OpRow
                key={op.id}
                op={op}
                onRetry={handleRetryOne}
                onDiscard={handleDiscardOne}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {ops.length > 1 && (
          <div style={{ display:'flex', gap:10, padding:'12px 20px 16px', borderTop:'1px solid rgba(0,0,0,0.07)', flexShrink:0 }}>
            <button
              onClick={handleDiscardAll}
              disabled={working}
              style={{ flex:1, padding:'9px', borderRadius:10, border:'1px solid rgba(0,0,0,0.12)', background:'rgba(255,255,255,0.8)', color:G.textMid, fontSize:13, fontWeight:600, cursor:'pointer', opacity: working ? 0.5 : 1 }}>
              Descartar todas
            </button>
            <button
              onClick={handleRetryAll}
              disabled={working}
              style={{ flex:1, padding:'9px', borderRadius:10, border:'none', background:G.teal, color:'white', fontSize:13, fontWeight:700, cursor:'pointer', opacity: working ? 0.5 : 1 }}>
              Reintentar todas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
