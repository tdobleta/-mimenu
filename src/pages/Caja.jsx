import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { money } from '@/lib/fmt';
import OpenShiftModal from '../components/caja/OpenShiftModal';
import AddRetiroModal from '../components/caja/AddRetiroModal';
import CloseShiftModal from '../components/caja/CloseShiftModal';
import ShiftHistory from '../components/caja/ShiftHistory';

const TIPO_LABEL = { manana:'Mañana', tarde:'Tarde', noche:'Noche', general:'General' };

function fmtElapsed(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function normalizeMethod(m) {
  const s = (m||'').toLowerCase();
  if (s.includes('efectivo')) return 'Efectivo';
  if (s.includes('tarjeta') || s.includes('déb') || s.includes('deb') || s.includes('créd') || s.includes('cred')) return 'Tarjeta';
  if (s.includes('mercado')) return 'MercadoPago';
  if (s.includes('trans')) return 'Transferencia';
  return m || 'Otro';
}

function parsePagos(t) {
  // 1. Intentar t.pagos como JSON (POSView lo guarda en Supabase directo)
  if (t.pagos) {
    try {
      const arr = Array.isArray(t.pagos) ? t.pagos : JSON.parse(t.pagos);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {}
  }
  const m = t.metodo_pago || '';
  // 2. Pago simple (no mixto)
  if (!m.toLowerCase().startsWith('mixto')) {
    return [{ metodo: m, monto: t.total_facturado || 0 }];
  }
  // 3. Parsear string "Mixto (Efectivo $10.000 + Tarjeta $5.000)"
  // En es-AR el punto es separador de miles (10.000 = diez mil)
  const inner = m.match(/\((.+)\)/)?.[1];
  if (!inner) return [{ metodo: m, monto: t.total_facturado || 0 }];
  const parts = inner.split('+').map(part => {
    const trimmed = part.trim();
    const match = trimmed.match(/^(.+?)\s+\$([\d.,]+)$/);
    if (!match) return null;
    const montoStr = match[2].replace(/\./g, '').replace(',', '.');
    return { metodo: match[1].trim(), monto: Number(montoStr) };
  }).filter(Boolean);
  return parts.length > 0 ? parts : [{ metodo: m, monto: t.total_facturado || 0 }];
}

export default function Caja() {
  const store = useStore();
  const [tab, setTab] = useState('actual');
  const [showOpen, setShowOpen] = useState(false);
  const [showRetiro, setShowRetiro] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [turnos, setTurnos] = useState([]);
  const [, setTick] = useState(0);

  const navigate = useNavigate();
  const turnoActivo = store.turnoActivo;
  const branchId = store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id;

  // Limpiar turnos si cambia la sucursal y el turno activo no corresponde
  useEffect(() => {
    if (turnoActivo && turnoActivo.branchId !== branchId) {
      setTurnos([]);
    }
  }, [branchId, turnoActivo]);

  // Load ventas del turno
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!turnoActivo || !branchId) { setTurnos([]); return; }
      try {
        const all = await base44.entities.Turn.filter({ status: 'cerrada', branch_id: branchId }, '-closed_at', 200);
        if (mounted) setTurnos((all||[]).filter(t => t.closed_at >= turnoActivo.abiertaAt));
      } catch(e) {
        if (mounted) setTurnos([]);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, [branchId, turnoActivo?.id, turnoActivo?.abiertaAt]);

  // Tick for elapsed time
  useEffect(() => {
    if (!turnoActivo) return;
    const t = setInterval(() => setTick(x => x+1), 60000);
    return () => clearInterval(t);
  }, [turnoActivo]);

  const ventasPorMetodo = useMemo(() => {
  const map = {};
  turnos.forEach(t => {
    const pagosArr = parsePagos(t);
    if (pagosArr.length > 1) {
      pagosArr.forEach(p => {
        const m = normalizeMethod(p.metodo);
        if (!map[m]) map[m] = { mesas:0, total:0 };
        map[m].mesas += 1;
        map[m].total += Number(p.monto) || 0;
      });
    } else {
      const m = normalizeMethod(t.metodo_pago);
      if (!map[m]) map[m] = { mesas:0, total:0 };
      map[m].mesas += 1;
      map[m].total += t.total_facturado || 0;
    }
  });
  return map;
}, [turnos]);

  const totalVentas = turnos.reduce((a,t) => a + (t.total_facturado||0), 0);
  const ventasEfectivo = ventasPorMetodo['Efectivo']?.total || 0;
  const retiros = turnoActivo?.retiros || [];
  const retirosTotales = retiros.reduce((a,r) => a + (r.monto||0), 0);
  const retirosEfectivo = retirosTotales; // assume retiros are from cash drawer
  const fondoInicial = turnoActivo?.fondoInicial || 0;
  const efectivoEsperado = fondoInicial + ventasEfectivo - retirosEfectivo;
  const elapsed = turnoActivo ? Date.now() - turnoActivo.abiertaAt : 0;
  const ventasMetodoPlain = useMemo(() => {
    const r = {};
    Object.entries(ventasPorMetodo).forEach(([k,v]) => { r[k] = v.total; });
    return r;
  }, [ventasPorMetodo]);

  // Estado: sin turno
  if (!turnoActivo && tab === 'actual') {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
        <Header tab={tab} setTab={setTab} />
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'80px 20px', textAlign:'center' }}>
          <div style={{ width:72, height:72, borderRadius:'50%', backgroundColor:'#E8F7F2', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="1.8"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
          </div>
          <div style={{ fontSize:22, fontWeight:700, color:'#111827', marginBottom:6 }}>No hay turno abierto</div>
          <div style={{ fontSize:14, color:'#6B7280', marginBottom:22, maxWidth:380 }}>Abrí el turno para empezar a registrar las ventas del servicio</div>
          <button onClick={()=>setShowOpen(true)}
            style={{ padding:'12px 28px', border:'none', borderRadius:8, fontSize:14, fontWeight:600, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>
            Abrir turno
          </button>
        </div>
        {showOpen && <OpenShiftModal onClose={()=>setShowOpen(false)} />}
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <Header tab={tab} setTab={setTab} />

      {tab === 'historial' && <ShiftHistory />}

      {tab === 'actual' && turnoActivo && (
        <>
          {/* Header del turno */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <span style={{ backgroundColor:'#E8F7F2', color:'#1D9E75', padding:'4px 12px', borderRadius:99, fontSize:12, fontWeight:600 }}>● Turno abierto</span>
              <span style={{ fontSize:12, color:'#6B7280' }}>{TIPO_LABEL[turnoActivo.tipoTurno]} · hace <strong>{fmtElapsed(elapsed)}</strong></span>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => navigate('/pos')} style={{
                padding:'7px 18px', border:'none', borderRadius:7, fontSize:13,
                color:'white', backgroundColor:'#1D9E75', cursor:'pointer', fontWeight:600,
                display:'flex', alignItems:'center', gap:6, boxShadow:'0 4px 12px rgba(29,158,117,0.25)',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                Abrir POS
              </button>
              <button onClick={()=>setShowRetiro(true)}
                style={{ padding:'7px 14px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>
                Registrar retiro
              </button>
              <button onClick={()=>setShowClose(true)}
                style={{ padding:'7px 14px', border:'1px solid rgba(239,68,68,0.3)', borderRadius:7, fontSize:13, color:'#EF4444', backgroundColor:'white', cursor:'pointer', fontWeight:500 }}>
                Cerrar turno
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12 }}>
            <Kpi label="Fondo inicial" value={money(fondoInicial)} />
            <Kpi label="Ventas del turno" value={money(totalVentas)} valueColor="#1D9E75" />
            <Kpi label="Efectivo esperado" value={money(efectivoEsperado)} valueColor="#3B82F6" />
            <Kpi label="Total retirado" value={money(retirosTotales)} valueColor={retirosTotales>0?'#F97316':'#111827'} />
          </div>

          {/* Ventas por método */}
          <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', fontSize:14, fontWeight:600, color:'#111827', borderBottom:'0.5px solid rgba(0,0,0,0.06)' }}>Ventas por método de pago</div>
            {turnos.length === 0 ? (
              <div style={{ padding:'30px 20px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>Sin ventas registradas en este turno</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead style={{ backgroundColor:'#F9FAFB' }}>
                  <tr>
                    {['Método de pago','Cantidad de mesas','Total'].map(h => (
                      <th key={h} style={{ textAlign:'left', padding:'10px 18px', fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(ventasPorMetodo).map(([m,v]) => (
                    <tr key={m} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                      <td style={{ padding:'10px 18px', color:'#111827', fontWeight:500 }}>{m}</td>
                      <td style={{ padding:'10px 18px', color:'#374151' }}>{v.mesas}</td>
                      <td style={{ padding:'10px 18px', color:'#1D9E75', fontWeight:600 }}>{money(v.total)}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor:'#F9FAFB' }}>
                    <td style={{ padding:'10px 18px', fontWeight:700, color:'#111827' }}>TOTAL</td>
                    <td style={{ padding:'10px 18px', fontWeight:700, color:'#111827' }}>{turnos.length}</td>
                    <td style={{ padding:'10px 18px', fontWeight:700, color:'#1D9E75' }}>{money(totalVentas)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Retiros */}
          <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'0.5px solid rgba(0,0,0,0.06)' }}>
              <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Retiros registrados</span>
              <button onClick={() => navigate('/pos')} style={{
                padding:'7px 18px', border:'none', borderRadius:7, fontSize:13,
                color:'white', backgroundColor:'#1D9E75', cursor:'pointer', fontWeight:600,
                display:'flex', alignItems:'center', gap:6, boxShadow:'0 4px 12px rgba(29,158,117,0.25)',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                Abrir POS
              </button>
              <button onClick={()=>setShowRetiro(true)} style={{ padding:'5px 12px', border:'none', borderRadius:7, fontSize:12, color:'white', backgroundColor:'#1D9E75', cursor:'pointer', fontWeight:500 }}>+ Registrar retiro</button>
            </div>
            {retiros.length === 0 ? (
              <div style={{ padding:'24px 20px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>Sin retiros en este turno</div>
            ) : (
              <div style={{ padding:'10px 18px' }}>
                {retiros.map((r,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom: i<retiros.length-1?'0.5px solid rgba(0,0,0,0.05)':'none' }}>
                    <div>
                      <span style={{ fontSize:12, color:'#9CA3AF', marginRight:10 }}>{fmtTime(r.ts)}</span>
                      <span style={{ fontSize:13, color:'#374151' }}>{r.concepto}</span>
                    </div>
                    <span style={{ fontSize:13, color:'#EF4444', fontWeight:600 }}>-{money(r.monto)}</span>
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 4px', borderTop:'0.5px solid rgba(0,0,0,0.08)', marginTop:4 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Total</span>
                  <span style={{ fontSize:14, fontWeight:700, color:'#EF4444' }}>-{money(retirosTotales)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Reservas de hoy */}
          <ReservasHoy reservas={store.getReservas ? store.getReservas() : []} />

          {/* Actividad reciente */}
          <ActividadReciente activity={store.getActivity ? store.getActivity() : []} />

          {showRetiro && <AddRetiroModal onClose={()=>setShowRetiro(false)} />}
          {showClose && (() => {
            const mesasAbiertas = (store.tables[store.branchId] || []).filter(t => t.status === 'ocupada' || t.status === 'demorada').length;
            return (
              <CloseShiftModal
                ventasPorMetodo={ventasMetodoPlain}
                totalVentas={totalVentas}
                retirosTotales={retirosTotales}
                retirosEfectivo={retirosEfectivo}
                efectivoEsperado={efectivoEsperado}
                tipoTurno={turnoActivo.tipoTurno}
                mesasAbiertas={mesasAbiertas}
                onClose={()=>setShowClose(false)}
                onClosed={()=>{ setShowClose(false); setTab('historial'); }}
              />
            );
          })()}
        </>
      )}

      {tab === 'actual' && !turnoActivo && showOpen && <OpenShiftModal onClose={()=>setShowOpen(false)} />}
    </div>
  );
}

function ReservasHoy({ reservas }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const hoy = reservas.filter(r => r.fecha === todayStr);
  const badgeStyle = (estado) => {
    const s = { confirmada:{bg:'#E8F7F2',c:'#1D9E75'}, 'en espera':{bg:'#FEF9C3',c:'#CA8A04'}, cancelada:{bg:'#FEE2E2',c:'#EF4444'} }[estado] || {bg:'#F3F4F6',c:'#6B7280'};
    return { backgroundColor:s.bg, color:s.c, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600 };
  };
  return (
    <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden' }}>
      <div style={{ padding:'14px 18px', fontSize:14, fontWeight:600, color:'#111827', borderBottom:'0.5px solid rgba(0,0,0,0.06)' }}>Reservas de hoy</div>
      {hoy.length === 0
        ? <div style={{ padding:'24px 20px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>No hay reservas para hoy</div>
        : <div style={{ padding:'10px 18px', display:'flex', flexDirection:'column', gap:10 }}>
            {hoy.map(r => (
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#1D9E75', minWidth:44 }}>{r.hora}</span>
                <span style={{ fontSize:13, color:'#111827', fontWeight:500, flex:1 }}>{r.nombre}</span>
                <span style={{ fontSize:12, color:'#6B7280' }}>{r.personas} personas</span>
                <span style={badgeStyle(r.estado)}>{r.estado}</span>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

function ActividadReciente({ activity }) {
  function fmtElapsedLocal(ms) {
    const m = Math.max(0, Math.floor(ms/60000));
    return m < 60 ? `hace ${m}m` : `hace ${Math.floor(m/60)}h`;
  }
  return (
    <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden' }}>
      <div style={{ padding:'14px 18px', fontSize:14, fontWeight:600, color:'#111827', borderBottom:'0.5px solid rgba(0,0,0,0.06)' }}>Actividad reciente</div>
      {activity.length === 0
        ? <div style={{ padding:'24px 20px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>Sin actividad reciente</div>
        : <div style={{ padding:'10px 18px', display:'flex', flexDirection:'column', gap:10 }}>
            {activity.slice(0,8).map(a => (
              <div key={a.id} style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'4px 0', borderBottom:'0.5px solid rgba(0,0,0,0.04)' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', backgroundColor:a.color, flexShrink:0, marginTop:4 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:'#374151' }}>{a.texto}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{fmtElapsedLocal(Date.now() - a.ts)}</div>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

function Header({ tab, setTab }) {
  return (
    <div>
      <h1 style={{ fontSize:20, fontWeight:600, color:'#111827', margin:0, marginBottom:14 }}>Caja</h1>
      <div style={{ display:'flex', borderBottom:'0.5px solid rgba(0,0,0,0.08)' }}>
        {[['actual','Turno actual'],['historial','Historial']].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)}
            style={{ padding:'8px 16px', fontSize:13, border:'none', background:'none', cursor:'pointer', marginBottom:-1, fontWeight: tab===k?500:400, color: tab===k?'#1D9E75':'#9CA3AF', borderBottom: tab===k?'2px solid #1D9E75':'2px solid transparent' }}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, valueColor }) {
  return (
    <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'18px 20px' }}>
      <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.5px', color:'#9CA3AF', marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:700, color: valueColor || '#111827', lineHeight:1, letterSpacing:'-0.4px' }}>{value}</div>
    </div>
  );
}


