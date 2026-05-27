import { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { money } from '@/lib/fmt';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';
import { getActiveStaff, touchActiveStaff } from '@/lib/useActiveStaff';
import { closeCajaShiftOperation, createCloseShiftOperationId } from '@/lib/cajaShiftOperations';
import { closeShiftSchema } from '@/lib/schemas/caja';
import FieldError from '@/components/ui/FieldError';

export default function CloseShiftModal({
  ventasPorMetodo,
  totalVentas,
  retirosTotales,
  efectivoEsperado,
  tipoTurno,
  mesasAbiertas = 0,
  onClose,
  onClosed,
}) {
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [arqueo, setArqueo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [errors, setErrors] = useState({});
  const operationIdRef = useRef(null);

  const arqueoNum = arqueo === '' ? null : parseFloat(arqueo) || 0;
  const diferencia = arqueoNum === null ? 0 : arqueoNum - efectivoEsperado;

  async function confirm() {
    if (!store.turnoActivo) return;
    setErrors({});
    const validation = closeShiftSchema.safeParse({ arqueoEfectivo: arqueoNum || 0, motivoDiferencia: motivo });
    if (!validation.success) {
      const errs = {};
      for (const issue of validation.error.issues) {
        const key = issue.path[0];
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      addToast('Revisá los datos del cierre', 'error');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const tipoLabels = { manana:'Manana', tarde:'Tarde', noche:'Noche', general:'General' };
      const dCierre = new Date();
      const fechaCierre = `${String(dCierre.getDate()).padStart(2,'0')}/${String(dCierre.getMonth()+1).padStart(2,'0')}/${String(dCierre.getFullYear()).slice(-2)}`;
      const nombreTurno = `Caja ${tipoLabels[tipoTurno] || tipoTurno} - ${fechaCierre}`;

      if (!operationIdRef.current) {
        operationIdRef.current = createCloseShiftOperationId(store.turnoActivo.id);
      }

      const result = await closeCajaShiftOperation({
        operationId: operationIdRef.current,
        restaurantId: store.restaurantId,
        branchId: store.turnoActivo.branchId || (store.branchId !== 'todas' ? store.branchId : null),
        shiftId: store.turnoActivo.id,
        arqueoEfectivo: arqueoNum || 0,
        motivoDiferencia: motivo,
        nombreTurno,
        user,
        role: userRole,
        activeStaff: getActiveStaff(),
      });

      store.cerrarTurnoActivo();
      if (store.refreshCharts) store.refreshCharts();

      const serverDiff = Number(result?.diferencia_caja ?? diferencia);
      let msg = 'Turno cerrado - La caja cuadra';
      if (serverDiff > 0) msg = `Turno cerrado - Sobraron ${money(serverDiff)}`;
      else if (serverDiff < 0) msg = `Turno cerrado - Faltaron ${money(Math.abs(serverDiff))}`;
      touchActiveStaff();
      addToast(msg, serverDiff === 0 ? 'success' : 'info');
      onClosed();
    } catch(err) {
      console.error(err);
      const msg = err?.message?.includes('hay mesas abiertas')
        ? 'No se pudo cerrar: todavia hay mesas abiertas.'
        : 'No se pudo cerrar el turno. Revisa tu conexion e intenta de nuevo.';
      setErrorMsg(msg);
      setSaving(false);
    }
  }

  let arqueoBox = null;
  if (arqueoNum !== null) {
    if (diferencia === 0) {
      arqueoBox = { bg:'#E8F7F2', color:'#1D9E75', icon:'OK', text:'La caja cuadra perfectamente' };
    } else if (diferencia > 0) {
      arqueoBox = { bg:'#DBEAFE', color:'#3B82F6', icon:'+', text:`Sobran ${money(diferencia)} en caja` };
    } else {
      arqueoBox = { bg:'#FEE2E2', color:'#EF4444', icon:'-', text:`Faltan ${money(Math.abs(diferencia))} en caja` };
    }
  }

  const tipoLabel = { manana:'Manana', tarde:'Tarde', noche:'Noche', general:'General' }[tipoTurno] || tipoTurno;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)', overflowY:'auto', padding:'20px 0' }} onClick={saving?undefined:onClose}>
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 8px 32px rgba(0,0,0,0.12)', borderRadius:14, width:540, maxWidth:'95vw', padding:24, maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <span style={{ fontSize:16, fontWeight:600, color:'#111827' }}>Resumen del turno</span>
          <span style={{ backgroundColor:'#F3F4F6', color:'#6B7280', padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:600 }}>{tipoLabel}</span>
        </div>

        {mesasAbiertas > 0 && (
          <div style={{ backgroundColor:'#FEF9C3', border:'1px solid #FCD34D', borderRadius:8, padding:'10px 14px', display:'flex', gap:10, alignItems:'flex-start', marginBottom:14 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CA8A04" strokeWidth="2" style={{ flexShrink:0, marginTop:1 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <div style={{ fontSize:13, color:'#92400E', fontWeight:700 }}>Hay {mesasAbiertas} mesa{mesasAbiertas > 1 ? 's' : ''} abierta{mesasAbiertas > 1 ? 's' : ''} en el salon.</div>
              <div style={{ fontSize:12, color:'#CA8A04', marginTop:2 }}>Cierra todas las mesas antes de cerrar el turno.</div>
            </div>
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
          <Row label="Total facturado" value={money(totalVentas)} valueColor="#1D9E75" valueBold />
          {Object.entries(ventasPorMetodo).map(([m,v]) => (
            <Row key={m} label={m} value={money(v)} sub />
          ))}
          <Row label="Total retiros" value={`-${money(retirosTotales)}`} valueColor="#F97316" />
          <div style={{ height:'1px', background:'#F1F5F9', margin:'6px 0' }} />
          <Row label="Efectivo esperado en el cajon" value={money(efectivoEsperado)} valueColor="#3B82F6" valueBold />
          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:-2 }}>(Fondo inicial + efectivo cobrado - retiros en efectivo)</div>
        </div>

        <div style={{ height:'1px', background:'#F1F5F9', margin:'18px 0' }} />

        <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginBottom:6 }}>Conteo fisico de caja</div>
        <div style={{ fontSize:12, color:'#6B7280', marginBottom:12 }}>Conta el dinero que tenes fisicamente en el cajon y escribi el total.</div>
        <div style={{ position:'relative', marginBottom:12 }}>
          <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:24, color:'#6B7280', fontWeight:500 }}>$</span>
          <input type="number" min="0" step="1" inputMode="decimal" value={arqueo} onChange={e=>{ setArqueo(e.target.value); setErrors(p=>({...p, arqueoEfectivo:undefined})); }} placeholder="0"
            style={{ width:'100%', padding:'14px 14px 14px 36px', border: errors.arqueoEfectivo ? '1.5px solid #EF4444' : arqueoNum !== null ? '1.5px solid #1D9E75' : '1px solid #E2E8F0', borderRadius:8, fontSize:32, fontWeight:700, textAlign:'center', boxSizing:'border-box', outline:'none' }} />
          <FieldError error={errors.arqueoEfectivo} />
        </div>
        {arqueoBox && (
          <div style={{ backgroundColor:arqueoBox.bg, borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:13, color:arqueoBox.color, fontWeight:800, minWidth:22 }}>{arqueoBox.icon}</span>
            <span style={{ fontSize:13, color:arqueoBox.color, fontWeight:600 }}>{arqueoBox.text}</span>
          </div>
        )}
        {arqueoNum !== null && diferencia !== 0 && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Motivo de la diferencia (opcional)</div>
            <input value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Ej: vuelto no devuelto, pago proveedor sin registrar"
              style={{ width:'100%', padding:'8px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, boxSizing:'border-box' }} />
          </div>
        )}

        <div style={{ height:'1px', background:'#F1F5F9', margin:'18px 0' }} />

        {errorMsg && (
          <div style={{ backgroundColor:'#FEE2E2', color:'#EF4444', borderRadius:7, padding:'10px 14px', fontSize:13, marginBottom:10 }}>{errorMsg}</div>
        )}

        <button onClick={confirm} disabled={saving}
          style={{ width:'100%', padding:'13px 0', border:'none', borderRadius:8, fontSize:14, fontWeight:600, color:'white', backgroundColor:'#1D9E75', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>
          {saving?'Cerrando turno...':'Cerrar turno y guardar'}
        </button>
        <button onClick={onClose} disabled={saving} style={{ width:'100%', marginTop:8, padding:'9px 0', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, color:'#374151', background:'#FFFFFF', cursor:'pointer' }}>Cancelar</button>
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
