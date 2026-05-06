import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { money } from '@/lib/fmt';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';

export default function CloseShiftModal({ ventasPorMetodo, totalVentas, retirosTotales, retirosEfectivo, efectivoEsperado, tipoTurno, mesasAbiertas = 0, onClose, onClosed }) {
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [arqueo, setArqueo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const arqueoNum = arqueo === '' ? null : parseFloat(arqueo) || 0;
  const diferencia = arqueoNum === null ? 0 : arqueoNum - efectivoEsperado;

  async function confirm() {
    if (!store.turnoActivo) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const tipoLabels = { manana:'Mañana', tarde:'Tarde', noche:'Noche', general:'General' };
      const dCierre = new Date();
      const fechaCierre = `${String(dCierre.getDate()).padStart(2,'0')}/${String(dCierre.getMonth()+1).padStart(2,'0')}/${String(dCierre.getFullYear()).slice(-2)}`;
      const nombreTurno = 'Caja ' + (tipoLabels[tipoTurno] || tipoTurno) + ' · ' + fechaCierre;
      // Recalcular desde Turns reales con caja_shift_id para máxima confiabilidad
      const turnsDeEstaCaja = await base44.entities.Turn.filter({
        caja_shift_id: store.turnoActivo.id,
        status: 'cerrada',
      }).catch(() => []);
      const totalReal = (turnsDeEstaCaja || []).reduce((a, t) => a + (t.total_facturado || 0) + (t.propina || 0), 0);
      const totalFinal = totalReal > 0 ? totalReal : totalVentas;

      await base44.entities.CajaShift.update(store.turnoActivo.id, {
        cerrado_at: Date.now(),
        status: 'cerrado',
        arqueo_efectivo: arqueoNum || 0,
        diferencia_caja: diferencia,
        motivo_diferencia: motivo,
        total_facturado_turno: totalFinal,
        retiros: JSON.stringify(store.turnoActivo.retiros || []),
        nombre_turno: nombreTurno,
      });
      store.cerrarTurnoActivo();
      store.logAccion({
        usuario: user?.email || 'Sistema',
        rol: userRole,
        categoria: 'Caja',
        accion: 'Turno cerrado',
        detalle: 'Total ' + money(totalVentas) + ' · Diferencia ' + (diferencia === 0 ? '$0 (cuadró)' : money(diferencia)),
        sucursal: store.sucursales.find(s => s.id === store.branchId)?.nombre || '',
      });
      if (store.refreshCharts) store.refreshCharts();

      let msg = 'Turno cerrado · La caja cuadra';
      if (diferencia > 0) msg = `Turno cerrado · Sobraron ${money(diferencia)}`;
      else if (diferencia < 0) msg = `Turno cerrado · Faltaron ${money(Math.abs(diferencia))}`;
      addToast(msg, diferencia === 0 ? 'success' : 'info');
      onClosed();
    } catch(err) {
      console.error(err);
      setErrorMsg('No se pudo cerrar el turno. Revisá tu conexión e intentá de nuevo.');
      setSaving(false);
    }
  }

  let arqueoBox = null;
  if (arqueoNum !== null) {
    if (diferencia === 0) {
      arqueoBox = { bg:'#E8F7F2', color:'#1D9E75', icon:'✓', text:'La caja cuadra perfectamente' };
    } else if (diferencia > 0) {
      arqueoBox = { bg:'#DBEAFE', color:'#3B82F6', icon:'↑', text:`Sobran ${money(diferencia)} en caja` };
    } else {
      arqueoBox = { bg:'#FEE2E2', color:'#EF4444', icon:'↓', text:`Faltan ${money(Math.abs(diferencia))} en caja` };
    }
  }

  const tipoLabel = { manana:'Mañana', tarde:'Tarde', noche:'Noche', general:'General' }[tipoTurno] || tipoTurno;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)', overflowY:'auto', padding:'20px 0' }} onClick={saving?undefined:onClose}>
      <div style={{ backgroundColor:'white', borderRadius:12, width:540, maxWidth:'95vw', padding:24, maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
        {/* Sección 1 — Resumen */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <span style={{ fontSize:16, fontWeight:600, color:'#111827' }}>Resumen del turno</span>
          <span style={{ backgroundColor:'#F3F4F6', color:'#6B7280', padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:600 }}>{tipoLabel}</span>
        </div>
        {mesasAbiertas > 0 && (
          <div style={{ backgroundColor:'#FEF9C3', border:'0.5px solid #FCD34D', borderRadius:8, padding:'10px 14px', display:'flex', gap:10, alignItems:'flex-start', marginBottom:14 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CA8A04" strokeWidth="2" style={{ flexShrink:0, marginTop:1 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <div style={{ fontSize:13, color:'#92400E', fontWeight:700 }}>Hay {mesasAbiertas} mesa{mesasAbiertas > 1 ? 's' : ''} abierta{mesasAbiertas > 1 ? 's' : ''} en el salón.</div>
              <div style={{ fontSize:12, color:'#CA8A04', marginTop:2 }}>Podés cerrar el turno igual o volver al salón a cerrarlas primero.</div>
            </div>
          </div>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
          <Row label="Total facturado" value={money(totalVentas)} valueColor="#1D9E75" valueBold />
          {Object.entries(ventasPorMetodo).map(([m,v]) => (
            <Row key={m} label={m} value={money(v)} sub />
          ))}
          <Row label="Total retiros" value={`-${money(retirosTotales)}`} valueColor="#F97316" />
          <div style={{ height:'0.5px', backgroundColor:'rgba(0,0,0,0.08)', margin:'6px 0' }} />
          <Row label="Efectivo esperado en el cajón" value={money(efectivoEsperado)} valueColor="#3B82F6" valueBold />
          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:-2 }}>(Fondo inicial + efectivo cobrado − retiros en efectivo)</div>
        </div>

        <div style={{ height:'0.5px', backgroundColor:'rgba(0,0,0,0.08)', margin:'18px 0' }} />

        {/* Sección 2 — Arqueo */}
        <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginBottom:6 }}>Conteo físico de caja</div>
        <div style={{ fontSize:12, color:'#6B7280', marginBottom:12 }}>Contá el dinero que tenés físicamente en el cajón y escribí el total.</div>
        <div style={{ position:'relative', marginBottom:12 }}>
          <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:24, color:'#6B7280', fontWeight:500 }}>$</span>
          <input type="number" value={arqueo} onChange={e=>setArqueo(e.target.value)} placeholder="0"
            style={{ width:'100%', padding:'14px 14px 14px 36px', border: arqueoNum !== null ? '1.5px solid #1D9E75' : '0.5px solid rgba(0,0,0,0.12)', borderRadius:8, fontSize:32, fontWeight:700, textAlign:'center', boxSizing:'border-box', outline:'none' }} />
        </div>
        {arqueoBox && (
          <div style={{ backgroundColor:arqueoBox.bg, borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:16, color:arqueoBox.color, fontWeight:700 }}>{arqueoBox.icon}</span>
            <span style={{ fontSize:13, color:arqueoBox.color, fontWeight:600 }}>{arqueoBox.text}</span>
          </div>
        )}
        {arqueoNum !== null && diferencia !== 0 && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Motivo de la diferencia (opcional)</div>
            <input value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Ej: Vuelto que no se devolvió"
              style={{ width:'100%', padding:'8px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
          </div>
        )}

        <div style={{ height:'0.5px', backgroundColor:'rgba(0,0,0,0.08)', margin:'18px 0' }} />

        {errorMsg && (
          <div style={{ backgroundColor:'#FEE2E2', color:'#EF4444', borderRadius:7, padding:'10px 14px', fontSize:13, marginBottom:10 }}>{errorMsg}</div>
        )}

        {/* Sección 3 — Confirmación */}
        <button onClick={confirm} disabled={saving}
          style={{ width:'100%', padding:'13px 0', border:'none', borderRadius:8, fontSize:14, fontWeight:600, color:'white', backgroundColor:'#1D9E75', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>
          {saving?'Cerrando turno...':'Cerrar turno y guardar'}
        </button>
        <button onClick={onClose} disabled={saving} style={{ width:'100%', marginTop:8, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>Cancelar</button>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor, valueBold, sub }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize: sub?12:13, color: sub?'#6B7280':'#111827', paddingLeft: sub?14:0 }}>
      <span>{label}</span>
      <span style={{ color: valueColor || (sub?'#6B7280':'#111827'), fontWeight: valueBold?700:500 }}>{value}</span>
    </div>
  );
}


