import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { money, dateLong, elapsedMin, fmtElapsed } from '@/lib/fmt';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AnalyticsActions from '../components/analytics/AnalyticsActions';

function Badge({ estado }) {
  const styles = { confirmada:{bg:'#E8F7F2',c:'#1D9E75'}, 'en espera':{bg:'#FEF9C3',c:'#CA8A04'}, cancelada:{bg:'#FEE2E2',c:'#EF4444'} };
  const s = styles[estado] || {bg:'#F3F4F6',c:'#6B7280'};
  return <span style={{ backgroundColor:s.bg, color:s.c, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>{estado}</span>;
}

export default function Dashboard() {
  const store = useStore();
  const [period, setPeriod] = useState('week');

  useEffect(() => {
    if (store.refreshCharts) store.refreshCharts();
  // eslint-disable-next-line
  }, [store.branchId]);
  const charts = store.getCharts();
  const reservas = store.getReservas();
  const activity = store.getActivity();
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRes = reservas.filter(r => r.fecha === todayStr);

  // Get all tables for KPIs
  let allTables = [];
  if (store.branchId === 'todas') {
    allTables = store.sucursales.flatMap(su => store.tables[su.id] || []);
  } else {
    allTables = store.tables[store.branchId] || [];
  }
  const activas = allTables.filter(t => t.status === 'ocupada' || t.status === 'demorada').length;
  const demoradas = allTables.filter(t => t.status === 'demorada').length;

  const revChange = charts.facturacionAyer > 0 ? Math.round(((charts.facturacionHoy - charts.facturacionAyer) / charts.facturacionAyer) * 100) : 0;
  const ticketChange = charts.ticketAnterior > 0 ? Math.round(((charts.ticketPromedio - charts.ticketAnterior) / charts.ticketAnterior) * 100) : 0;

  const periodKey = period === 'week' ? 'week' : period === 'month' ? 'month' : 'year';
  const chartData = charts[periodKey] || charts.week;
  const xKey = period === 'year' ? 'mes' : 'day';
  const maxProd = charts.topProducts[0]?.unidades || 1;

  const card = (label, value, change, sub, subWarn) => (
    <div key={label} style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:18 }}>
      <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.6px', color:'#9CA3AF', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:700, color:'#111827', letterSpacing:'-0.5px', lineHeight:1 }}>{value}</div>
      {sub && (
        <div style={{ fontSize:12, marginTop:6, whiteSpace:'nowrap', color: subWarn ? '#CA8A04' : change > 0 ? '#1D9E75' : change < 0 ? '#EF4444' : '#9CA3AF' }}>
          {change > 0 ? '↑ ' : change < 0 ? '↓ ' : ''}{sub}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <h1 style={{ fontSize:20, fontWeight:600, color:'#111827', margin:0 }}>Dashboard</h1>
          <AnalyticsActions resetLabel="Reiniciar analíticas" editLabel="Editar analítica" />
        </div>
        <span style={{ fontSize:13, color:'#9CA3AF' }}>{dateLong(new Date())}</span>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12 }}>
        {card('Facturación hoy', money(charts.facturacionHoy), revChange, `${revChange >= 0 ? '+' : ''}${revChange}% vs semana anterior`)}
        {card('Ticket promedio', money(charts.ticketPromedio), ticketChange, `${ticketChange >= 0 ? '+' : ''}${ticketChange}% vs mes anterior`)}
        {card('Mesas activas', activas, demoradas > 0 ? -1 : 0, demoradas > 0 ? `${demoradas} demorada${demoradas > 1 ? 's' : ''}` : 'todo en orden', demoradas > 0)}
        {card('Reservas hoy', todayRes.length, 0, `${todayRes.filter(r=>r.estado==='confirmada').length} confirmadas`)}
      </div>

      {/* Chart */}
      <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
          <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Facturación comparativa</span>
          <div style={{ display:'flex', gap:4 }}>
            {[['week','Semana'],['month','Mes'],['year','Año']].map(([k,l]) => (
              <button key={k} onClick={() => setPeriod(k)}
                style={{ padding:'4px 12px', borderRadius:7, fontSize:12, fontWeight:500, border:'none', cursor:'pointer', transition:'all .15s', backgroundColor: period===k ? '#1D9E75' : 'transparent', color: period===k ? 'white' : '#9CA3AF' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barGap={2}>
            <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v/1000)}k` : `$${v}`} />
            <Tooltip contentStyle={{ border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:8, fontSize:12 }} formatter={v => [money(v)]} />
            <Bar dataKey="actual"   fill="#1D9E75" name="Este período"    radius={[4,4,0,0]} />
            <Bar dataKey="anterior" fill="#9FE1CB" name="Período anterior" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display:'flex', gap:16, marginTop:12 }}>
          {[['#1D9E75','Este período'],['#9FE1CB','Período anterior']].map(([c,l]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:10, height:10, borderRadius:2, backgroundColor:c, display:'inline-block' }} />
              <span style={{ fontSize:11, color:'#6B7280' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom 3-col */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:16 }}>
        {/* Reservas hoy */}
        <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#111827', marginBottom:12 }}>Reservas de hoy</div>
          {todayRes.length === 0
            ? <p style={{ fontSize:12, color:'#9CA3AF' }}>No hay reservas para hoy.</p>
            : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {todayRes.map(r => (
                  <div key={r.id} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'#1D9E75', minWidth:44 }}>{r.hora}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                        <span style={{ fontSize:13, fontWeight:500, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:120 }}>{r.nombre}</span>
                        <Badge estado={r.estado} />
                      </div>
                      <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{r.personas} personas · {r.canal}</div>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Top products */}
        <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#111827', marginBottom:12 }}>Productos más vendidos</div>
          {(!charts.topProducts || charts.topProducts.length === 0) ? (
            <p style={{ fontSize:12, color:'#9CA3AF' }}>Cerrá mesas para ver los productos más vendidos.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {charts.topProducts.map(p => (
                <div key={p.nombre}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:12, color:'#374151', fontWeight:500 }}>{p.nombre}</span>
                    <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0 }}>{p.unidades} uds · {money(p.monto)}</span>
                  </div>
                  <div style={{ height:6, backgroundColor:'#F3F4F6', borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(p.unidades/maxProd)*100}%`, backgroundColor:'#1D9E75', borderRadius:99 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity */}
        <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#111827', marginBottom:12 }}>Actividad reciente</div>
          {activity.length === 0 ? (
            <p style={{ fontSize:12, color:'#9CA3AF' }}>Sin actividad reciente.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {activity.slice(0,6).map(a => (
                <div key={a.id} style={{ display:'flex', gap:10 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', backgroundColor:a.color, flexShrink:0, marginTop:4 }} />
                  <div>
                    <div style={{ fontSize:12, color:'#374151', lineHeight:'16px' }}>{a.texto}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{fmtElapsed(elapsedMin(a.ts))}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


