import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import ErrorBoundary from '@/components/ErrorBoundary'
import { queryClientInstance } from '@/lib/query-client'
import * as Sentry from '@sentry/react'

// ── Sentry — error tracking en producción ────────────────────
Sentry.init({
  dsn: 'https://583b3ef8154c7ae096c6e9f07636bbc0@o4511389456728064.ingest.us.sentry.io/4511389511057409',
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD, // Solo en producción, no en dev
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary fallback={<ErrorBoundary />}>
    <App />
  </Sentry.ErrorBoundary>
)
