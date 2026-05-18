import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function RestaurantTab({ restaurant, onUpdate }) {
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (restaurant) {
      setNombre(restaurant.nombre || '');
      setDireccion(restaurant.direccion || '');
      setTelefono(restaurant.telefono || '');
    }
  }, [restaurant]);

  async function handleSave() {
    setSaving(true);
    await base44.entities.Restaurant.update(restaurant.id, { nombre, direccion, telefono });
    toast.success('Cambios guardados');
    onUpdate();
    setSaving(false);
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <label style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 4 }}>Nombre del restaurante</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white"
          style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 4 }}>Dirección</label>
        <input value={direccion} onChange={e => setDireccion(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white"
          style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 4 }}>Teléfono</label>
        <input value={telefono} onChange={e => setTelefono(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white"
          style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }} />
      </div>
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-white text-sm disabled:opacity-50"
          style={{ backgroundColor: '#1D9E75', borderRadius: 6 }}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}


