import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

const ALL_FRANJAS = ['12:00','12:30','13:00','13:30','14:00','20:00','20:30','21:00','21:30','22:00'];

export default function SucursalesTab() {
  const { sucursales, updateSucursal, restaurantId } = useStore();
  const { addToast } = useToast();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState({ nombre:'', direccion:'' });
  const [creating, setCreating] = useState(false);

  function open(s) { setEditing(s.id); setForm({ nombre:s.nombre, direccion:s.direccion||'', franjas:s.franjas||[] }); }
  async function save() {
    try {
      await base44.entities.Branch.update(editing, {
        nombre: form.nombre,
        direccion: form.direccion || '',
        franjas: form.franjas,
      });
      updateSucursal(editing, form);
      setEditing(null);
      addToast('Sucursal actualizada', 'success');
    } catch(err) {
      console.error(err);
      addToast('Error al guardar la sucursal', 'error');
    }
  }
  function toggleFranja(fr) {
    setForm(f => ({ ...f, franjas: f.franjas.includes(fr) ? f.franjas.filter(x=>x!==fr) : [...f.franjas,fr] }));
  }

  async function createBranch() {
    if (!newForm.nombre.trim()) return;
    setCreating(true);
    try {
      const restId = restaurantId;
      if (!restId) {
        addToast('No se encontró el restaurante', 'error');
        setCreating(false);
        return;
      }
      await base44.entities.Branch.create({
        restaurant_id: restId,
        nombre: newForm.nombre.trim(),
        direccion: newForm.direccion.trim(),
        mesas: 4,
        metodo_conexion: 'ninguno',
      });
      addToast('Sucursal creada correctamente', 'success');
      setShowAdd(false);
      setNewForm({ nombre:'', direccion:'' });
      window.location.reload();
    } catch(err) {
      console.error(err);
      addToast('Error al crear sucursal', 'error');
      setCreating(false);
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, maxWidth:680 }}>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={()=>setShowAdd(true)} style={{ padding:'7px 14px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>
          + Agregar sucursal
        </button>
      </div>
      {sucursales.map(s => (
        <div key={s.id} style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:20 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:600, color:'#111827' }}>{s.nombre}</div>
              <div style={{ fontSize:13, color:'#9CA3AF', marginTop:2 }}>{s.direccion}</div>
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <span style={{ backgroundColor:'#E8F7F2', color:'#1D9E75', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600 }}>{s.conexion}</span>
                <span style={{ backgroundColor:'#F3F4F6', color:'#6B7280', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600 }}>{s.mesas} mesas</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => open(s)} style={{ padding:'6px 12px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:12, cursor:'pointer', color:'#374151', backgroundColor:'white' }}>Configurar</button>
              <Link to="/salon" style={{ padding:'6px 12px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:12, cursor:'pointer', color:'#374151', backgroundColor:'white', textDecoration:'none' }}>Ver salón</Link>
            </div>
          </div>
          {editing === s.id && (
            <div style={{ marginTop:16, paddingTop:16, borderTop:'0.5px solid rgba(0,0,0,0.06)', display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Nombre</div>
                  <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} />
                </div>
                <div>
                  <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Dirección</div>
                  <input value={form.direccion} onChange={e=>setForm(f=>({...f,direccion:e.target.value}))} style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>Franjas horarias disponibles para reservas</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {ALL_FRANJAS.map(fr => {
                    const active = form.franjas?.includes(fr);
                    return (
                      <button key={fr} onClick={()=>toggleFranja(fr)}
                        style={{ padding:'4px 12px', borderRadius:6, fontSize:12, cursor:'pointer', transition:'all .15s', backgroundColor:active?'#1D9E75':'white', color:active?'white':'#374151', border:active?'none':'0.5px solid rgba(0,0,0,0.12)' }}>
                        {fr}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={()=>setEditing(null)} style={{ padding:'7px 14px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, cursor:'pointer', color:'#374151', backgroundColor:'white' }}>Cancelar</button>
                <button onClick={save} style={{ padding:'7px 14px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>Guardar</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {showAdd && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={()=>!creating && setShowAdd(false)}>
          <div style={{ backgroundColor:'white', borderRadius:12, width:420, maxWidth:'95vw', padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <span style={{ fontSize:15, fontWeight:600, color:'#111827' }}>Agregar sucursal</span>
              <button onClick={()=>!creating && setShowAdd(false)} style={{ color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:16 }}>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Nombre <span style={{ color:'#EF4444' }}>*</span></div>
                <input value={newForm.nombre} onChange={e=>setNewForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Centro" style={{ width:'100%', padding:'8px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Dirección (opcional)</div>
                <input value={newForm.direccion} onChange={e=>setNewForm(f=>({...f,direccion:e.target.value}))} placeholder="Ej: Av. Corrientes 1234" style={{ width:'100%', padding:'8px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setShowAdd(false)} disabled={creating} style={{ flex:1, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, cursor:creating?'not-allowed':'pointer', color:'#374151', backgroundColor:'white' }}>Cancelar</button>
              <button onClick={createBranch} disabled={!newForm.nombre.trim() || creating}
                style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:(!newForm.nombre.trim()||creating)?'not-allowed':'pointer', opacity:(!newForm.nombre.trim()||creating)?0.6:1 }}>
                {creating ? 'Creando...' : 'Crear sucursal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


