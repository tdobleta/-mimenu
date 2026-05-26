import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import ErrorBoundary from '@/components/ErrorBoundary'
import { queryClientInstance } from '@/lib/query-client'
import * as Sentry from '@sentry/react'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

// ── Sentry — error tracking en producción ────────────────────
Sentry.init({
  dsn: SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: Boolean(SENTRY_DSN) && import.meta.env.PROD, // Solo en produccion cuando el ambiente lo configura.
  tracesSampleRate: 0.2,         // 20% de transacciones
  sendDefaultPii: false,         // No enviar datos personales
  beforeSend(event) {
    // No enviar errores de red esperados (offline)
    if (event.exception?.values?.[0]?.value?.includes('NetworkError')) return null;
    if (event.exception?.values?.[0]?.value?.includes('Failed to fetch')) return null;
    return event;
  },
});

// ── Exponer queryClient para logout cleanup ───────────────────
window.__queryClient__ = queryClientInstance;

// ── Captura global de errores ─────────────────────────────────
window.addEventListener('unhandledrejection', (event) => {
  console.error('[mimenú] Promise no manejada:', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('[mimenú] Error global:', event.error);
});

// Fallback de Sentry.ErrorBoundary: función para recibir el error y mostrarlo.
// IMPORTANTE: NO usar <ErrorBoundary /> sin children aquí — rendería null (pantalla blanca).
function SentryFallback({ error }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#F6F8FA', fontFamily: "'DM Sans', sans-serif", padding: 24,
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: 40, maxWidth: 440, width: '100%',
        textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEE2E2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Algo salió mal</div>
        <div style={{ fontSize: 13, color: '#6B7280', lineHeight: '20px', marginBottom: 16 }}>
          Error crítico. Recargá la página. Si persiste, puede haber una nueva versión disponible.
        </div>
        {error && (
          <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '8px 12px', marginBottom: 20,
            textAlign: 'left', fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {error.message || String(error)}
          </div>
        )}
        <button onClick={() => window.location.reload()}
          style={{ padding: '10px 24px', backgroundColor: '#1D9E75', color: 'white',
            border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>
          Recargar página
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary fallback={SentryFallback}>
    <App />
  </Sentry.ErrorBoundary>
)
