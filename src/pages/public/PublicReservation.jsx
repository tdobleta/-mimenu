import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

const FRANJAS_DEFAULT = ['12:00','12:30','13:00','13:30','14:00','20:00','20:30','21:00','21:30','22:00'];

export default function PublicReservation() {
  const { branchSlug } = useParams();
  const [form, setForm] = useState({ nombre:'', telefono:'', personas:2, fecha:'', hora:'', preferencias:'' });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [branch, setBranch] = useState(null);
  const [franjas, setFranjas] = useState(FRANJAS_DEFAULT);

  useEffect(() => {
    async function loadBranch() {
      if (!branchSlug) return;
      try {
        // El link ahora usa ID directo — fetch por ID sin traer todos los branches
        const branches = await base44.entities.Branch.filter({ id: branchSlug }).catch(() => []);
        const match = (branches || [])[0];
        if (match) {
          setBranch(match);
          if (match.franjas && match.franjas.length > 0) setFranjas(match.franjas);
        }
      } catch(e) {}
    }
    loadBranch();
  }, [branchSlug]);

  async function submit(e) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.telefono.trim() || !form.fecha || !form.hora) {
      setError('Por favor completá todos los campos obligatorios.');
      return;
    }
    if (!branch) {
      setError('No se pudo identificar el restaurante. Verificá el link.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await base44.entities.Reservation.create({
        branch_id: branch.id,
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim(),
        personas: form.personas,
        fecha: form.fecha,
        hora: form.hora,
        notas: form.preferencias.trim() || '',
        canal: 'Online',
        estado: 'en espera',
        email: '',
        mesa: '-',
      });
      setSent(true);
    } catch(err) {
      console.error(err);
      setError('No se pudo enviar la reserva. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const branchName = branch?.nombre || branchSlug?.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) || 'Nuestro restaurante';

  if (sent) {
    return (
      <div style={{ minHeight:'100vh', backgroundColor:'#F6F8FA', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans', sans-serif", padding:20 }}>
        <div style={{ backgroundColor:'white', borderRadius:16, padding:40, maxWidth:440, width:'100%', textAlign:'center', boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ width:64, height:64, borderRadius:'50%', backgroundColor:'#E8F7F2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize:22, fontWeight:700, color:'#111827', marginBottom:8 }}>¡Reserva recibida!</div>
          <div style={{ fontSize:14, color:'#6B7280', lineHeight:'22px', marginBottom:24 }}>
            Hola <strong>{form.nombre}</strong>, recibimos tu pedido para el <strong>{form.fecha}</strong> a las <strong>{form.hora}</strong> para <strong>{form.personas} personas</strong>.<br/><br/>
            Te contactaremos a <strong>{form.telefono}</strong> para confirmar.
          </div>
          <div style={{ backgroundColor:'#F9FAFB', borderRadius:10, padding:14, marginBottom:20 }}>
            <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:4 }}>Estado de tu reserva</div>
            <span style={{ backgroundColor:'#FEF9C3', color:'#CA8A04', padding:'4px 12px', borderRadius:99, fontSize:13, fontWeight:600 }}>En espera de confirmación</span>
          </div>
          <button onClick={()=>{ setSent(false); setForm({ nombre:'', telefono:'', personas:2, fecha:'', hora:'', preferencias:'' }); }}
            style={{ padding:'10px 24px', backgroundColor:'#1D9E75', color:'white', border:'none', borderRadius:8, fontSize:14, cursor:'pointer', fontWeight:500 }}>
            Nueva reserva
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#F6F8FA', fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ backgroundColor:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px 24px', display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:18, fontWeight:700, color:'#111827' }}>mi<span style={{ color:'#1D9E75' }}>menú</span></span>
        <span style={{ fontSize:13, color:'#9CA3AF' }}>·</span>
        <span style={{ fontSize:13, color:'#6B7280' }}>{branchName}</span>
      </div>
      <div style={{ maxWidth:520, margin:'40px auto', padding:'0 20px' }}>
        <div style={{ marginBottom:28, textAlign:'center' }}>
          <div style={{ fontSize:24, fontWeight:700, color:'#111827', marginBottom:6 }}>Reservar mesa</div>
          <div style={{ fontSize:14, color:'#6B7280' }}>{branchName}</div>
        </div>
        <div style={{ backgroundColor:'white', borderRadius:14, border:'0.5px solid rgba(0,0,0,0.08)', padding:28 }}>
          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:5, fontWeight:500 }}>Nombre *</div>
                <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Tu nombre" style={{ width:'100%', padding:'9px 12px', border:'0.5px solid rgba(0,0,0,0.14)', borderRadius:8, fontSize:14, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:5, fontWeight:500 }}>Teléfono *</div>
                <input value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} placeholder="+54 9 11..." style={{ width:'100%', padding:'9px 12px', border:'0.5px solid rgba(0,0,0,0.14)', borderRadius:8, fontSize:14, boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:5, fontWeight:500 }}>Fecha *</div>
                <input type="date" value={form.fecha} min={new Date().toISOString().split('T')[0]} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))} style={{ width:'100%', padding:'9px 12px', border:'0.5px solid rgba(0,0,0,0.14)', borderRadius:8, fontSize:14, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:5, fontWeight:500 }}>Hora *</div>
                <select value={form.hora} onChange={e=>setForm(f=>({...f,hora:e.target.value}))} style={{ width:'100%', padding:'9px 12px', border:'0.5px solid rgba(0,0,0,0.14)', borderRadius:8, fontSize:14, backgroundColor:'white', boxSizing:'border-box' }}>
                  <option value="">Elegir</option>
                  {franjas.map(fr=><option key={fr} value={fr}>{fr}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:5, fontWeight:500 }}>Personas *</div>
                <input type="number" min="1" max="20" value={form.personas} onChange={e=>setForm(f=>({...f,personas:Number(e.target.value)}))} style={{ width:'100%', padding:'9px 12px', border:'0.5px solid rgba(0,0,0,0.14)', borderRadius:8, fontSize:14, boxSizing:'border-box' }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize:12, color:'#6B7280', marginBottom:5, fontWeight:500 }}>Preferencias / comentarios</div>
              <textarea value={form.preferencias} onChange={e=>setForm(f=>({...f,preferencias:e.target.value}))} rows={3} placeholder="Ej: alergia a mariscos, silla bebé, cumpleaños..." style={{ width:'100%', padding:'9px 12px', border:'0.5px solid rgba(0,0,0,0.14)', borderRadius:8, fontSize:14, resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }} />
            </div>
            {error && <div style={{ backgroundColor:'#FEE2E2', color:'#DC2626', padding:'10px 14px', borderRadius:8, fontSize:13 }}>{error}</div>}
            <button type="submit" disabled={saving} style={{ padding:'12px 0', backgroundColor:'#1D9E75', color:'white', border:'none', borderRadius:8, fontSize:15, fontWeight:600, cursor:saving?'not-allowed':'pointer', opacity:saving?0.7:1, marginTop:4 }}>
              {saving ? 'Enviando...' : 'Solicitar reserva'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}


