import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { money } from '@/lib/fmt';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';
import { enqueue } from '@/lib/offlineQueue';
import { getActiveStaff } from '@/lib/useActiveStaff';

const CONCEPTOS = ['Retiro recaudación','Pago proveedor','Gastos operativos','Otro'];

export default function AddRetiroModal({ onClose }) {
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [concepto, setConcepto] = useState('Retiro recaudación');
  const [otroTexto, setOtroTexto] = useState('');
  const [monto, setMonto] = useState('');
  const [saving, setSaving] = useState(false);

  const montoNum = parseFloat(monto) || 0;
  const conceptoFinal = concepto === 'Otro' ? otroTexto.trim() : concepto;

  async function confirm() {
    if (montoNum <= 0 || !conceptoFinal || !store.turnoActivo) return;
    setSaving(true);
    const retiro = { ts: Date.now(), concepto: conceptoFinal, monto: montoNum };
    try {
      // Usar RPC atómico en lugar de JS read-modify-write.
      // append_caja_retiro usa operador || de PostgreSQL → sin race conditions
      // aunque dos tablets ejecuten simultáneamente.
      const { error } = await supabase.rpc('append_caja_retiro', {
        p_shift_id:    store.turnoActivo.id,
        p_retiro_json: retiro,
      });
      if (error) throw error;
      store.addRetiro(retiro);
      store.logAccion({
        usuario: getActiveStaff()?.nombre || user?.email || 'Sistema',
        rol: userRole,
        categoria: 'Caja',
        accion: 'Retiro de caja',
        detalle: conceptoFinal + ' · ' + money(montoNum),
        sucursal: store.sucursales.find(s => s.id === store.branchId)?.nombre || '',
      });
      addToast(`Retiro registrado: -${money(montoNum)}`, 'success');
      onClose();
    } catch(err) {
      console.error(err);
      // Guardar en store local + encolar para sincronizar al reconectar
      store.addRetiro(retiro);
      enqueue({ type: 'CAJA_RETIRO', cajaShiftId: store.turnoActivo.id, retiro }).catch(() => {});
      addToast('Retiro guardado sin conexión. Se sincronizará al reconectar.', 'warning');
      onClose();
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={saving?undefined:onClose}>
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 8px 32px rgba(0,0,0,0.12)', borderRadius:14, width:380, maxWidth:'95vw', padding:24 }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontSize:16, fontWeight:600, color:'#111827', marginBottom:14 }}>Registrar retiro de caja</div>

        <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>Concepto</div>
        <select value={concepto} onChange={e=>setConcepto(e.target.value)}
          style={{ width:'100%', padding:'8px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'#FFFFFF', marginBottom:concepto==='Otro'?8:14, boxSizing:'border-box' }}>
          {CONCEPTOS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {concepto === 'Otro' && (
          <input value={otroTexto} onChange={e=>setOtroTexto(e.target.value)} placeholder="Describí el concepto"
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, marginBottom:14, boxSizing:'border-box' }} />
        )}

        <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>Monto</div>
        <div style={{ position:'relative', marginBottom:18 }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:16, color:'#6B7280', fontWeight:500 }}>$</span>
          <input type="number" value={monto} onChange={e=>setMonto(e.target.value)} placeholder="0"
            style={{ width:'100%', padding:'10px 12px 10px 28px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:16, fontWeight:600, boxSizing:'border-box' }} />
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} disabled={saving} style={{ flex:1, padding:'10px 0', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, color:'#374151', background:'#FFFFFF', cursor:'pointer' }}>Cancelar</button>
          <button onClick={confirm} disabled={saving || montoNum<=0 || !conceptoFinal}
            style={{ flex:1, padding:'10px 0', border:'none', borderRadius:8, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer', opacity:(saving||montoNum<=0||!conceptoFinal)?0.5:1 }}>
            {saving?'Guardando...':'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}


