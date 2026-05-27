import { useEffect, useRef } from 'react';
import { modalWidth } from '@/lib/glass';

// ── ResponsiveModal ──────────────────────────────────────────────────────────
// Modal responsive reutilizable. Reemplaza el patrón repetido de:
//   position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', width:XXX
//
// Props:
//   maxW     — ancho máximo en px (ej: 460). Se aplica con min(maxW, 95vw)
//   onClose  — callback para cerrar (click fuera + Escape)
//   children — contenido del modal
//   style    — estilos extra para el panel interior
//   zIndex   — default 200

export default function ResponsiveModal({ maxW = 460, onClose, children, style = {}, zIndex = 200 }) {
  const panelRef = useRef(null);

  // Cerrar con Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Click fuera del panel cierra
  const handleBackdrop = (e) => {
    if (panelRef.current && !panelRef.current.contains(e.target) && onClose) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(8px)',
        padding: 'clamp(8px, 2vw, 16px)',
      }}
    >
      <div
        ref={panelRef}
        style={{
          ...modalWidth(maxW),
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.8)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.3)',
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}
