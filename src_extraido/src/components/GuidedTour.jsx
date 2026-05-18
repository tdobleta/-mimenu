// src/components/GuidedTour.jsx
// Tutorial interactivo first-run.
// Pensado para ser claro para cualquier persona,
// sin importar su experiencia con tecnología.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const TOUR_KEY = 'mimenu_tour_v2_done';

const PASOS = [
  {
    id: 1,
    emoji: '👋',
    titulo: '¡Bienvenido a mimenú!',
    descripcion: 'Te vamos a mostrar cómo funciona el sistema en menos de 2 minutos. Podés saltear esto cuando quieras.',
    detalle: null,
    boton: 'Empezar el recorrido',
    ruta: null,
  },
  {
    id: 2,
    emoji: '🍽️',
    titulo: 'Paso 1 — Configurá tu menú',
    descripcion: 'Antes de atender clientes, necesitás cargar los platos y bebidas que vendés.',
    detalle: 'Hacé clic en "Stock y ventas" en el menú de la izquierda → luego en la pestaña "Menú". Ahí podés agregar cada plato con nombre y precio.',
    boton: 'Ir a cargar el menú',
    ruta: '/stock',
  },
  {
    id: 3,
    emoji: '🪑',
    titulo: 'Paso 2 — Abrí el Salón',
    descripcion: 'Cuando llega un cliente, vas al Salón y abrís su mesa.',
    detalle: 'Hacé clic en "Salón" en el menú. Vas a ver todas las mesas de tu local. Para atender una mesa, tocala y elegí "Abrir mesa".',
    boton: 'Ver el Salón',
    ruta: '/salon',
  },
  {
    id: 4,
    emoji: '📱',
    titulo: 'Paso 3 — Tomá el pedido',
    descripcion: 'Con la mesa abierta, podés anotar lo que pide cada cliente.',
    detalle: 'Desde el Salón, tocá la mesa que está ocupada → aparece el POS (sistema de pedidos). Tocá los platos para agregarlos al pedido. Cuando terminás, enviás la comanda a cocina.',
    boton: 'Entendido',
    ruta: null,
  },
  {
    id: 5,
    emoji: '👨‍🍳',
    titulo: 'Paso 4 — La cocina ve el pedido',
    descripcion: 'Automáticamente, lo que pediste aparece en la pantalla de cocina.',
    detalle: 'El cocinero ve los pedidos en tiempo real en "Vista Cocina" (abajo en el menú). Cuando el plato está listo, lo marca y vos recibís una notificación.',
    boton: 'Entendido',
    ruta: null,
  },
  {
    id: 6,
    emoji: '💰',
    titulo: 'Paso 5 — Cerrá la mesa y cobrá',
    descripcion: 'Cuando el cliente pide la cuenta, cerrás la mesa desde el Salón.',
    detalle: 'Tocá la mesa → "Cerrar y cobrar". Elegís cómo pagó (efectivo, tarjeta, etc.) y confirmás. La venta queda registrada automáticamente.',
    boton: 'Entendido',
    ruta: null,
  },
  {
    id: 7,
    emoji: '📊',
    titulo: 'Paso 6 — Mirá cómo va tu negocio',
    descripcion: 'En el Dashboard podés ver las ventas del día, los platos más pedidos y mucho más.',
    detalle: 'Hacé clic en "Dashboard" en el menú. Podés filtrar por día, semana o mes.',
    boton: 'Ver el Dashboard',
    ruta: '/',
  },
  {
    id: 8,
    emoji: '✅',
    titulo: '¡Ya sabés todo lo básico!',
    descripcion: 'Con estos 6 pasos podés empezar a usar mimenú hoy mismo.',
    detalle: 'Si tenés dudas, usá el botón de chat (💬) abajo a la derecha para consultar. ¡Mucho éxito!',
    boton: '¡Empezar a usar mimenú!',
    ruta: '/',
    final: true,
  },
];

export default function GuidedTour({ onClose }) {
  const [paso, setPaso] = useState(0);
  const navigate = useNavigate();
  const actual = PASOS[paso];

  function siguiente() {
    if (actual.ruta) navigate(actual.ruta);
    if (actual.final) {
      localStorage.setItem(TOUR_KEY, '1');
      onClose?.();
      return;
    }
    setPaso(p => Math.min(p + 1, PASOS.length - 1));
  }

  function saltar() {
    localStorage.setItem(TOUR_KEY, '1');
    onClose?.();
  }

  const progreso = Math.round((paso / (PASOS.length - 1)) * 100);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'white', borderRadius: 20,
        padding: '36px 32px', maxWidth: 480, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        position: 'relative',
      }}>
        {/* Barra de progreso */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, borderRadius: '20px 20px 0 0', background: '#F3F4F6', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progreso}%`, background: '#1D9E75', transition: 'width 0.4s ease', borderRadius: '20px 20px 0 0' }} />
        </div>

        {/* Paso actual */}
        {paso > 0 && (
          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16, marginTop: 8 }}>
            Paso {paso} de {PASOS.length - 1}
          </div>
        )}

        {/* Emoji grande */}
        <div style={{ fontSize: 52, marginBottom: 16, textAlign: 'center' }}>
          {actual.emoji}
        </div>

        {/* Título */}
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 12, textAlign: 'center', lineHeight: 1.3 }}>
          {actual.titulo}
        </h2>

        {/* Descripción principal */}
        <p style={{ fontSize: 16, color: '#374151', lineHeight: 1.7, textAlign: 'center', marginBottom: actual.detalle ? 16 : 24 }}>
          {actual.descripcion}
        </p>

        {/* Detalle en caja destacada */}
        {actual.detalle && (
          <div style={{
            background: '#F0FBF7', border: '1px solid #A7F3D0',
            borderRadius: 12, padding: '14px 16px', marginBottom: 24,
            fontSize: 14, color: '#065F46', lineHeight: 1.7,
          }}>
            💡 {actual.detalle}
          </div>
        )}

        {/* Botón principal */}
        <button onClick={siguiente} style={{
          width: '100%', padding: '14px 20px',
          background: '#1D9E75', color: 'white',
          border: 'none', borderRadius: 12,
          fontSize: 16, fontWeight: 600, cursor: 'pointer',
          marginBottom: 12, transition: 'transform 0.1s',
        }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {actual.boton} {!actual.final && '→'}
        </button>

        {/* Botón saltar */}
        {!actual.final && (
          <button onClick={saltar} style={{
            width: '100%', padding: '10px',
            background: 'none', border: 'none',
            fontSize: 13, color: '#9CA3AF', cursor: 'pointer',
          }}>
            Saltar tutorial
          </button>
        )}
      </div>
    </div>
  );
}

// Hook para saber si mostrar el tour
export function useTour() {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(TOUR_KEY);
    if (!done) {
      // Pequeño delay para que la app cargue primero
      setTimeout(() => setMostrar(true), 1500);
    }
  }, []);

  return { mostrar, cerrar: () => setMostrar(false) };
}
