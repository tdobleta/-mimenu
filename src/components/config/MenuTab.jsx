import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { money } from '@/lib/fmt';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';

const CATS = ['Entradas','Principales','Postres','Bebidas'];

export default function MenuTab() {
  const store = useStore();
  const { addMenuItem, updateMenuItem, deleteMenuItem, setMenuItems } = store;
  const { user } = useAuth();
  const userRole = useUserRole();
  const activeBid = store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id;
  const menuItems = store.getMenuItems(activeBid);
  const sucursalNombre = store.sucursales.find(s => s.id === store.branchId)?.nombre || '';

  async function reloadMenu() {
    const bid = activeBid;
    if (!bid) return;
    try {
      const items = await base44.entities.MenuItem.filter({ branch_id: bid });
      setMenuItems(bid, (items || []).map(item => ({
        id: item.id,
        nombre: item.nombre || '',
        precio: item.precio || 0,
        categoria: item.categoria || 'Principales',
        disponible: item.activo !== false,
      })));
    } catch(e) {}
  }
  const { addToast } = useToast();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ nombre:'', precio:'', categoria:'Principales', disponible:true });
  const [delConfirm, setDelConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  function openAdd() { setModal('add'); setForm({ nombre:'', precio:'', categoria:'Principales', disponible:true }); }
  function openEdit(it) { setModal(it); setForm({ nombre:it.nombre, precio:it.precio, categoria:it.categoria, disponible:it.disponible }); }

  async function save() {
    if (!form.nombre.trim() || !form.precio) return;
    if (saving) return;
    setSaving(true);
    try {
      if (modal === 'add') {
        const created = await base44.entities.MenuItem.create({
          branch_id: activeBid,
          nombre: form.nombre,
          precio: Number(form.precio),
          categoria: form.categoria,
          activo: form.disponible,
        });
        addMenuItem(activeBid, { id: created.id, nombre: created.nombre, precio: created.precio, categoria: created.categoria, disponible: created.activo !== false });
        addToast('Plato agregado', 'success');
        await reloadMenu();
        store.logAccion({ usuario: user?.email || 'Sistema', rol: userRole, categoria: 'Menú', accion: 'Plato agregado', detalle: form.nombre + ' · $' + form.precio, sucursal: sucursalNombre });
      } else {
        await base44.entities.MenuItem.update(modal.id, { nombre: form.nombre, precio: Number(form.precio), categoria: form.categoria, activo: form.disponible });
        updateMenuItem(activeBid, modal.id, { ...form, precio: Number(form.precio) });
        addToast('Plato actualizado', 'success');
        await reloadMenu();
        store.logAccion({ usuario: user?.email || 'Sistema', rol: userRole, categoria: 'Menú', accion: 'Plato editado', detalle: form.nombre + ' · $' + form.precio, sucursal: sucursalNombre });
      }
      setModal(null);
    } catch(err) {
      console.error('Error guardando plato:', err);
      addToast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    try {
      const nombreEliminado = delConfirm.nombre;
      await base44.entities.MenuItem.delete(delConfirm.id);
      deleteMenuItem(activeBid, delConfirm.id);
      setDelConfirm(null);
      addToast('Plato eliminado', 'info');
      await reloadMenu();
      store.logAccion({
        usuario: user?.email || 'Sistema',
        rol: userRole,
        categoria: 'Menú',
        accion: 'Plato eliminado',
        detalle: nombreEliminado,
        sucursal: sucursalNombre,
      });
    } catch(err) {
      addToast('Error al eliminar', 'error');
    }
  }

  async function toggleDisponible(it) {
    try {
      await base44.entities.MenuItem.update(it.id, { activo: !it.disponible });
      updateMenuItem(activeBid, it.id, { disponible: !it.disponible });
      await reloadMenu();
    } catch(err) {}
  }

  const bycat = CATS.reduce((a,c) => ({ ...a, [c]: menuItems.filter(i=>i.categoria===c) }), {});

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:760 }}>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={openAdd} style={{ padding:'7px 14px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>+ Agregar plato</button>
      </div>
      {CATS.map(cat => bycat[cat].length > 0 && (
        <div key={cat}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>{cat}</div>
          <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden' }}>
            {bycat[cat].map((it, idx) => (
              <div key={it.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', borderBottom: idx<bycat[cat].length-1?'0.5px solid rgba(0,0,0,0.05)':'none' }}>
                <span style={{ flex:1, fontSize:13, fontWeight:500, color:'#111827' }}>{it.nombre}</span>
                <span style={{ fontSize:14, fontWeight:600, color:'#1D9E75', minWidth:80, textAlign:'right' }}>{money(it.precio)}</span>
                <button onClick={() => toggleDisponible(it)} style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, cursor:'pointer', border:'none', backgroundColor:it.disponible?'#E8F7F2':'#F3F4F6', color:it.disponible?'#1D9E75':'#9CA3AF', whiteSpace:'nowrap' }}>
                  {it.disponible?'Disponible':'No disponible'}
                </button>
                <button onClick={()=>openEdit(it)} style={{ padding:'4px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, fontSize:12, cursor:'pointer', color:'#374151' }}>Editar</button>
                <button onClick={()=>setDelConfirm(it)} style={{ padding:'4px 10px', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:6, fontSize:12, cursor:'pointer', color:'#EF4444' }}>Eliminar</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {modal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={()=>setModal(null)}>
          <div style={{ backgroundColor:'white', borderRadius:12, width:400, padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
              <span style={{ fontSize:15, fontWeight:600 }}>{modal==='add'?'Nuevo plato':'Editar plato'}</span>
              <button onClick={()=>setModal(null)} style={{ color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div><div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Nombre</div>
                <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Precio</div>
                  <input type="number" value={form.precio} onChange={e=>setForm(f=>({...f,precio:e.target.value}))} style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} /></div>
                <div><div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Categoría</div>
                  <select value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))} style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, backgroundColor:'white' }}>
                    {CATS.map(c=><option key={c}>{c}</option>)}</select></div>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                <input type="checkbox" checked={form.disponible} onChange={e=>setForm(f=>({...f,disponible:e.target.checked}))} />
                Disponible
              </label>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={()=>setModal(null)} style={{ flex:1, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, cursor:'pointer' }}>Cancelar</button>
              <button onClick={save} disabled={saving} style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
      {delConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={()=>setDelConfirm(null)}>
          <div style={{ backgroundColor:'white', borderRadius:10, padding:24, width:320 }} onClick={e=>e.stopPropagation()}>
            <p style={{ fontSize:14, color:'#111827', marginBottom:4 }}>¿Eliminar <strong>{delConfirm.nombre}</strong>?</p>
            <p style={{ fontSize:12, color:'#9CA3AF', marginBottom:16 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setDelConfirm(null)} style={{ flex:1, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, cursor:'pointer' }}>Cancelar</button>
              <button onClick={confirmDelete} style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#EF4444', cursor:'pointer' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


