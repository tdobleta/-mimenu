// components/pin/PinSelector.jsx
// Pantalla de selección de mozo + teclado PIN 4 dígitos.
// Se muestra como overlay completo cuando no hay activeStaff.

import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { G, fontDisplay } from '@/lib/glass';

const FONT = "'DM Sans', system-ui, sans-serif";

function AvatarCircle({ nombre, size = 44, fontSize = 18, selected = false }) {
  const initial = (nombre || '?').charAt(0).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: selected ? G.teal : 'rgba(29,158,117,0.10)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize, fontWeight: 700,
      color: selected ? '#FFF' : G.teal,
      transition: 'all .15s',
      flexShrink: 0,
      boxShadow: selected ? '0 4px 16px rgba(29,158,117,0.35)' : 'none',
    }}>
      {initial}
    </div>
  );
}

function PinDots({ length }) {
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', margin: '20px 0' }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: '50%',
          background: i < length ? G.teal : 'rgba(0,0,0,0.12)',
          transition: 'background .1s',
          boxShadow: i < length ? '0 2px 8px rgba(29,158,117,0.4)' : 'none',
        }} />
      ))}
    </div>
  );
}

const PAD_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export default function PinSelector({ branchId, onSelect }) {
  const [staff, setStaff]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [pin, setPin]           = useState('');
  const [error, setError]       = useState('');
  const [shaking, setShaking]   = useState(false);

  useEffect(() => {
    if (!branchId) return;
    supabase
      .from('staff_pins')
      .select('id, nombre, rol, pin')
      .eq('branch_id', branchId)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => {
        setStaff(data || []);
        setLoading(false);
      });
  }, [branchId]);

  function handleKey(k) {
    if (k === '⌫') {
      setPin(p => p.slice(0, -1));
      setError('');
      return;
    }
    if (k === '') return;
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    setError('');
    if (next.length === 4) {
      verifyPin(next);
    }
  }

  function verifyPin(enteredPin) {
    if (!selected) return;
    if (enteredPin === selected.pin) {
      onSelect({ id: selected.id, nombre: selected.nombre, rol: selected.rol, branchId });
    } else {
      setShaking(true);
      setTimeout(() => {
        setShaking(false);
        setPin('');
        setError('PIN incorrecto — intentá de nuevo');
      }, 400);
    }
  }

  function selectStaff(member) {
    setSelected(member);
    setPin('');
    setError('');
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, padding: 20,
    }}>
      {/* Logo */}
      <div style={{ fontSize: 24, fontWeight: 800, color: '#FFF', letterSpacing: '-0.5px', marginBottom: 6, fontFamily: fontDisplay }}>
        mi<span style={{ color: G.teal }}>menú</span>
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 36 }}>
        ¿Quién sos?
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Cargando...</div>
      ) : staff.length === 0 ? (
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: '22px' }}>
            No hay mozos configurados para esta sucursal.
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 8 }}>
            Ir a Configuración → Equipo y agregar mozos con PIN.
          </div>
          <button
            onClick={() => onSelect({ id: 'owner', nombre: 'Administrador', rol: 'Encargado', branchId })}
            style={{ marginTop: 20, padding: '10px 24px', background: G.teal, color: '#FFF', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Continuar como Administrador
          </button>
        </div>
      ) : !selected ? (
        /* ─── Lista de mozos ─── */
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {staff.map(m => (
              <button key={m.id} onClick={() => selectStaff(m)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', borderRadius: 14,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.10)',
                cursor: 'pointer', width: '100%', textAlign: 'left',
                transition: 'all .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(29,158,117,0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
              >
                <AvatarCircle nombre={m.nombre} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#FFF' }}>{m.nombre}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{m.rol}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ─── Ingreso de PIN ─── */
        <div style={{ width: '100%', maxWidth: 300, textAlign: 'center' }}>
          {/* Staff seleccionado */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <AvatarCircle nombre={selected.nombre} size={56} fontSize={22} selected />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#FFF' }}>{selected.nombre}</div>
          </div>

          {/* Dots */}
          <div style={{ transform: shaking ? 'translateX(6px)' : 'none', transition: shaking ? 'transform 0.05s ease-in-out' : 'none' }}>
            <PinDots length={pin.length} />
          </div>

          {/* Error */}
          {error && (
            <div style={{ fontSize: 12, color: '#F87171', marginBottom: 4, minHeight: 18 }}>{error}</div>
          )}

          {/* Teclado numérico */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
            {PAD_KEYS.map((k, i) => (
              <button key={i} onClick={() => handleKey(k)} disabled={k === ''} style={{
                padding: '16px 0', borderRadius: 12, fontSize: k === '⌫' ? 20 : 22,
                fontWeight: k === '⌫' ? 400 : 600,
                background: k === '' ? 'transparent' : k === '⌫' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.09)',
                color: k === '' ? 'transparent' : '#FFF',
                border: 'none', cursor: k === '' ? 'default' : 'pointer',
                transition: 'background .1s',
              }}
              onMouseEnter={e => { if (k) e.currentTarget.style.background = 'rgba(29,158,117,0.3)'; }}
              onMouseLeave={e => { if (k) e.currentTarget.style.background = k === '⌫' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.09)'; }}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Volver */}
          <button onClick={() => { setSelected(null); setPin(''); setError(''); }} style={{
            marginTop: 20, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
            fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
          }}>
            ← Volver a la lista
          </button>
        </div>
      )}
    </div>
  );
}
