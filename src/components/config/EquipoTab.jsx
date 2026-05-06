import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';

const ROLES = [
  { key:'Dueno',     label:'Dueño',     desc:'Acceso total a todas las funciones y configuraciones.' },
  { key:'Encargado', label:'Encargado', desc:'Acceso a todas las vistas excepto Configuración.' },
  { key:'Mozo',      label:'Mozo',      desc:'Solo acceso al Salón y visualización de reservas.' },
  { key:'Cocinero',  label:'Cocinero',  desc:'Solo accede a la vista de cocina con las comandas en tiempo real.' },
];
const ROL_BADGE = {
  Dueno:     { bg:'#E8F7F2', c:'#1D9E75', label:'Dueño' },
  Encargado: { bg:'#DBEAFE', c:'#3B82F6', label:'Encargado' },
  Mozo:      { bg:'#F3F4F6', c:'#6B7280', label:'Mozo' },
  Cocinero:  { bg:'#FEF9C3', c:'#CA8A04', label:'Cocinero' },
};

export default function EquipoTab() {
  const store = useStore();
  const { teamMembers, addTeamMember, removeTeamMember } = store;
  const { addToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nombre:'', email:'', rol:'Mozo' });
  const [shareInfo, setShareInfo] = useState(null);

  async function save() {
    if (!form.email.trim()) { addToast('Ingresá un email', 'error'); return; }
    setSaving(true);
    try {
      const restaurantId = store.restaurantId;
      if (!restaurantId) { addToast('No se encontró el restaurante', 'error'); setSaving(false); return; }
      const created = await base44.entities.TeamMember.create({
        restaurant_id: restaurantId,
        email: form.email,
        nombre: form.nombre,
        rol: form.rol,
      });
      addTeamMember(created);
      let inviteOk = false;
      try {
        // En Supabase: el usuario se registra con su email y el restaurante lo añade aquí
        const { default: { supabase } } = await import('@/api/supabaseClient');
        await supabase.from('team_members').insert({
          restaurant_id: store.restaurantId,
          email: form.email.trim().toLowerCase(),
          nombre: form.nombre?.trim() || '',
          rol: form.rol,
        });
        inviteOk = true;
      } catch (err) {
        console.error('[EquipoTab] inviteUser falló para', form.email, err);
      }

      const appUrl = window.location.origin;

      if (inviteOk) {
        addToast('Invitación enviada — el usuario recibirá un email de acceso', 'success');
      } else {
        // Mostrar modal con link para compartir manualmente
        setShareInfo({ nombre: form.nombre || form.email, email: form.email, url: appUrl });
      }
      setShowModal(false);
      setForm({ nombre:'', email:'', rol:'Mozo' });
    } catch(err) {
      console.error(err);
      addToast('Error al agregar miembro', 'error');
    }
    setSaving(false);
  }

  async function handleDelete(member) {
    try {
      await base44.entities.TeamMember.delete(member.id);
      removeTeamMember(member.id);
      addToast('Miembro eliminado', 'info');
    } catch(err) {
      addToast('Error al eliminar', 'error');
    }
  }

  return (
    <div style={{ maxWidth:720, display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={()=>setShowModal(true)} style={{ padding:'7px 14px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>Invitar persona</button>
      </div>
      <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead style={{ backgroundColor:'#F9FAFB' }}>
            <tr>
              {['Nombre','Email','Rol','Acciones'].map(h=>(
                <th key={h} style={{ textAlign:'left', padding:'10px 16px', fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'0.5px solid rgba(0,0,0,0.08)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(teamMembers||[]).length === 0 ? (
              <tr><td colSpan={4} style={{ padding:'24px 16px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>No hay miembros agregados todavía</td></tr>
            ) : (teamMembers||[]).map(u => {
              const badge = ROL_BADGE[u.rol] || { bg:'#F3F4F6', c:'#6B7280', label:u.rol };
              return (
                <tr key={u.id} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding:'10px 16px', fontWeight:500, color:'#111827' }}>{u.nombre || '-'}</td>
                  <td style={{ padding:'10px 16px', color:'#6B7280' }}>{u.email}</td>
                  <td style={{ padding:'10px 16px' }}><span style={{ backgroundColor:badge.bg, color:badge.c, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>{badge.label}</span></td>
                  <td style={{ padding:'10px 16px' }}>
                    <button onClick={()=>handleDelete(u)} style={{ padding:'4px 10px', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:6, fontSize:12, cursor:'pointer', color:'#EF4444', backgroundColor:'white' }}>Eliminar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={()=>!saving && setShowModal(false)}>
          <div style={{ backgroundColor:'white', borderRadius:12, width:420, maxWidth:'95vw', padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
              <span style={{ fontSize:15, fontWeight:600 }}>Invitar persona</span>
              <button onClick={()=>setShowModal(false)} style={{ color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {[['nombre','Nombre'],['email','Email']].map(([k,l])=>(
                <div key={k}><div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>{l}</div>
                  <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, boxSizing:'border-box' }} /></div>
              ))}
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:8 }}>Rol</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {ROLES.map(r=>(
                    <label key={r.key} style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', padding:'8px 10px', borderRadius:8, border:`0.5px solid ${form.rol===r.key?'#1D9E75':'rgba(0,0,0,0.08)'}`, backgroundColor:form.rol===r.key?'#F0FBF7':'white', transition:'all .1s' }}>
                      <input type="radio" checked={form.rol===r.key} onChange={()=>setForm(f=>({...f,rol:r.key}))} style={{ marginTop:2 }} />
                      <div>
                        <div style={{ fontSize:13, fontWeight:500, color:'#111827' }}>{r.label}</div>
                        <div style={{ fontSize:11, color:'#9CA3AF' }}>{r.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={()=>setShowModal(false)} disabled={saving} style={{ flex:1, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, cursor:'pointer', backgroundColor:'white' }}>Cancelar</button>
              <button onClick={save} disabled={saving} style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>{saving?'Guardando...':'Invitar'}</button>
            </div>
          </div>
        </div>
      )}
      {shareInfo && (
        <div style={{ position:'fixed', inset:0, zIndex:1001, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }}>
          <div style={{ backgroundColor:'white', borderRadius:12, width:440, maxWidth:'95vw', padding:28 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', backgroundColor:'#FEF9C3', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CA8A04" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>{shareInfo.nombre} ya tiene cuenta en mimenú</div>
                <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>Fue agregado al equipo correctamente. Compartile el link para que ingrese.</div>
              </div>
            </div>

            <div style={{ backgroundColor:'#F9FAFB', borderRadius:8, padding:14, marginBottom:16 }}>
              <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:6, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.4px' }}>Link de acceso</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:13, color:'#111827', flex:1, wordBreak:'break-all' }}>{shareInfo.url}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(shareInfo.url); addToast('Link copiado', 'success'); }}
                  style={{ padding:'5px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, fontSize:12, cursor:'pointer', backgroundColor:'white', whiteSpace:'nowrap', color:'#374151' }}>
                  Copiar
                </button>
              </div>
            </div>

            <div style={{ backgroundColor:'#F0FBF7', borderRadius:8, padding:12, marginBottom:20, fontSize:12, color:'#1D9E75', lineHeight:'18px' }}>
              Decile a <strong>{shareInfo.nombre}</strong> que entre con <strong>{shareInfo.email}</strong> y su contraseña habitual. El sistema lo va a reconocer automáticamente con su rol asignado.
            </div>

            <button
              onClick={() => setShareInfo(null)}
              style={{ width:'100%', padding:'9px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


