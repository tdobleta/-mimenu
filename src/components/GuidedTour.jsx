import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { G, fontDisplay } from '@/lib/glass';

const TOUR_KEY = 'mimenu_tour_done';

// ── Pasos del tour ─────────────────────────────────────────────────────────────
const PASOS = [
  {
    id: 'salon',
    ruta: '/salon',
    titulo: 'El Salón',
    emoji: '🪑',
    descripcion: 'Acá los mozos ven todas las mesas del restaurante. Hacen clic en una mesa para abrirla, agregan los platos del pedido y envían la comanda a cocina.',
    accion: 'Tocá una mesa para ver cómo funciona',
    highlight: { top: '50%', left: '50%', w: 300, h: 200 },
  },
  {
    id: 'caja',
    ruta: '/caja',
    titulo: 'La Caja',
    emoji: '💰',
    descripcion: 'Antes de empezar el servicio, abrí el turno de caja con el fondo inicial. Al final del día cerrás el turno y ves el resumen de ventas.',
    accion: 'Hacé clic en "Abrir turno" para comenzar',
    highlight: { top: '30%', left: '50%', w: 260, h: 60 },
  },
  {
    id: 'pos',
    ruta: '/caja',
    titulo: 'El POS',
    emoji: '🖥️',
    descripcion: 'Desde Caja podés abrir el POS — la pantalla de cobro completa. Muestra las mesas abiertas, cargás productos, cobrás y emitís factura, todo desde un solo lugar.',
    accion: 'Usá el botón "Abrir POS" cuando estés listo para cobrar',
    highlight: { top: '13%', right: '2%', w: 140, h: 44 },
  },
  {
    id: 'configuracion',
    ruta: '/configuracion',
    titulo: 'Configuración',
    emoji: '⚙️',
    descripcion: 'Cargá tu menú con todos los productos y precios. También podés configurar la impresora térmica, la facturación AFIP y los datos de tu restaurante.',
    accion: 'Andá a la pestaña "Menú" para agregar tus platos',
    highlight: { top: '12%', left: '15%', w: 480, h: 44 },
  },
  {
    id: 'reportes',
    ruta: '/reportes',
    titulo: 'Reportes',
    emoji: '📊',
    descripcion: 'Acá ves el detalle de todas las ventas por día, los productos más vendidos, el rendimiento de cada mozo y las reservas. Todo exportable a CSV.',
    accion: 'Usá los filtros de período para analizar tus datos',
    highlight: { top: '15%', right: '2%', w: 320, h: 44 },
  },
  {
    id: 'listo',
    ruta: null,
    titulo: '¡Listo para arrancar!',
    emoji: '🎉',
    descripcion: 'Ya sabés lo básico. Si tenés dudas, cada sección tiene su propio flujo intuitivo. ¡Éxito con tu restaurante!',
    accion: null,
    highlight: null,
  },
];

// ── Componente spotlight ───────────────────────────────────────────────────────
function Spotlight({ highlight }) {
  if (!highlight) return null;
  const { top, left, right, bottom, w, h } = highlight;
  return (
    <div style={{
      position: 'fixed',
      top: typeof top === 'string' ? top : undefined,
      left: typeof left === 'string' ? left : undefined,
      right: typeof right === 'string' ? right : undefined,
      bottom: typeof bottom === 'string' ? bottom : undefined,
      transform: 'translate(-50%, -50%)',
      width: w,
      height: h,
      borderRadius: 14,
      boxShadow: `0 0 0 9999px rgba(15,15,35,0.65)`,
      border: `2px solid rgba(29,158,117,0.8)`,
      zIndex: 1050,
      pointerEvents: 'none',
      animation: 'pulseHighlight 2s ease-in-out infinite',
    }} />
  );
}

// ── Card del tour ──────────────────────────────────────────────────────────────
function TourCard({ paso, stepIdx, total, onNext, onSkip }) {
  const isLast = stepIdx === total - 1;

  return (
    <div style={{
      position: 'fixed',
      bottom: 32,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1200,
      width: 480,
      maxWidth: '95vw',
      background: 'rgba(255,255,255,0.97)',
      backdropFilter: 'blur(24px)',
      borderRadius: 22,
      boxShadow: '0 24px 64px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.8)',
      padding: '24px 26px',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {/* Progress */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 99,
            background: i <= stepIdx ? G.teal : 'rgba(0,0,0,0.08)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* Content */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{
          fontSize: 32, lineHeight: 1, flexShrink: 0,
          background: 'rgba(29,158,117,0.08)', borderRadius: 14,
          width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{paso.emoji}</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: G.text, fontFamily: fontDisplay, marginBottom: 6, letterSpacing: '-0.02em' }}>
            {paso.titulo}
          </div>
          <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.65 }}>
            {paso.descripcion}
          </div>
          {paso.accion && (
            <div style={{
              marginTop: 12, fontSize: 12, color: G.teal, fontWeight: 700,
              background: 'rgba(29,158,117,0.08)', borderRadius: 9,
              padding: '6px 12px', display: 'inline-block',
            }}>
              👉 {paso.accion}
            </div>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {!isLast && (
          <button onClick={onSkip} style={{
            fontSize: 12, color: '#9CA3AF', background: 'none', border: 'none',
            cursor: 'pointer', padding: '8px 0', fontFamily: 'inherit',
          }}>
            Saltar guía
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onNext} style={{
          padding: '10px 24px',
          background: isLast ? `linear-gradient(135deg, ${G.teal}, #0F6E56)` : G.teal,
          border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
          color: 'white', cursor: 'pointer',
          boxShadow: `0 4px 14px rgba(29,158,117,0.3)`,
          fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          {isLast ? 'Comenzar' : 'Entendido'}
          {!isLast && <span style={{ fontSize: 16 }}>→</span>}
          {isLast && <span style={{ fontSize: 16 }}>🚀</span>}
        </button>
      </div>

      {/* Step counter */}
      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#D1D5DB' }}>
        {stepIdx + 1} de {total}
      </div>
    </div>
  );
}

// ── Pantalla de bienvenida ────────────────────────────────────────────────────
function WelcomeScreen({ onGuia, onSaltar }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'linear-gradient(140deg, #eef2ff 0%, #f8fffc 35%, #fdf4ff 70%, #fff8f0 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {/* Orbs decorativos */}
      <div style={{ position: 'fixed', top: -100, right: -80, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(127,119,221,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -80, left: -60, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(29,158,117,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(32px)',
        border: '1px solid rgba(255,255,255,0.85)',
        borderRadius: 28,
        padding: '48px 44px',
        textAlign: 'center',
        maxWidth: 480,
        width: '90vw',
        boxShadow: '0 24px 80px rgba(80,80,180,0.12)',
        animation: 'fadeIn 0.5s ease',
      }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>🎉</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: G.text, fontFamily: fontDisplay, letterSpacing: '-0.03em', marginBottom: 8 }}>
          ¡Restaurante configurado!
        </div>
        <div style={{ fontSize: 15, color: '#6B7280', lineHeight: 1.65, marginBottom: 32 }}>
          Tu sistema está listo. ¿Querés que te mostremos cómo usar las funciones principales?
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexDirection: 'column' }}>
          <button onClick={onGuia} style={{
            padding: '14px 32px',
            background: `linear-gradient(135deg, ${G.teal}, #0F6E56)`,
            border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700,
            color: 'white', cursor: 'pointer',
            boxShadow: `0 6px 20px rgba(29,158,117,0.3)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          }}>
            <span style={{ fontSize: 18 }}>🗺️</span>
            Guía rápida
          </button>
          <button onClick={onSaltar} style={{
            padding: '13px 32px',
            background: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(0,0,0,0.10)',
            borderRadius: 14, fontSize: 15, fontWeight: 600,
            color: '#6B7280', cursor: 'pointer',
          }}>
            Comenzar directamente
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
        @keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        @keyframes pulseHighlight { 0%,100% { box-shadow: 0 0 0 9999px rgba(15,15,35,0.65), 0 0 0 4px rgba(29,158,117,0.3); } 50% { box-shadow: 0 0 0 9999px rgba(15,15,35,0.65), 0 0 0 8px rgba(29,158,117,0.5); } }
      `}</style>
    </div>
  );
}

// ── GuidedTour principal ──────────────────────────────────────────────────────
export default function GuidedTour({ onFinish }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('welcome'); // 'welcome' | 'tour' | 'done'
  const [stepIdx, setStepIdx] = useState(0);

  const paso = PASOS[stepIdx];

  function handleGuia() {
    setPhase('tour');
    if (PASOS[0].ruta) navigate(PASOS[0].ruta);
  }

  function handleSaltar() {
    localStorage.setItem(TOUR_KEY, '1');
    setPhase('done');
    onFinish?.();
  }

  function handleNext() {
    const nextIdx = stepIdx + 1;
    if (nextIdx >= PASOS.length) {
      localStorage.setItem(TOUR_KEY, '1');
      setPhase('done');
      onFinish?.();
      return;
    }
    setStepIdx(nextIdx);
    if (PASOS[nextIdx].ruta) navigate(PASOS[nextIdx].ruta);
  }

  if (phase === 'done') return null;

  if (phase === 'welcome') {
    return <WelcomeScreen onGuia={handleGuia} onSaltar={handleSaltar} />;
  }

  return (
    <>
      {/* Overlay oscuro (sin spotlight si no hay highlight) */}
      {!paso.highlight && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,35,0.55)', zIndex: 1050, pointerEvents: 'none' }} />
      )}

      {/* Spotlight */}
      {paso.highlight && <Spotlight highlight={paso.highlight} />}

      {/* Card del paso */}
      <TourCard
        paso={paso}
        stepIdx={stepIdx}
        total={PASOS.length}
        onNext={handleNext}
        onSkip={handleSaltar}
      />

      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        @keyframes pulseHighlight { 0%,100% { box-shadow: 0 0 0 9999px rgba(15,15,35,0.65), 0 0 0 4px rgba(29,158,117,0.3); } 50% { box-shadow: 0 0 0 9999px rgba(15,15,35,0.65), 0 0 0 8px rgba(29,158,117,0.5); } }
      `}</style>
    </>
  );
}

// ── Hook para usar el tour ────────────────────────────────────────────────────
export function useTour() {
  const [showTour, setShowTour] = useState(false);

  function startTour() {
    localStorage.removeItem(TOUR_KEY);
    setShowTour(true);
  }

  function isTourDone() {
    return !!localStorage.getItem(TOUR_KEY);
  }

  return { showTour, setShowTour, startTour, isTourDone };
}
