import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useStore } from '@/lib/store';
import { countActive, countFailed } from '@/lib/offlineQueue';
import { loadAfipSettings } from '@/lib/afip';
import { buildJornadaAuditReport } from '@/lib/jornadaAudit';
import { getPrinterConfig } from '@/lib/printer';
import { getRelayConfig, localRelay } from '@/lib/localRelay';
import { G } from '@/lib/glass';

const STATUS = {
  ok: { label: 'OK', color: '#1D9E75', bg: '#E8F7F2' },
  warning: { label: 'Revisar', color: '#D97706', bg: '#FEF3C7' },
  critical: { label: 'Bloqueante', color: '#DC2626', bg: '#FEE2E2' },
};

const SUMMARY = {
  ready: {
    title: 'Listo para abrir jornada',
    detail: 'Los puntos criticos estan cubiertos.',
    color: '#1D9E75',
    bg: '#E8F7F2',
  },
  ready_with_warnings: {
    title: 'Operable con advertencias',
    detail: 'No hay bloqueantes, pero conviene revisar los avisos antes del pico.',
    color: '#D97706',
    bg: '#FEF3C7',
  },
  blocked: {
    title: 'No abrir sin corregir',
    detail: 'Hay bloqueantes que pueden romper la jornada o dejar datos inconsistentes.',
    color: '#DC2626',
    bg: '#FEE2E2',
  },
};

async function countRows(table, branchId) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .eq('activo', true);
  if (error) throw error;
  return count || 0;
}

async function loadMpStatus(restaurantId) {
  const { data, error } = await supabase.functions.invoke('mp-settings', {
    body: { action: 'load', restaurantId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return {
    accessToken: Boolean(data?.credentials?.mp_access_token),
    deviceId: Boolean(data?.config?.mp_device_id),
  };
}

async function loadAfipStatus(restaurantId) {
  const data = await loadAfipSettings(restaurantId);
  const credentials = data.credentials || {};
  return {
    enabled: Boolean(data.config?.habilitado),
    credentialsReady: Boolean(credentials.usertoken && credentials.tokenclient && credentials.apitoken),
  };
}

async function loadStorageStatus() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return { supported: false, persisted: false };
  }
  const persisted = await navigator.storage.persisted();
  return { supported: true, persisted };
}

function Pill({ status }) {
  const s = STATUS[status] || STATUS.warning;
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 800,
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

export default function JornadaAuditTab() {
  const store = useStore();
  const activeBranchId = store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id;
  const [remote, setRemote] = useState({
    staffPinsCount: 0,
    kitchenDevicesCount: 0,
    printer: {},
    relay: {},
    storage: {},
    mp: {},
    afip: {},
    offline: {},
  });
  const [loading, setLoading] = useState(true);
  const [lastRun, setLastRun] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!store.restaurantId || !activeBranchId) {
      setRemote({ staffPinsCount: 0, kitchenDevicesCount: 0, printer: {}, relay: {}, storage: {}, mp: {}, afip: {}, offline: {} });
      setLoading(false);
      setLastRun(Date.now());
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [
        staffPinsCount,
        kitchenDevicesCount,
        active,
        failed,
        mp,
        afip,
        storage,
      ] = await Promise.all([
        countRows('staff_pins', activeBranchId).catch(() => 0),
        countRows('device_tokens', activeBranchId).catch(() => 0),
        countActive().catch(() => 0),
        countFailed().catch(() => 0),
        loadMpStatus(store.restaurantId).catch(() => ({})),
        loadAfipStatus(store.restaurantId).catch(() => ({})),
        loadStorageStatus().catch(() => ({ supported: false, persisted: false })),
      ]);

      const printer = getPrinterConfig();
      const relayConfig = getRelayConfig();
      setRemote({
        staffPinsCount,
        kitchenDevicesCount,
        printer,
        relay: { ...relayConfig, connected: Boolean(localRelay.isConnected) },
        storage,
        mp,
        afip,
        offline: { active, failed },
      });
      setLastRun(Date.now());
    } catch (err) {
      setError(err.message || 'No se pudo completar la auditoria.');
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, store.restaurantId]);

  useEffect(() => { refresh(); }, [refresh]);

  const report = useMemo(() => buildJornadaAuditReport({
    sucursales: store.sucursales || [],
    activeBranchId,
    tables: activeBranchId ? (store.tables?.[activeBranchId] || []) : [],
    menuItems: activeBranchId ? (store.menuItems?.[activeBranchId] || []) : [],
    turnoActivo: store.turnoActivo,
    teamMembers: store.teamMembers || [],
    stockItems: activeBranchId ? (store.stock?.[activeBranchId] || []) : [],
    staffPinsCount: remote.staffPinsCount,
    kitchenDevicesCount: remote.kitchenDevicesCount,
    printer: remote.printer,
    relay: remote.relay,
    storage: remote.storage,
    mp: remote.mp,
    afip: remote.afip,
    offline: remote.offline,
    isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  }), [activeBranchId, remote, store]);

  const summary = SUMMARY[report.status] || SUMMARY.blocked;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 920 }}>
      <div style={{
        background: summary.bg,
        border: `1px solid ${summary.color}33`,
        borderRadius: 12,
        padding: 18,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 14,
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: summary.color, marginBottom: 4 }}>
            {summary.title}
          </div>
          <div style={{ fontSize: 13, color: G.textMid, lineHeight: '20px' }}>
            {summary.detail}
          </div>
          <div style={{ fontSize: 11, color: G.textMuted, marginTop: 8 }}>
            {lastRun ? `Ultima auditoria: ${new Date(lastRun).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : 'Sin ejecutar'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: summary.color, lineHeight: 1 }}>
            {report.score}%
          </div>
          <div style={{ fontSize: 11, color: G.textMuted, marginTop: 4 }}>preparacion</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: 8,
            background: loading ? '#9CA3AF' : '#1D9E75',
            color: 'white',
            fontSize: 13,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}>
          {loading ? 'Auditando...' : 'Actualizar auditoria'}
        </button>
        <span style={{ fontSize: 12, color: G.textMuted }}>
          {report.critical} bloqueante(s) - {report.warning} advertencia(s) - {report.ok} listo(s)
        </span>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        {report.checks.map(check => (
          <div key={check.id} style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            gap: 12,
            padding: '13px 16px',
            borderBottom: '1px solid #F1F5F9',
            alignItems: 'start',
          }}>
            <div><Pill status={check.status} /></div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: G.text, marginBottom: 3 }}>{check.label}</div>
              <div style={{ fontSize: 12, color: G.textMid, lineHeight: '18px' }}>{check.detail}</div>
              {check.status !== 'ok' && check.action && (
                <div style={{ fontSize: 12, color: STATUS[check.status].color, fontWeight: 700, marginTop: 5 }}>
                  {check.action}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {report.lowStock.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 8 }}>Ingredientes bajo minimo</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {report.lowStock.slice(0, 12).map(item => (
              <span key={item.id || item.nombre} style={{
                fontSize: 12,
                color: '#92400E',
                background: '#FEF3C7',
                borderRadius: 99,
                padding: '4px 8px',
              }}>
                {item.nombre || item.name}: {item.actual ?? 0}/{item.minimo ?? 0}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
