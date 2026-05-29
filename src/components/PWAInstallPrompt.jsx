// components/PWAInstallPrompt.jsx
// Floating install banner for Chrome/Edge/Android + iOS guide dialog.
// Renders in Layout.jsx — only visible on Layout-wrapped routes.
// Not shown on /cocina, /pos, public routes, or login (all outside Layout).

import { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import * as DialogPrimitive from '@radix-ui/react-dialog';

// ── iOS Install Guide Dialog ─────────────────────────────────────────
function IOSInstallGuide({ open, onClose }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }} />
        <DialogPrimitive.Content style={{
          position: 'fixed', left: '50%', top: '50%', zIndex: 10001,
          transform: 'translate(-50%, -50%)',
          background: '#FFFFFF', borderRadius: 16,
          padding: 'clamp(20px, 5vw, 32px)',
          maxWidth: 400, width: 'calc(100% - 40px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(29,158,117,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px', color: '#1D9E75',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
              Instalar mimenú
            </div>
            <div style={{ fontSize: 13, color: '#6B7280' }}>
              Seguí estos pasos en Safari:
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
            {/* Step 1 */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: '#1D9E75', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>1</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
                  Tocá el ícono de Compartir
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  El cuadrado con la flecha hacia arriba, en la barra del navegador.
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: '#1D9E75', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>2</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
                  Elegí "Agregar a pantalla de inicio"
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  Desplazá las opciones hasta encontrarlo.
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: '#1D9E75', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>3</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
                  Tocá "Agregar"
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  mimenú aparecerá en tu pantalla de inicio.
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '10px 0', border: 'none', borderRadius: 10,
              background: '#1D9E75', color: 'white',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Entendido
          </button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ── Install Prompt Banner ────────────────────────────────────────────
export default function PWAInstallPrompt() {
  const { canInstall, showIOSGuide, promptInstall, dismiss } = usePWAInstall();
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  if (!canInstall && !showIOSGuide) return null;

  const handleIOSClose = () => {
    setIosGuideOpen(false);
    dismiss();
  };

  return (
    <>
      <div
        data-testid="pwa-install-banner"
        style={{
          position: 'fixed', bottom: 20, left: 20, zIndex: 9998,
          background: '#FFFFFF', border: '1px solid #E2E8F0',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', borderRadius: 12,
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
          maxWidth: 360, fontSize: 13,
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        {/* App icon */}
        <img
          src="/icons/icon-192x192.png"
          alt="mimenú"
          width={36}
          height={36}
          style={{ borderRadius: 8, flexShrink: 0 }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>
            {canInstall ? 'Instalá mimenú' : 'Agregá mimenú a inicio'}
          </div>
          <div style={{ color: '#64748B', fontSize: 12 }}>
            Acceso directo desde tu pantalla.
          </div>
        </div>

        {/* Action button */}
        {canInstall ? (
          <button
            data-testid="pwa-install-btn"
            onClick={promptInstall}
            style={{
              padding: '7px 14px', border: 'none', borderRadius: 8,
              background: '#1D9E75', color: 'white', fontSize: 12,
              fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Instalar
          </button>
        ) : (
          <button
            data-testid="pwa-ios-guide-btn"
            onClick={() => setIosGuideOpen(true)}
            style={{
              padding: '7px 14px', border: 'none', borderRadius: 8,
              background: '#1D9E75', color: 'white', fontSize: 12,
              fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Ver cómo
          </button>
        )}

        {/* Dismiss */}
        <button
          data-testid="pwa-dismiss-btn"
          onClick={dismiss}
          title="Cerrar"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#9CA3AF', padding: 2, display: 'flex', flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* iOS guide dialog */}
      {showIOSGuide && (
        <IOSInstallGuide open={iosGuideOpen} onClose={handleIOSClose} />
      )}
    </>
  );
}
