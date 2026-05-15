import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function BranchesTab({ branches, restaurantId, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!nombre.trim()) return;
    setSaving(true);
    await base44.entities.Branch.create({ restaurant_id: restaurantId, nombre: nombre.trim(), direccion });
    toast.success('Sucursal agregada');
    setNombre('');
    setDireccion('');
    setOpen(false);
    onUpdate();
    setSaving(false);
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setOpen(true)}
          className="px-4 py-2 text-white text-sm"
          style={{ backgroundColor: '#1D9E75', borderRadius: 6 }}>
          Agregar sucursal
        </button>
      </div>

      <div className="bg-white" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
        <table className="w-full">
          <thead>
            <tr style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              <th className="text-left p-3 font-normal">Nombre</th>
              <th className="text-left p-3 font-normal">Dirección</th>
            </tr>
          </thead>
          <tbody>
            {branches.map(b => (
              <tr key={b.id} style={{ borderTop: '0.5px solid hsl(var(--border))', fontSize: 13 }}>
                <td className="p-3">{b.nombre}</td>
                <td className="p-3" style={{ color: 'rgba(0,0,0,0.5)' }}>{b.direccion || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar sucursal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <input placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white"
              style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }} />
            <input placeholder="Dirección" value={direccion} onChange={e => setDireccion(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white"
              style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 6 }} />
            <button onClick={handleAdd} disabled={saving || !nombre.trim()}
              className="w-full py-2 text-white text-sm disabled:opacity-50"
              style={{ backgroundColor: '#1D9E75', borderRadius: 6 }}>
              {saving ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


