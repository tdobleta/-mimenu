import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import Logo from '../components/Logo';

export default function Onboarding({ onComplete, inApp = false }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(inApp ? 'cards' : 'register');
  const [nombre, setNombre] = useState('');

  async function handleCreate() {
    if (!nombre.trim()) return;
    setCreating(true);
    const rest = await base44.entities.Restaurant.create({ nombre: nombre.trim() });
    await base44.entities.Branch.create({ restaurant_id: rest.id, nombre: nombre.trim() });
    setCreating(false);
    if (onComplete) await onComplete();
  }

  const cards = [
    { key: 'fudo', title: 'Fudo', subtitle: 'Conectá tu API Key', icon: '🔗' },
    { key: 'mercadopago', title: 'MercadoPago', subtitle: 'Conectá tu cuenta', icon: '💳' },
    { key: 'manual', title: 'Carga manual', subtitle: 'Cargás vos al cerrar el turno', icon: '✏️' },
  ];

  function handleCardClick(key) {
    navigate('/configuracion?tab=conexion&method=' + key);
  }

  if (step === 'register' && !inApp) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background-primary)' }}>
        <div className="w-full max-w-sm p-6">
          <div className="flex justify-center mb-8">
            <span style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.5px' }}>
              <span style={{ color: '#0d0d0d' }}>mi</span>
              <span style={{ color: '#1D9E75' }}>menú</span>
            </span>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Nombre del restaurante"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-white"
              style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !nombre.trim()}
              className="w-full py-2.5 text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: '#1D9E75', borderRadius: 6 }}
            >
              {creating ? 'Creando...' : 'Crear cuenta'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="mb-8">
        <span style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.5px' }}>
          <span style={{ color: '#0d0d0d' }}>mi</span>
          <span style={{ color: '#1D9E75' }}>menú</span>
        </span>
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 500 }}>Empezá a ver tus analíticas</h1>
      <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)', marginTop: 4 }}>
        Conectá de dónde vienen tus ventas para comenzar
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 w-full max-w-2xl">
        {cards.map(c => (
          <button
            key={c.key}
            onClick={() => handleCardClick(c.key)}
            className="p-5 bg-white text-left transition-all hover:border-[#1D9E75]"
            style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', marginTop: 2 }}>{c.subtitle}</div>
          </button>
        ))}
      </div>
    </div>
  );
}


