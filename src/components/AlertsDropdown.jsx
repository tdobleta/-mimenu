import { useEffect, useRef } from 'react';

export default function AlertsDropdown({ alerts = [], onClose }) {
  const ref = useRef();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-8 bg-white z-50"
      style={{ width: 300, border: '0.5px solid hsl(var(--border))', borderRadius: 6 }}>
      <div className="px-3 py-2" style={{ borderBottom: '0.5px solid hsl(var(--border))', fontSize: 12, fontWeight: 500 }}>
        Notificaciones
      </div>
      <div className="max-h-64 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="px-3 py-4 text-center" style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)' }}>
            No hay alertas
          </div>
        ) : (
          alerts.map(a => (
            <div key={a.id} className="px-3 py-2.5" style={{ borderBottom: '0.5px solid hsl(var(--border))' }}>
              <p style={{ fontSize: 12, lineHeight: '16px' }}>{a.mensaje}</p>
              <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 2 }}>
                {new Date(a.created_date).toLocaleDateString('es-AR')}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


