import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { money } from '@/lib/fmt';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';

const TIPOS = [
  { key:'manana', label:'Mañana', horario:'7:00 — 13:00' },
  { key:'tarde', label:'Tarde', horario:'13:00 — 20:00' },
  { key:'noche', label:'Noche', horario:'20:00 — 00:00' },
  { key:'general', label:'General', horario:'Todo el día' },
];

export default function OpenShiftModal({ onClose }) {
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [tipo, setTipo] = useState('manana');
  const [fondo, setFondo] = useState('');
  const [saving, setSaving] = useState(false);

  // Eliminar puntos de miles (formato argentino: "10.000" = diez mil, no diez)
  const fondoNum = parseFloat((fondo || '').replace(/\./g, '').replace(',', '.')) || 0;
  const branchId = store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id;
  const tipoLabel = TIPOS.find(t => t.key === tipo)?.label || '';

  async function confirm() {
    if (!branchId) return;
    setSaving(true);
    try {
      // Verificar si ya hay un turno abierto para esta sucursal
      const existing = await base44.entities.CajaShift.filter({ branch_id: branchId, status: 'abierto' });
      if (existing?.length > 0) {
        addToast('Ya hay un turno abierto en esta sucursal. Cerralo antes de abrir uno nuevo.', 'warning');
        setSaving(false);
        return;
      }
      const now = new Date().toISOString();
      const created = await base44.entities.CajaShift.create({
        branch_id: branchId,
        tipo_turno: tipo,
        fondo_inicial: fondoNum,
        abierto_at: now,
        status: 'abierto',
        retiros: '[]',
        total_facturado_turno: 0,
      });
      store.setTurnoActivo({
        id: created.id,
        branchId,
        fondoInicial: fondoNum,
        abiertaAt: now,
        tipoTurno: tipo,
        retiros: [],
      });
      store.logAccion({
        usuario: user?.email || 'Sistema',
        rol: userRole,
        categoria: 'Caja',
        accion: 'Turno abierto',
        detalle: 'Turno ' + tipoLabel + ' · Fondo $' + fondoNum,
        sucursal: store.sucursales.find(s => s.id === branchId)?.nombre || '',
      });
      addToast('Turno abierto correctamente', 'success');
      onClose();
    } catch(err) {
      console.error(err);
      const isDuplicate = err?.code === '23505' || err?.message?.includes('duplicate') || err?.message?.includes('unique');
      if (isDuplicate) {
        addToast('Ya existe un turno abierto. Recargá la página para verlo.', 'warning');
      } else {
        addToast('No se pudo abrir el turno. Revisá tu conexión e intentá de nuevo.', 'error');
      }
      setSaving(false);
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={saving?undefined:onClose}>
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 8px 32px rgba(0,0,0,0.12)', borderRadius:14, width:420, maxWidth:'95vw', padding:24 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', backgroundColor:'#E8F7F2', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <span style={{ fontSize:16, fontWeight:600, color:'#111827' }}>Abrir turno</span>
        </div>

        <div style={{ fontSize:12, color:'#6B7280', marginBottom:8 }}>Tipo de turno</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
          {TIPOS.map(t => (
            <button key={t.key} onClick={()=>setTipo(t.key)}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:99, fontSize:13, cursor:'pointer', backgroundColor: tipo===t.key?'#E8F7F2':'white', color: tipo===t.key?'#1D9E75':'#374151', border: tipo===t.key?'1.5px solid #1D9E75':'1px solid #E2E8F0', fontWeight: tipo===t.key?600:400 }}>
              <span>{t.label}</span>
              <span style={{ fontSize:11, color: tipo===t.key?'#1D9E75':'#9CA3AF' }}>{t.horario}</span>
            </button>
          ))}
        </div>

        <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>Fondo de caja inicial</div>
        <div style={{ position:'relative', marginBottom:6 }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:18, color:'#6B7280', fontWeight:500 }}>$</span>
          <input type="number" value={fondo} onChange={e=>setFondo(e.target.value)} placeholder="0"
            style={{ width:'100%', padding:'12px 12px 12px 28px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:18, fontWeight:600, boxSizing:'border-box' }} />
        </div>
        <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:14, lineHeight:'15px' }}>
          El dinero en efectivo que hay en el cajón al empezar el turno (cambio, efectivo previo)
        </div>

        <div style={{ backgroundColor:'#F9FAFB', borderRadius:8, padding:'10px 12px', marginBottom:14, fontSize:13, color:'#374151' }}>
          Turno <strong>{tipoLabel}</strong> — fondo <strong>{money(fondoNum)}</strong>
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'10px 0', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, color:'#374151', background:'#FFFFFF', cursor:saving?'not-allowed':'pointer' }}>Cancelar</button>
          <button onClick={confirm} disabled={saving} style={{ flex:1, padding:'10px 0', border:'none', borderRadius:8, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>
            {saving?'Abriendo...':'Abrir turno'}
          </button>
        </div>
      </div>
    </div>
  );
}


