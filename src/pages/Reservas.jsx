import { useState } from 'react';
import { useStore } from '@/lib/store';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/lib/toast';
import { dateShort } from '@/lib/fmt';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';
import emailjs from 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm';

const BADGE = {
  confirmada: { bg:'#E8F7F2', c:'#1D9E75' },
  'en espera':{ bg:'#FEF9C3', c:'#CA8A04' },
  cancelada:  { bg:'#FEE2E2', c:'#EF4444' },
};
const CANAL_BADGE = { Web:['#DBEAFE','#3B82F6'], Manual:['#F3F4F6','#6B7280'], Teléfono:['#FEF9C3','#CA8A04'] };

function SBadge({ v, map }) {
  const [bg,c] = map[v] || ['#F3F4F6','#6B7280'];
  return <span style={{ backgroundColor:bg, color:c, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>{v}</span>;
}

export default function Reservas() {
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [tab, setTab] = useState('hoy');
  const [showNew, setShowNew] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];
  const next7 = new Date(); next7.setDate(next7.getDate()+7);
  const next7Str = next7.toISOString().split('T')[0];
  const reservas = store.getReservas();
  const showSucursalCol = store.branchId === 'todas';

  const filtered = reservas.filter(r => {
    if (tab==='hoy') return r.fecha === todayStr;
    if (tab==='proximos') return r.fecha > todayStr && r.fecha <= next7Str;
    return r.fecha < todayStr;
  });

  const sucursalNombre = (r) => r.sucursalNombre || store.sucursales.find(s=>s.id===store.branchId)?.nombre || '';
  const confirm = async (r) => {
    const bid = r.sucursalNombre
      ? store.sucursales.find(s => s.nombre === r.sucursalNombre)?.id || store.branchId
      : store.branchId;
    try {
      await base44.entities.Reservation.update(r.id, { estado: 'confirmada' });
      store.updateReservation(bid, r.id, { estado: 'confirmada' });
      store.logAccion({ usuario: user?.email || 'Sistema', rol: userRole, categoria: 'Reservas', accion: 'Reserva confirmada', detalle: r.nombre + ' · ' + r.fecha + ' ' + r.hora, sucursal: sucursalNombre(r) });
      addToast('Reserva confirmada', 'success');

      // Enviar mail de confirmación al cliente si tiene email
      if (r.email && r.email.trim()) {
        if (!store.restaurante?.emailjs_config) {
          addToast('Reserva confirmada. Para enviar mails automáticos configurá EmailJS en Configuración → Restaurante.', 'info');
        } else {
          const restaurantName = store.restaurante?.nombre || store.sucursales.find(s => s.id === bid)?.nombre || 'el restaurante';
          try {
            const emailCfg = JSON.parse(store.restaurante.emailjs_config);
            await emailjs.send(
              emailCfg.serviceId,
              emailCfg.templateId,
              {
                cliente_nombre: r.nombre || 'Cliente',
                cliente_email: r.email.trim(),
                fecha: r.fecha || '',
                hora: r.hora || '',
                personas: r.personas || '',
                restaurant_name: restaurantName,
              },
              emailCfg.publicKey
            );
            addToast('Mail de confirmación enviado al cliente', 'success');
          } catch(mailErr) {
            console.error('Error enviando mail:', mailErr);
            addToast('Reserva confirmada, pero no se pudo enviar el mail al cliente', 'warning');
          }
        }
      }
    } catch(err) {
      console.error(err);
      addToast('Error al confirmar reserva', 'error');
    }
  };

  const cancel = async (r) => {
    const bid = r.sucursalNombre
      ? store.sucursales.find(s => s.nombre === r.sucursalNombre)?.id || store.branchId
      : store.branchId;
    try {
      await base44.entities.Reservation.update(r.id, { estado: 'cancelada' });
      store.updateReservation(bid, r.id, { estado: 'cancelada' });
      store.logAccion({ usuario: user?.email || 'Sistema', rol: userRole, categoria: 'Reservas', accion: 'Reserva cancelada', detalle: r.nombre + ' · ' + r.fecha + ' ' + r.hora, sucursal: sucursalNombre(r) });
      addToast('Reserva cancelada', 'info');
    } catch(err) {
      console.error(err);
      addToast('Error al cancelar reserva', 'error');
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:20, fontWeight:600, color:'#111827', margin:0 }}>Reservas</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setShowLink(true)}
            style={{ padding:'7px 14px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>
            Link de reservas
          </button>
          <button onClick={() => setShowNew(true)}
            style={{ padding:'7px 14px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>
            + Nueva reserva
          </button>
        </div>
      </div>

      <div style={{ display:'flex', borderBottom:'0.5px solid rgba(0,0,0,0.08)' }}>
        {[['hoy','Hoy'],['proximos','Próximos 7 días'],['historial','Historial']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{ padding:'8px 16px', fontSize:13, border:'none', background:'none', cursor:'pointer', marginBottom:-1, fontWeight: tab===k?500:400, color: tab===k?'#1D9E75':'#9CA3AF', borderBottom: tab===k?'2px solid #1D9E75':'2px solid transparent', transition:'all .15s' }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflowX:'auto' }}>
        <table style={{ width:'100%', tableLayout:'fixed', borderCollapse:'collapse', fontSize:13, minWidth:795 }}>
          <colgroup>
            <col style={{ width:65 }} />
            <col style={{ width:200 }} />
            <col style={{ width:75 }} />
            <col style={{ width:65 }} />
            <col style={{ width:85 }} />
            {showSucursalCol && <col style={{ width:130 }} />}
            <col style={{ width:105 }} />
            <col style={{ width:200 }} />
          </colgroup>
          <thead style={{ backgroundColor:'#F9FAFB' }}>
            <tr>
              {['Hora','Cliente','Personas','Mesa','Canal',...(showSucursalCol?['Sucursal']:[]),'Estado','Acciones'].map(h=>(
                <th key={h} style={{ textAlign:'left', padding:'10px 14px', fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'0.5px solid rgba(0,0,0,0.08)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding:'32px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>No hay reservas para este período.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                <td style={{ padding:'10px 14px', fontWeight:600, color:'#1D9E75' }}>{r.hora}</td>
                <td style={{ padding:'10px 14px', overflow:'hidden' }}>
                  <div style={{ fontWeight:500, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.nombre}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{r.telefono}</div>
                </td>
                <td style={{ padding:'10px 14px', color:'#374151' }}>{r.personas}</td>
                <td style={{ padding:'10px 14px', color:'#374151' }}>{r.mesa}</td>
                <td style={{ padding:'10px 14px' }}><SBadge v={r.canal} map={CANAL_BADGE} /></td>
                {showSucursalCol && <td style={{ padding:'10px 14px', fontSize:12, color:'#6B7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.sucursalNombre}</td>}
                <td style={{ padding:'10px 14px' }}>
                  <span style={{ backgroundColor:BADGE[r.estado]?.bg||'#F3F4F6', color:BADGE[r.estado]?.c||'#6B7280', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>{r.estado}</span>
                </td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {r.estado==='en espera' && <>
                      <Btn onClick={()=>confirm(r)} style={{ backgroundColor:'#1D9E75', color:'white', border:'none' }}>Confirmar</Btn>
                      <Btn onClick={()=>cancel(r)}  style={{ border:'0.5px solid rgba(0,0,0,0.12)', color:'#374151' }}>Cancelar</Btn>
                    </>}
                    {r.estado==='confirmada' && <>
                      <Btn onClick={()=>cancel(r)}  style={{ border:'0.5px solid rgba(0,0,0,0.12)', color:'#374151' }}>Cancelar</Btn>
                      <Btn style={{ color:'#6B7280', border:'none', background:'none' }}>Ver</Btn>
                    </>}
                    {r.estado==='cancelada' && <Btn style={{ color:'#6B7280', border:'none', background:'none' }}>Ver</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew  && <NewReservationModal store={store} addToast={addToast} onClose={()=>setShowNew(false)} />}
      {showLink && <LinkModal onClose={()=>setShowLink(false)} sucursal={store.getActiveBranch()} />}
    </div>
  );
}

function Btn({ onClick, style={}, children }) {
  return (
    <button onClick={onClick} style={{ padding:'4px 10px', borderRadius:6, fontSize:12, cursor:'pointer', backgroundColor:'white', transition:'all .15s', whiteSpace:'nowrap', ...style }}>
      {children}
    </button>
  );
}

function NewReservationModal({ store, addToast, onClose }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ nombre:'', telefono:'', email:'', fecha:today, hora:'13:00', personas:2, notas:'', celiaco:false, vegetariano:false, vegano:false, cumple:false });
  const activeBranch = store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id;
  const sucursal = store.sucursales.find(s=>s.id===activeBranch);
  const franjas = sucursal?.franjas || [];

  const preview = `Hola ${form.nombre||'[Nombre]'}, tu reserva en ${store.restaurante.nombre} para el ${dateShort(form.fecha)} a las ${form.hora} está confirmada. Personas: ${form.personas}. ¡Te esperamos!`;

  async function save() {
    if (!form.nombre.trim()) return;
    try {
      const activeBranch2 = store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id;
      const created = await base44.entities.Reservation.create({
        branch_id: activeBranch2,
        hora: form.hora,
        nombre: form.nombre,
        telefono: form.telefono,
        email: form.email || '',
        personas: form.personas,
        mesa: '-',
        canal: 'Manual',
        estado: 'confirmada',
        fecha: form.fecha,
        notas: form.notas || '',
      });
      store.addReservation(activeBranch2, {
        id: created.id,
        hora: form.hora,
        nombre: form.nombre,
        telefono: form.telefono,
        personas: form.personas,
        mesa: '-',
        canal: 'Manual',
        estado: 'confirmada',
        fecha: form.fecha,
      });
      addToast('Reserva creada', 'success');
      onClose();
    } catch(err) {
      console.error('Error guardando reserva:', err);
      addToast('Error al guardar reserva', 'error');
    }
  }

  const F = ({k,label,type='text'}) => (
    <div>
      <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>{label}</div>
      <input type={type} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} />
    </div>
  );
  const Toggle = ({v,onChange}) => (
    <button onClick={()=>onChange(!v)} style={{ position:'relative', width:40, height:22, borderRadius:99, border:'none', cursor:'pointer', backgroundColor:v?'#1D9E75':'#E5E7EB', padding:2, flexShrink:0 }}>
      <span style={{ display:'inline-block', width:18, height:18, borderRadius:'50%', backgroundColor:'white', transition:'transform .2s', transform:v?'translateX(18px)':'translateX(0)' }} />
    </button>
  );

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)', overflowY:'auto', padding:'20px 0' }} onClick={onClose}>
      <div style={{ backgroundColor:'white', borderRadius:12, width:520, maxWidth:'95vw', overflow:'hidden' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'0.5px solid rgba(0,0,0,0.08)' }}>
          <span style={{ fontSize:15, fontWeight:600 }}>Nueva reserva</span>
          <button onClick={onClose} style={{ color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12, maxHeight:'65vh', overflowY:'auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <F k="nombre" label="Nombre" />
            <F k="telefono" label="Teléfono" />
          </div>
          <F k="email" label="Email (opcional)" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            <div>
              <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Fecha</div>
              <input type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))} style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Hora</div>
              <select value={form.hora} onChange={e=>setForm(f=>({...f,hora:e.target.value}))} style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, backgroundColor:'white' }}>
                {franjas.map(fr=><option key={fr} value={fr}>{fr}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Personas</div>
              <input type="number" min="1" value={form.personas} onChange={e=>setForm(f=>({...f,personas:Number(e.target.value)}))} style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>Preferencias</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
              {[['celiaco','Celíaco'],['vegetariano','Vegetariano'],['vegano','Vegano'],['cumple','Cumpleaños']].map(([k,l])=>(
                <label key={k} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13 }}>
                  <input type="checkbox" checked={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.checked}))} />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <F k="notas" label="Notas internas" />

        </div>
        <div style={{ display:'flex', gap:8, padding:'14px 20px', borderTop:'0.5px solid rgba(0,0,0,0.08)' }}>
          <button onClick={onClose} style={{ flex:1, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>Cancelar</button>
          <button onClick={save}    style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>Guardar reserva</button>
        </div>
      </div>
    </div>
  );
}

function LinkModal({ onClose, sucursal }) {
  const [active, setActive] = useState(sucursal?.acepta_reservas_online !== false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  async function toggleActive(val) {
    setActive(val);
    if (!sucursal?.id) return;
    setSaving(true);
    try {
      await base44.entities.Branch.update(sucursal.id, { acepta_reservas_online: val });
    } catch(e) {
      setActive(!val);
    } finally {
      setSaving(false);
    }
  }
  const url = `${window.location.origin}/public/reservas/${sucursal?.id || 'sin-id'}`;
  function copy() { navigator.clipboard.writeText(url).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),2000); }
  const T = ({v, onChange, disabled})=>(
    <button onClick={() => !disabled && onChange(!v)} style={{ position:'relative', width:40, height:22, borderRadius:99, border:'none', cursor: disabled ? 'not-allowed' : 'pointer', backgroundColor:v?'#1D9E75':'#E5E7EB', padding:2, opacity: disabled ? 0.6 : 1, flexShrink:0 }}>
      <span style={{ display:'inline-block', width:18, height:18, borderRadius:'50%', backgroundColor:'white', transition:'transform .2s', transform:v?'translateX(18px)':'translateX(0)' }} />
    </button>
  );
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div style={{ backgroundColor:'white', borderRadius:12, width:460, maxWidth:'95vw', padding:24 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
          <span style={{ fontSize:15, fontWeight:600 }}>Link de reservas</span>
          <button onClick={onClose} style={{ color:'#9CA3AF', background:'none', border:'none', cursor:'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          <input readOnly value={url} style={{ flex:1, padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:7, fontSize:12, color:'#374151', backgroundColor:'#F9FAFB' }} />
          <button onClick={copy} style={{ padding:'7px 16px', backgroundColor:'#1D9E75', color:'white', border:'none', borderRadius:7, fontSize:13, cursor:'pointer' }}>{copied?'¡Copiado!':'Copiar'}</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <span style={{ fontSize:13 }}>Recibir reservas online</span>
          <T v={active} onChange={toggleActive} disabled={saving} />
        </div>
        <p style={{ fontSize:12, color:'#9CA3AF', lineHeight:'18px' }}>Compartí este link con tus clientes para que reserven solos. Las reservas llegan con estado "en espera" y podés confirmarlas manualmente.</p>
      </div>
    </div>
  );
}


