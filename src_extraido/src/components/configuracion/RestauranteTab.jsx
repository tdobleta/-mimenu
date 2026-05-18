import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/lib/toast';

export default function RestauranteTab() {
  const { restaurante, updateRestaurante, restaurantId } = useStore();
  const { addToast } = useToast();
  const [form, setForm] = useState({ nombre:'', direccion:'', telefono:'' });
  const [success, setSuccess] = useState(false);

  useEffect(() => { setForm({ nombre:restaurante.nombre||'', direccion:restaurante.direccion||'', telefono:restaurante.telefono||'' }); }, [restaurante]);

  async function save() {
    try {
      if (restaurantId) {
        await base44.entities.Restaurant.update(restaurantId, form);
      }
      updateRestaurante(form);
      setSuccess(true);
      addToast('Cambios guardados', 'success');
      setTimeout(() => setSuccess(false), 2500);
    } catch(err) {
      console.error(err);
      addToast('Error al guardar', 'error');
    }
  }

  const F = ({ k, label }) => (
    <div>
      <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>{label}</div>
      <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={{ width:'100%', padding:'8px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} />
    </div>
  );

  return (
    <div style={{ maxWidth:460, display:'flex', flexDirection:'column', gap:14 }}>
      <F k="nombre" label="Nombre del restaurante" />
      <F k="direccion" label="Dirección" />
      <F k="telefono" label="Teléfono" />
      <div>
        <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>Logo</div>
        <div style={{ border:'1.5px dashed rgba(0,0,0,0.12)', borderRadius:10, padding:'24px 16px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:6, cursor:'pointer' }}
          onDragOver={e=>e.preventDefault()}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span style={{ fontSize:12, color:'#9CA3AF' }}>Arrastrá una imagen o hacé click para subir</span>
        </div>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12 }}>
        {success && <span style={{ fontSize:13, color:'#1D9E75', fontWeight:500 }}>✓ Cambios guardados</span>}
        <button onClick={save} style={{ padding:'8px 20px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>Guardar cambios</button>
      </div>
    </div>
  );
}


