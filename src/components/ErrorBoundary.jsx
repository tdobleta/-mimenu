import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[mimenú] Error no manejado:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F6F8FA',
        fontFamily: "'DM Sans', sans-serif",
        padding: 24,
      }}>
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 40,
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          border: '0.5px solid rgba(0,0,0,0.08)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#FEE2E2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
            Algo salió mal
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', lineHeight: '20px', marginBottom: 24 }}>
            Ocurrió un error inesperado. Podés intentar recargar la página.
            Si el problema persiste, contactá soporte.
          </div>
          {this.state.error && (
            <div style={{
              background: '#F9FAFB',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 20,
              textAlign: 'left',
              fontSize: 11,
              color: '#9CA3AF',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}>
              {this.state.error.message}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              backgroundColor: '#1D9E75',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: 500,
            }}>
            Recargar página
          </button>
        </div>
      </div>
    );
  }
}
