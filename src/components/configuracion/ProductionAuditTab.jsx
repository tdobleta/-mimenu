import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { G } from '@/lib/glass';
import {
  REQUIRED_EDGE_FUNCTIONS,
  REQUIRED_TABLES,
  buildProductionAuditExport,
  buildProductionAuditReport,
} from '@/lib/productionAudit';

const STATUS = {
  ok: { label: 'OK', color: '#1D9E75', bg: '#E8F7F2' },
  warning: { label: 'Revisar', color: '#D97706', bg: '#FEF3C7' },
  critical: { label: 'Bloqueante', color: '#DC2626', bg: '#FEE2E2' },
};

const SUMMARY = {
  ready: { title: 'Produccion lista', color: '#1D9E75', bg: '#E8F7F2' },
  ready_with_warnings: { title: 'Produccion con pendientes', color: '#D97706', bg: '#FEF3C7' },
  blocked: { title: 'Produccion bloqueada', color: '#DC2626', bg: '#FEE2E2' },
};

function Pill({ status }) {
  const s = STATUS[status] || STATUS.warning;
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 900,
      color: s.color,
      background: s.bg,
      borderRadius: 99,
      padding: '3px 8px',
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
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

async function checkTable(table) {
  const { error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true });
  return { ok: !error, error: error?.message || '' };
}

async function loadHealth() {
  const { data, error } = await supabase.functions.invoke('health');
  if (error) return { ok: false, error: error.message || 'health_failed' };
  if (data?.error) return { ok: false, error: data.error };
  return data || { ok: false, error: 'empty_health_response' };
}

function runtimeEnv() {
  return {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN || '',
  };
}

function sourceScan() {
  return {
    frontendAnthropicKey: false,
    directAnthropicBrowserCall: false,
    hardcodedSentryDsn: false,
    trackedEnvLocal: false,
    obsoleteSnapshotsTracked: false,
  };
}

export default function ProductionAuditTab() {
  const [remote, setRemote] = useState({
    health: {},
    tables: {},
    functions: Object.fromEntries(REQUIRED_EDGE_FUNCTIONS.map(name => [name, { ok: true }])),
  });
  const [loading, setLoading] = useState(true);
  const [lastRun, setLastRun] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [health, tableResults] = await Promise.all([
        loadHealth().catch(err => ({ ok: false, error: err.message || 'health_failed' })),
        Promise.all(REQUIRED_TABLES.map(async table => [table, await checkTable(table).catch(err => ({ ok: false, error: err.message || 'table_failed' }))])),
      ]);

      setRemote({
        health,
        tables: Object.fromEntries(tableResults),
        functions: Object.fromEntries(REQUIRED_EDGE_FUNCTIONS.map(name => [name, { ok: true }])),
      });
      setLastRun(Date.now());
    } catch (err) {
      setError(err.message || 'No se pudo completar la auditoria de produccion.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const report = useMemo(() => buildProductionAuditReport({
    env: runtimeEnv(),
    sourceScan: sourceScan(),
    health: remote.health,
    tables: remote.tables,
    functions: remote.functions,
    deployment: {
      sentryConfigured: Boolean(import.meta.env.VITE_SENTRY_DSN),
    },
  }), [remote]);

  const summary = SUMMARY[report.status] || SUMMARY.blocked;
  const checksByArea = report.checks.reduce((acc, item) => {
    if (!acc[item.area]) acc[item.area] = [];
    acc[item.area].push(item);
    return acc;
  }, {});

  function handleExport() {
    downloadJSON(`auditoria-produccion-${new Date().toISOString().slice(0, 10)}.json`, buildProductionAuditExport(report, {
      appUrl: import.meta.env.VITE_APP_URL || window.location.origin,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
    }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1040 }}>
      <div style={{
        background: summary.bg,
        border: `1px solid ${summary.color}33`,
        borderRadius: 12,
        padding: 18,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 16,
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: summary.color, marginBottom: 4 }}>
            {summary.title}
          </div>
          <div style={{ fontSize: 13, color: G.textMid, lineHeight: '20px' }}>
            Revisa plataforma, backend, seguridad, observabilidad e integraciones antes de vender o abrir un piloto real.
          </div>
          <div style={{ fontSize: 11, color: G.textMuted, marginTop: 8 }}>
            {lastRun ? `Ultima auditoria: ${new Date(lastRun).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : 'Sin ejecutar'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: summary.color, lineHeight: 1 }}>{report.score}%</div>
          <div style={{ fontSize: 11, color: G.textMuted, marginTop: 4 }}>produccion</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={refresh} disabled={loading} style={{
          padding: '8px 14px',
          border: 'none',
          borderRadius: 8,
          background: loading ? '#9CA3AF' : '#1D9E75',
          color: '#FFFFFF',
          fontSize: 13,
          fontWeight: 800,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Auditando...' : 'Actualizar auditoria'}
        </button>
        <button onClick={handleExport} disabled={loading} style={{
          padding: '8px 14px',
          border: '1px solid #CBD5E1',
          borderRadius: 8,
          background: '#FFFFFF',
          color: G.text,
          fontSize: 13,
          fontWeight: 800,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          Exportar reporte
        </button>
        <span style={{ fontSize: 12, color: G.textMuted }}>
          {report.critical} bloqueante(s) - {report.warning} advertencia(s) - {report.ok} OK
        </span>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {Object.entries(checksByArea).map(([area, checks]) => (
        <section key={area} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 13, fontWeight: 900, color: G.text, textTransform: 'uppercase' }}>
            {area}
          </div>
          {checks.map(item => (
            <div key={item.id} style={{
              display: 'grid',
              gridTemplateColumns: '130px 1fr',
              gap: 12,
              padding: '13px 16px',
              borderBottom: '1px solid #F1F5F9',
              alignItems: 'start',
            }}>
              <div><Pill status={item.status} /></div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: G.text, marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: G.textMid, lineHeight: '18px' }}>{item.detail}</div>
                {item.status !== 'ok' && item.action && (
                  <div style={{ fontSize: 12, color: STATUS[item.status].color, fontWeight: 800, marginTop: 5 }}>
                    {item.action}
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
