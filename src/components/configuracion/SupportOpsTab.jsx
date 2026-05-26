import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useStore } from '@/lib/store';
import { getActive, getFailed } from '@/lib/offlineQueue';
import { drainQueue } from '@/lib/offlineSync';
import { buildSupportOpsSnapshot } from '@/lib/supportOps';
import { G } from '@/lib/glass';

const STATUS = {
  applied: { label: 'Aplicada', color: '#1D9E75', bg: '#E8F7F2' },
  processing: { label: 'Procesando', color: '#D97706', bg: '#FEF3C7' },
  failed: { label: 'Fallida', color: '#DC2626', bg: '#FEE2E2' },
  unknown: { label: 'Desconocida', color: '#64748B', bg: '#F1F5F9' },
};

function fmtDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Pill({ status }) {
  const s = STATUS[status] || STATUS.unknown;
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color: s.color, background: s.bg, borderRadius: 99, padding: '3px 8px', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function Stat({ label, value, tone = 'neutral' }) {
  const color = tone === 'danger' ? '#DC2626' : tone === 'warn' ? '#D97706' : tone === 'ok' ? '#1D9E75' : G.text;
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: G.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SupportOpsTab() {
  const store = useStore();
  const activeBranchId = store.branchId !== 'todas' ? store.branchId : store.sucursales?.[0]?.id;
  const [businessOps, setBusinessOps] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeQueue, setActiveQueue] = useState([]);
  const [failedQueue, setFailedQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let opsQuery = supabase
        .from('business_operations')
        .select('id,operation_id,operation_type,status,turn_id,caja_shift_id,created_at,applied_at,last_error,result')
        .eq('restaurant_id', store.restaurantId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (activeBranchId) opsQuery = opsQuery.eq('branch_id', activeBranchId);

      const auditQuery = supabase
        .from('audit_logs')
        .select('*')
        .eq('restaurant_id', store.restaurantId)
        .order('ts', { ascending: false })
        .limit(50);

      const [opsRes, auditRes, active, failed] = await Promise.all([
        store.restaurantId ? opsQuery : Promise.resolve({ data: [] }),
        store.restaurantId ? auditQuery : Promise.resolve({ data: [] }),
        getActive().catch(() => []),
        getFailed().catch(() => []),
      ]);

      if (opsRes.error) throw opsRes.error;
      if (auditRes.error) throw auditRes.error;
      setBusinessOps(opsRes.data || []);
      setAuditLogs(auditRes.data || []);
      setActiveQueue(active || []);
      setFailedQueue(failed || []);
      setLastRun(Date.now());
    } catch (err) {
      setError(err.message || 'No se pudo cargar soporte operativo.');
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, store.restaurantId]);

  useEffect(() => { refresh(); }, [refresh]);

  const snapshot = useMemo(() => buildSupportOpsSnapshot({
    businessOperations: businessOps,
    auditLogs,
    activeQueue,
    failedQueue,
  }), [businessOps, auditLogs, activeQueue, failedQueue]);

  async function handleSync() {
    if (!navigator.onLine) {
      setError('El navegador esta offline. No se puede sincronizar ahora.');
      return;
    }
    setSyncing(true);
    setError('');
    try {
      await drainQueue();
      await refresh();
    } catch (err) {
      setError(err.message || 'No se pudo sincronizar la cola.');
    } finally {
      setSyncing(false);
    }
  }

  function handleExport() {
    const branchName = snapshot?.latest_business_operations?.[0]?.branch_id || activeBranchId || 'sucursal';
    const date = new Date().toISOString().slice(0, 10);
    downloadJSON(`soporte-operativo-${branchName}-${date}.json`, snapshot);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1040 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(120px, 1fr))', gap: 10 }}>
        <Stat label="Ops negocio" value={snapshot.summary.business_operations} />
        <Stat label="Ops fallidas" value={snapshot.summary.business_failed} tone={snapshot.summary.business_failed ? 'danger' : 'ok'} />
        <Stat label="Cola activa" value={snapshot.summary.offline_active} tone={snapshot.summary.offline_active ? 'warn' : 'ok'} />
        <Stat label="Dead letters" value={snapshot.summary.offline_failed} tone={snapshot.summary.offline_failed ? 'danger' : 'ok'} />
        <Stat label="Audit logs" value={snapshot.summary.audit_logs} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={refresh} disabled={loading || syncing} style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: '#1D9E75', color: '#FFF', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: loading || syncing ? 0.6 : 1 }}>
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
        <button onClick={handleSync} disabled={loading || syncing} style={{ padding: '8px 14px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#FFFFFF', color: G.text, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: loading || syncing ? 0.6 : 1 }}>
          {syncing ? 'Sincronizando...' : 'Sincronizar cola'}
        </button>
        <button onClick={handleExport} disabled={loading} style={{ padding: '8px 14px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#FFFFFF', color: G.text, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
          Exportar snapshot
        </button>
        <span style={{ fontSize: 12, color: G.textMuted }}>
          {lastRun ? `Ultima lectura: ${new Date(lastRun).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : 'Sin lectura'}
        </span>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          {error}
        </div>
      )}

      <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 14, fontWeight: 900, color: G.text }}>Operaciones de negocio recientes</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                {['Estado', 'Tipo', 'Operacion', 'Turno', 'Creada', 'Aplicada', 'Error'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', color: G.textMuted, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {businessOps.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 22, textAlign: 'center', color: G.textMuted }}>{loading ? 'Cargando...' : 'Sin operaciones registradas.'}</td></tr>
              ) : businessOps.map(op => (
                <tr key={op.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '9px 12px' }}><Pill status={op.status} /></td>
                  <td style={{ padding: '9px 12px', fontWeight: 800, color: G.text }}>{op.operation_type}</td>
                  <td style={{ padding: '9px 12px', color: G.textMid, fontFamily: 'monospace' }}>{op.operation_id}</td>
                  <td style={{ padding: '9px 12px', color: G.textMuted, fontFamily: 'monospace' }}>{op.turn_id || '-'}</td>
                  <td style={{ padding: '9px 12px', color: G.textMuted }}>{fmtDate(op.created_at)}</td>
                  <td style={{ padding: '9px 12px', color: G.textMuted }}>{fmtDate(op.applied_at)}</td>
                  <td style={{ padding: '9px 12px', color: '#991B1B', maxWidth: 220, wordBreak: 'break-word' }}>{op.last_error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 14, fontWeight: 900, color: G.text }}>Cola offline local</div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...failedQueue, ...activeQueue].slice(0, 12).map(op => (
              <div key={op.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: op.status === 'failed' ? '#FEF2F2' : '#F8FAFC' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 12, color: G.text }}>{op.type || 'UNKNOWN'}</strong>
                  <span style={{ fontSize: 11, color: G.textMuted }}>{op.status === 'failed' ? 'failed' : 'pending'}</span>
                </div>
                <div style={{ fontSize: 11, color: op.status === 'failed' ? '#991B1B' : G.textMuted, marginTop: 4, wordBreak: 'break-word' }}>
                  {op.lastError || op.id}
                </div>
              </div>
            ))}
            {activeQueue.length + failedQueue.length === 0 && <div style={{ color: G.textMuted, fontSize: 13 }}>Sin operaciones locales pendientes.</div>}
          </div>
        </section>

        <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 14, fontWeight: 900, color: G.text }}>Audit logs recientes</div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {auditLogs.slice(0, 12).map(row => (
              <div key={row.id} style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 12, color: G.text }}>{row.accion || '-'}</strong>
                  <span style={{ fontSize: 11, color: G.textMuted }}>{fmtDate(row.ts || row.created_at)}</span>
                </div>
                <div style={{ fontSize: 11, color: G.textMuted, marginTop: 3 }}>{row.categoria || 'Sistema'} - {row.usuario || row.usuario_email || 'Sistema'}</div>
                {row.detalle && <div style={{ fontSize: 12, color: G.textMid, marginTop: 3 }}>{row.detalle}</div>}
              </div>
            ))}
            {auditLogs.length === 0 && <div style={{ color: G.textMuted, fontSize: 13 }}>Sin auditoria reciente.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
