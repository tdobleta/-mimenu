import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import moment from 'moment';
import { Link } from 'react-router-dom';

export default function ManualTurnForm({ branch, onSaved }) {
  const [fecha, setFecha] = useState(moment().format('YYYY-MM-DD'));
  const [turno, setTurno] = useState('manana');
  const [total, setTotal] = useState('');
  const [cubiertos, setCubiertos] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadMenu();
  }, [branch.id]);

  async function loadMenu() {
    const items = await base44.entities.MenuItem.filter({ branch_id: branch.id, activo: true });
    setMenuItems(items);
    const q = {};
    items.forEach(i => { q[i.id] = 0; });
    setQuantities(q);
  }

  async function handleSave() {
    if (!total || !cubiertos) return;
    setSaving(true);

    const turn = await base44.entities.Turn.create({
      branch_id: branch.id,
      fecha,
      turno,
      total_facturado: parseFloat(total),
      cubiertos: parseInt(cubiertos),
    });

    // Save turn items
    const itemsToSave = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([itemId, qty]) => {
        const menuItem = menuItems.find(m => m.id === itemId);
        return {
          turn_id: turn.id,
          menu_item_id: itemId,
          menu_item_name: menuItem?.nombre || '',
          cantidad: qty,
          branch_id: branch.id,
        };
      });

    if (itemsToSave.length > 0) {
      await base44.entities.TurnItem.bulkCreate(itemsToSave);
    }

    setSaving(false);
    setSuccess(true);
    if (onSaved) onSaved();
    else toast.success('Turno guardado correctamente');

    setTimeout(() => {
      setSuccess(false);
      setTotal('');
      setCubiertos('');
      const q = {};
      menuItems.forEach(i => { q[i.id] = 0; });
      setQuantities(q);
    }, 3000);
  }

  return (
    <div className="bg-white p-5 max-w-md space-y-4" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
      <div>
        <label style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 4 }}>Fecha</label>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white"
          style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }} />
      </div>

      <div>
        <label style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 4 }}>Turno</label>
        <div className="flex gap-2">
          {[
            { key: 'manana', label: 'Mañana' },
            { key: 'tarde', label: 'Tarde' },
            { key: 'noche', label: 'Noche' },
            { key: 'general', label: 'General' },
          ].map(t => (
            <button key={t.key} onClick={() => setTurno(t.key)}
              className="flex-1 py-2 text-sm transition-colors"
              style={{
                border: turno === t.key ? '1.5px solid #1D9E75' : '0.5px solid hsl(var(--border))',
                backgroundColor: turno === t.key ? '#E1F5EE' : 'white',
                borderRadius: 6,
                color: turno === t.key ? '#1D9E75' : 'rgba(0,0,0,0.6)',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 4 }}>Total facturado $</label>
        <input type="number" value={total} onChange={e => setTotal(e.target.value)} placeholder="0"
          className="w-full px-3 py-2 text-sm bg-white"
          style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }} />
      </div>

      <div>
        <label style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 4 }}>Cubiertos</label>
        <input type="number" value={cubiertos} onChange={e => setCubiertos(e.target.value)} placeholder="0"
          className="w-full px-3 py-2 text-sm bg-white"
          style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }} />
      </div>

      {menuItems.length > 0 ? (
        <div>
          <label style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 8 }}>Productos vendidos</label>
          <div className="space-y-2">
            {menuItems.map(item => (
              <div key={item.id} className="flex items-center justify-between">
                <span style={{ fontSize: 13 }}>{item.nombre}</span>
                <input
                  type="number"
                  min="0"
                  value={quantities[item.id] || 0}
                  onChange={e => setQuantities(prev => ({ ...prev, [item.id]: parseInt(e.target.value) || 0 }))}
                  className="px-2 py-1 text-sm text-center bg-white"
                  style={{ width: 70, border: '0.5px solid hsl(var(--border))', borderRadius: 4 }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)' }}>
          Primero agregá tus productos en{' '}
          <Link to="/configuracion?tab=restaurant" style={{ color: '#1D9E75', textDecoration: 'underline' }}>
            Mi restaurante → Menú
          </Link>
        </p>
      )}

      {success ? (
        <div className="w-full py-2.5 text-center text-sm" style={{ color: '#1D9E75' }}>
          ✓ Turno guardado correctamente
        </div>
      ) : (
        <button onClick={handleSave} disabled={saving || !total || !cubiertos}
          className="w-full py-2.5 text-white text-sm disabled:opacity-50"
          style={{ backgroundColor: '#1D9E75', borderRadius: 6 }}>
          {saving ? 'Guardando...' : 'Guardar turno'}
        </button>
      )}
    </div>
  );
}


