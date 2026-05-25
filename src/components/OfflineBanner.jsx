import { useState, useEffect } from 'react';
import { useOfflineSync } from '@/lib/offlineSync';
import { useStore } from '@/lib/store';

const S = {
  base: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
    padding: '8px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },
};

function Btn({ onClick, children, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background: 'rgba(255,255,255,0.20)', border: '1px solid rgba(255,255,255,0.40)',
      borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700,
      color: 'white', cursor: 'pointer', flexShrink: 0, ...style,
    }}>
      {children}
    </button>
  );
}

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBack, setShowBack] = useState(false);
  const { pending, failed, syncing, sync, dismissFailed, retryAllFailed } = useOfflineSync();
  const { isOfflineMode } = useStore();

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setShowBack(true);
      setTimeout(() => setShowBack(false), 4000);
    }
    function handleOffline() {
      setIsOnline(false);
      setShowBack(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Operaciones fallidas (dead letters) — visible siempre que haya ──────────
  if (failed > 0) return (
    <div style={{ ...S.base, background: '#DC2626', color: 'white', flexWrap: 'wrap' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>
        {failed === 1
          ? '1 operación falló permanentemente'
          : `${failed} operaciones fallaron permanentemente`}
        {' — revisalas antes de seguir operando.'}
      </span>
      <Btn onClick={retryAllFailed}>Reintentar</Btn>
      <Btn onClick={dismissFailed}>Descartar</Btn>
    </div>
  );

  // ── Sincronizando o pendientes online ─────────────────────────────────────
  const showSyncBanner = isOnline && (syncing || pending > 0);
  if (showSyncBanner) return (
    <div style={{ ...S.base, background: syncing ? '#F97316' : '#3B82F6', color: 'white' }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      {syncing && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"
          style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      )}
      <span>
        {syncing
          ? `Sincronizando ${pending} operación${pending !== 1 ? 'es' : ''} pendiente${pending !== 1 ? 's' : ''}...`
          : `${pending} operación${pending !== 1 ? 'es' : ''} pendiente${pending !== 1 ? 's' : ''} de sincronizar`}
      </span>
      {!syncing && isOnline && (
        <Btn onClick={sync}>Sincronizar ahora</Btn>
      )}
    </div>
  );

  // ── Reconexión ────────────────────────────────────────────────────────────
  if (isOnline && showBack) return (
    <div style={{ ...S.base, background: '#1D9E75', color: 'white' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Conexión restaurada
    </div>
  );

  // ── Modo offline forzado (arrancó sin internet desde snapshot) ─────────────
  if (isOfflineMode) return (
    <div style={{ ...S.base, padding: '10px 16px', background: '#D97706', color: 'white' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{ flexShrink: 0 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>Modo offline — datos desde caché. Cobros manuales quedan pendientes de sincronizar.</span>
    </div>
  );

  // ── Sin internet ──────────────────────────────────────────────────────────
  if (!isOnline) return (
    <div style={{ ...S.base, background: '#EF4444', color: 'white' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
      Sin conexión — algunas funciones no están disponibles
    </div>
  );

  return null;
}
