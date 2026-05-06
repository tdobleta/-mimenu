import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import RestaurantTab from '../components/settings/RestaurantTab';
import BranchesTab from '../components/settings/BranchesTab';
import ConnectionTab from '../components/settings/ConnectionTab';
import TeamTab from '../components/settings/TeamTab';

const TABS = [
  { key: 'restaurant', label: 'Mi restaurante' },
  { key: 'sucursales', label: 'Sucursales' },
  { key: 'conexion', label: 'Conexión de datos' },
  { key: 'equipo', label: 'Equipo' },
];

export default function Settings() {
  const ctx = useOutletContext();
  const [activeTab, setActiveTab] = useState('restaurant');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && TABS.some(t => t.key === tab)) setActiveTab(tab);
  }, []);

  return (
    <div className="space-y-4">
      <h1 style={{ fontSize: 18, fontWeight: 500 }}>Configuración</h1>

      <div className="flex gap-0" style={{ borderBottom: '0.5px solid hsl(var(--border))' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-4 py-2.5 text-sm transition-colors"
            style={{
              borderBottom: activeTab === t.key ? '2px solid #1D9E75' : '2px solid transparent',
              color: activeTab === t.key ? '#1D9E75' : 'rgba(0,0,0,0.4)',
              fontWeight: activeTab === t.key ? 500 : 400,
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {activeTab === 'restaurant' && <RestaurantTab restaurant={ctx.restaurant} onUpdate={ctx.loadData} />}
        {activeTab === 'sucursales' && <BranchesTab branches={ctx.branches} restaurantId={ctx.restaurant?.id} onUpdate={ctx.loadData} />}
        {activeTab === 'conexion' && <ConnectionTab branches={ctx.branches} activeBranchId={ctx.activeBranchId} onUpdate={ctx.loadData} />}
        {activeTab === 'equipo' && <TeamTab restaurant={ctx.restaurant} />}
      </div>
    </div>
  );
}


