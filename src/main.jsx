import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import ErrorBoundary from '@/components/ErrorBoundary'
import { queryClientInstance } from '@/lib/query-client'

// Exponer queryClient globalmente para que AuthContext pueda limpiarlo en logout
window.__queryClient__ = queryClientInstance;

window.addEventListener('unhandledrejection', (event) => {
  console.error('[mimenú] Promise no manejada:', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('[mimenú] Error global:', event.error);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
