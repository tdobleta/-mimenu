import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { supabase } from '@/api/supabaseClient';

const ROLES = [
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
    const emailClean = form.email.trim().toLowerCase();
    if (!emailClean || !form.nombre?.trim()) { addToast('Ingresá nombre y email', 'error'); return; }
    setSaving(true);
    try {
      const restaurantId = store.restaurantId;
      if (!restaurantId) { addToast('No se encontró el restaurante', 'error'); setSaving(false); return; }

      // Verificar que el email no existe ya en el equipo de este restaurante (check local)
      const yaExiste = (store.teamMembers || []).some(m => m.email.toLowerCase() === emailClean);
      if (yaExiste) { addToast('Este email ya está en el equipo', 'error'); setSaving(false); return; }

      // Llamar Edge Function invite-member:
      //   - Crea cuenta Supabase Auth con link de invitación
      //   - Crea team_members record
      //   - Envía email con magic link vía Resend
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/invite-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: emailClean, nombre: form.nombre.trim(), rol: form.rol, restaurantId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error al invitar');

      // Refrescar lista local con el id real de DB. Si usamos un id temporal,
      // eliminar inmediatamente al miembro falla hasta recargar la app.
      addTeamMember(result.member || {
        id: crypto.randomUUID(),
        email: emailClean,
        nombre: form.nombre.trim(),
        rol: form.rol,
        restaurant_id: restaurantId,
      });

      setShareInfo({ nombre: form.nombre || emailClean, email: emailClean });
      setShowModal(false);
      setForm({ nombre:'', email:'', rol:'Mozo' });
    } catch(err) {
      console.error(err);
      const isConflict = err?.message?.includes('ya está en el equipo');
      addToast(isConflict ? 'Este email ya está en el equipo' : (err?.message || 'Error al invitar — verificá la conexión'), 'error');
    }
    setSaving(false);
  }

  async function handleDelete(member) {
    try {
      const restaurantId = store.restaurantId;
      if (!restaurantId) throw new Error('No se encontrÃ³ el restaurante');
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/invite-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'delete', restaurantId, memberId: member.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error al eliminar');
      removeTeamMember(member.id);
      addToast('Miembro eliminado', 'info');
    } catch(err) {
      addToast(err?.message || 'Error al eliminar', 'error');
    }
  }

  return (
    <div style={{ maxWidth:720, display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={()=>setShowModal(true)} style={{ padding:'7px 14px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>Invitar persona</button>
      </div>
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', borderRadius:12, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead style={{ backgroundColor:'#F9FAFB' }}>
            <tr>
              {['Nombre','Email','Rol','Acciones'].map(h=>(
                <th key={h} style={{ textAlign:'left', padding:'10px 16px', fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'1px solid #E2E8F0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(teamMembers||[]).length === 0 ? (
              <tr><td colSpan={4} style={{ padding:'24px 16px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>No hay miembros agregados todavía</td></tr>
            ) : (teamMembers||[]).map(u => {
              const badge = ROL_BADGE[u.rol] || { bg:'#F3F4F6', c:'#6B7280', label:u.rol };
              return (
                <tr key={u.id} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'10px 16px', fontWeight:500, color:'#111827' }}>{u.nombre || '-'}</td>
                  <td style={{ padding:'10px 16px', color:'#6B7280' }}>{u.email}</td>
                  <td style={{ padding:'10px 16px' }}><span style={{ backgroundColor:badge.bg, color:badge.c, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>{badge.label}</span></td>
                  <td style={{ padding:'10px 16px' }}>
                    <button onClick={()=>handleDelete(u)} style={{ padding:'4px 10px', border:'1px solid rgba(239,68,68,0.3)', borderRadius:6, fontSize:12, cursor:'pointer', color:'#EF4444', background:'#FFFFFF' }}>Eliminar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={()=>!saving && setShowModal(false)}>
          <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 8px 32px rgba(0,0,0,0.12)', borderRadius:14, width:420, maxWidth:'95vw', padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
              <span style={{ fontSize:15, fontWeight:600 }}>Invitar persona</span>
              <button onClick={()=>setShowModal(false)} style={{ color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {[['nombre','Nombre'],['email','Email']].map(([k,l])=>(
                <div key={k}><div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>{l}</div>
                  <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={{ width:'100%', padding:'7px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, boxSizing:'border-box' }} /></div>
              ))}
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:8 }}>Rol</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {ROLES.map(r=>(
                    <label key={r.key} style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', padding:'8px 10px', borderRadius:8, border:`1px solid ${form.rol===r.key?'#1D9E75':'#E2E8F0'}`, backgroundColor:form.rol===r.key?'#F0FBF7':'white', transition:'all .1s' }}>
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
              <button onClick={()=>setShowModal(false)} disabled={saving} style={{ flex:1, padding:'9px 0', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, cursor:'pointer', background:'#FFFFFF' }}>Cancelar</button>
              <button onClick={save} disabled={saving} style={{ flex:1, padding:'9px 0', border:'none', borderRadius:8, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>{saving?'Guardando...':'Invitar'}</button>
            </div>
          </div>
        </div>
      )}
      {shareInfo && (
        <div style={{ position:'fixed', inset:0, zIndex:1001, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }}>
          <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 8px 32px rgba(0,0,0,0.12)', borderRadius:14, width:440, maxWidth:'95vw', padding:28 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', backgroundColor:'#E8F7F2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Invitación enviada a {shareInfo.nombre}</div>
                <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>Cuenta creada y email enviado con el link de activación.</div>
              </div>
            </div>

            <div style={{ backgroundColor:'#F0FBF7', borderRadius:8, padding:14, marginBottom:20, fontSize:13, color:'#374151', lineHeight:'20px' }}>
              <strong>{shareInfo.nombre}</strong> recibirá un email en <strong>{shareInfo.email}</strong> para activar su cuenta y elegir contraseña.<br/>
              <span style={{ fontSize:12, color:'#6B7280', marginTop:4, display:'block' }}>Si no llega el email, revisá la carpeta de spam. La cuenta ya quedó invitada.</span>
            </div>

            <button
              onClick={() => setShareInfo(null)}
              style={{ width:'100%', padding:'9px 0', border:'none', borderRadius:8, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
