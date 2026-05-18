import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import ManualTurnForm from '@/components/configuracion/ManualTurnForm';

export default function Conexion() {
  const navigate = useNavigate();
  const store = useStore();
  const { addToast } = useToast();
  const [openManual, setOpenManual] = useState(false);

  const branch = store.branchId !== 'todas'
    ? store.sucursales.find(s => s.id === store.branchId)
    : store.sucursales[0];

  function onManualSaved() {
    if (store.refreshCharts) store.refreshCharts();
    addToast('Turno registrado — analíticas actualizadas', 'success');
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18, maxWidth:720 }}>
      <div>
        <h1 style={{ fontSize:20, fontWeight:600, color:'#111827', margin:0 }}>Conexión de datos</h1>
        <p style={{ fontSize:13, color:'#6B7280', marginTop:6, lineHeight:'18px' }}>
          mimenú funciona como sistema completo de caja y POS. Esta sección es opcional — si ya usás otro sistema podés importar tus ventas acá.
        </p>
      </div>

      {/* Card 1 — mimenú como caja */}
      <div style={{ position:'relative', border:'1.5px solid #1D9E75', borderRadius:10, padding:20, backgroundColor:'#F0FBF7' }}>
        <span style={{ position:'absolute', top:14, right:14, backgroundColor:'#1D9E75', color:'white', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, letterSpacing:'0.4px' }}>Recomendado</span>
        <div style={{ fontSize:15, fontWeight:700, color:'#111827', marginBottom:6 }}>Usar mimenú como caja</div>
        <p style={{ fontSize:13, color:'#374151', lineHeight:'19px', margin:0, marginBottom:14 }}>
          Los mozos toman pedidos desde el celular, las mesas se cierran con el método de pago, y la caja se gestiona con turnos de apertura y cierre. Todo queda registrado automáticamente.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:16 }}>
          {['Salón con mapa de mesas','Caja con turnos y arqueo','Vista de cocina en tiempo real','Analíticas automáticas'].map(t => (
            <div key={t} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#374151' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><polyline points="20 6 9 17 4 12"/></svg>
              {t}
            </div>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <button onClick={()=>navigate('/salon')}
            style={{ padding:'9px 18px', border:'none', borderRadius:7, fontSize:13, fontWeight:500, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>
            Ir al Salón →
          </button>
          {store.turnoActivo && (
            <span style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', backgroundColor:'#E8F7F2', color:'#1D9E75', borderRadius:99, fontSize:11, fontWeight:600 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', backgroundColor:'#1D9E75' }} />
              Turno abierto ahora
            </span>
          )}
        </div>
      </div>

      {/* Card 2 — Carga manual */}
      <div style={{ border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, backgroundColor:'white', overflow:'hidden' }}>
        <button onClick={()=>setOpenManual(o=>!o)}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:16, background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Carga manual de ventas</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Para importar datos de otro sistema o cargar cierres históricos</div>
          </div>
          <span style={{ fontSize:12, color:'#1D9E75', fontWeight:500 }}>{openManual ? 'Ocultar' : 'Expandir'}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ transition:'transform .2s', transform: openManual?'rotate(180deg)':'none', flexShrink:0 }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {openManual && (
          <div style={{ padding:'0 16px 16px' }}>
            {branch ? (
              <ManualTurnForm branch={branch} onSaved={onManualSaved} />
            ) : (
              <div style={{ fontSize:13, color:'#9CA3AF', padding:'8px 0' }}>Configurá una sucursal primero.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
