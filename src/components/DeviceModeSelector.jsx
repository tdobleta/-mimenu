// components/DeviceModeSelector.jsx
// Full-screen selector shown when no device mode is set.
// Pure UI — no Supabase calls, no side effects beyond calling setMode.
// Filters available modes by user role — device mode is UX only,
// never grants permissions.

import { useEffect, useRef } from 'react';
import { useDeviceMode, VALID_MODES, MODE_LABELS } from '@/lib/DeviceModeContext';
import useUserRole from '@/lib/useUserRole';

// Which device modes each role may choose.
// This is UX convenience — RoleGuard + RLS remain the real security layer.
export const MODES_BY_ROLE = {
  Dueno:     ['admin', 'cashier', 'pos', 'kds', 'stock'],
  Encargado: ['admin', 'cashier', 'pos', 'kds', 'stock'],
  Mozo:      ['pos'],
  Cocinero:  ['kds'],
};

const MODE_CARDS = [
  {
    mode: 'admin',
    desc: 'Panel completo con reportes, configuración y control total.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    mode: 'cashier',
    desc: 'Caja registradora, cobros y cierre de turno.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
      </svg>
    ),
  },
  {
    mode: 'pos',
    desc: 'Salón, mesas, comandas y cobro rápido.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    mode: 'kds',
    desc: 'Display de cocina con comandas en tiempo real.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
        <line x1="6" y1="17" x2="18" y2="17" />
      </svg>
    ),
  },
  {
    mode: 'stock',
    desc: 'Inventario, recetas y movimientos de stock.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

export default function DeviceModeSelector({ onSelect }) {
  const { setMode } = useDeviceMode();
  const role = useUserRole();
  const allowedModes = MODES_BY_ROLE[role] || [];
  const cards = MODE_CARDS.filter(c => allowedModes.includes(c.mode));
  const autoSelected = useRef(false);

  const handleSelect = (mode) => {
    setMode(mode);
    onSelect?.(mode);
  };

  // Auto-select when only one mode is available (e.g. Mozo → pos).
  // Uses useEffect to avoid side effects during render.
  useEffect(() => {
    if (cards.length === 1 && !autoSelected.current) {
      autoSelected.current = true;
      handleSelect(cards[0].mode);
    }
  }, [cards.length]);

  // Nothing to show — role guards handle access upstream
  if (cards.length <= 1) return null;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F6F8FA',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: 20,
    }}>
      <div style={{ maxWidth: 640, width: '100%', textAlign: 'center' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px',
            fontFamily: "'Playfair Display', Georgia, serif",
            color: '#0F172A', marginBottom: 8,
          }}>
            mi<span style={{ color: '#1D9E75' }}>menu</span>
          </div>
          <h1 style={{
            fontSize: 20, fontWeight: 700, color: '#0F172A',
            margin: '0 0 6px',
          }}>
            Modo de dispositivo
          </h1>
          <p style={{ fontSize: 14, color: '#6B7280', margin: 0, lineHeight: 1.5 }}>
            Seleccioná el modo de uso para este dispositivo. No cambia tus permisos.
          </p>
        </div>

        {/* Mode cards grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}>
          {cards.map(({ mode, desc, icon }) => (
            <button
              key={mode}
              data-testid={`mode-card-${mode}`}
              onClick={() => handleSelect(mode)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                padding: '20px 16px',
                background: '#FFFFFF',
                border: '1.5px solid #E5E7EB',
                borderRadius: 14,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textAlign: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#1D9E75';
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(29,158,117,0.12)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E5E7EB';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'rgba(29,158,117,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#1D9E75',
              }}>
                {icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                  {MODE_LABELS[mode]}
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>
                  {desc}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Hint */}
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
          El modo es solo una preferencia de navegación. Los permisos dependen de tu rol.
        </p>
      </div>
    </div>
  );
}
