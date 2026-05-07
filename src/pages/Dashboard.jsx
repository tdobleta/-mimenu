import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { money, dateLong, elapsedMin, fmtElapsed } from '@/lib/fmt';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AnalyticsActions from '../components/analytics/AnalyticsActions';
import { G, fontDisplay } from '@/lib/glass';

// ── Design tokens premium ─────────────────────────────────────────────────────
const card = (accent = 'transparent', extra = {}) => ({
  background: 'rgba(255,255,255,0.58)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.72)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 8px 32px rgba(80,80,180,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
  borderRadius: 22,
  position: 'relative',
  overflow: 'hidden',
  ...extra,
});

const heroCard = (extra = {}) => ({
  background: 'rgba(255,255,255,0.62)',
  backdropFilter: 'blur(32px) saturate(200%)',
  WebkitBackdropFilter: 'blur(32px) saturate(200%)',
  border: '1px solid rgba(255,255,255,0.78)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.04), 0 16px 56px rgba(80,80,180,0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
  borderRadius: 26,
  position: 'relative',
  overflow: 'hidden',
  ...extra,
});

// Accent orb decorativo dentro de una card
function Orb({ color, size = 120, top, right, left, bottom, opacity = 0.12 }) {
  return (
    <div style={{
      position: 'absolute', width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      top, right, left, bottom, opacity, pointerEvents: 'none',
    }} />
  );
}

function Badge({ estado }) {
  const s = {
    confirmada:  { bg:'rgba(29,158,117,0.12)', c:G.teal },
    'en espera': { bg:'rgba(239,159,39,0.12)',  c:G.amber },
    cancelada:   { bg:'rgba(226,75,74,0.12)',   c:G.red },
  }[estado] || { bg:'rgba(0,0,0,0.06)', c:G.textMuted };
  return <span style={{ background:s.bg, color:s.c, padding:'2px 9px', borderRadius:99, fontSize:11, fontWeight:700 }}>{estado}</span>;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'rgba(255,255,255,0.95)', backdropFilter:'blur(16px)', border:'1px solid rgba(255,255,255,0.9)', borderRadius:14, padding:'10px 14px', fontSize:12, minWidth:150, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
      <div style={{ color:G.textFaint, marginBottom:5, fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display:'flex', justifyContent:'space-between', gap:20, fontWeight:700, color:p.color, marginTop:2 }}>
          <span style={{ fontWeight:400, color:G.textMuted }}>{p.name}</span>
          <span>{money(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const store = useStore();
  const [period, setPeriod] = useState('week');

  useEffect(() => {
    if (store.refreshCharts) store.refreshCharts();
  }, [store.branchId]); // eslint-disable-line

  const charts   = store.getCharts();
  const reservas = store.getReservas();
  const activity = store.getActivity();
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRes = reservas.filter(r => r.fecha === todayStr);

  let allTables = [];
  if (store.branchId === 'todas') {
    allTables = store.sucursales.flatMap(su => store.tables[su.id] || []);
  } else {
    allTables = store.tables[store.branchId] || [];
  }
  const activas   = allTables.filter(t => t.status === 'ocupada' || t.status === 'demorada').length;
  const demoradas = allTables.filter(t => t.status === 'demorada').length;

  const revChange    = charts.facturacionAyer > 0 ? Math.round(((charts.facturacionHoy - charts.facturacionAyer) / charts.facturacionAyer) * 100) : 0;
  const ticketChange = charts.ticketAnterior  > 0 ? Math.round(((charts.ticketPromedio - charts.ticketAnterior)  / charts.ticketAnterior)  * 100) : 0;

  const periodKey = period === 'week' ? 'week' : period === 'month' ? 'month' : 'year';
  const chartData = charts[periodKey] || charts.week || [];
  const xKey = period === 'year' ? 'mes' : 'day';
  const maxProd = charts.topProducts[0]?.unidades || 1;

  const periodLabel = { week:'Semana', month:'Mes', year:'Año' }[period];

  const kpis = [
    {
      label: 'Facturación hoy',
      value: money(charts.facturacionHoy),
      change: revChange,
      sub: `${revChange >= 0 ? '+' : ''}${revChange}% vs semana anterior`,
      color: G.teal,
      orb: G.teal,
      accent: 'rgba(29,158,117,0.07)',
    },
    {
      label: 'Ticket promedio',
      value: money(charts.ticketPromedio),
      change: ticketChange,
      sub: `${ticketChange >= 0 ? '+' : ''}${ticketChange}% vs mes anterior`,
      color: G.violet,
      orb: G.violet,
      accent: 'rgba(127,119,221,0.07)',
    },
    {
      label: 'Mesas activas',
      value: activas,
      change: demoradas > 0 ? -1 : 0,
      sub: demoradas > 0 ? `${demoradas} demorada${demoradas > 1 ? 's' : ''}` : 'Todo en orden',
      color: demoradas > 0 ? G.red : G.blue,
      orb: demoradas > 0 ? G.red : G.blue,
      accent: demoradas > 0 ? 'rgba(226,75,74,0.07)' : 'rgba(55,138,221,0.07)',
    },
    {
      label: 'Reservas hoy',
      value: todayRes.length,
      change: 0,
      sub: `${todayRes.filter(r => r.estado === 'confirmada').length} confirmadas`,
      color: G.amber,
      orb: G.amber,
      accent: 'rgba(239,159,39,0.07)',
    },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:700, color:G.text, margin:0, fontFamily:fontDisplay, letterSpacing:'-0.03em' }}>
            Dashboard
          </h1>
          <div style={{ fontSize:12, color:G.textFaint, marginTop:3 }}>{dateLong(new Date())}</div>
        </div>
        <AnalyticsActions resetLabel="Reiniciar analíticas" editLabel="Editar analítica" />
      </div>

      {/* ── Hero metric + KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1.8fr 1fr 1fr 1fr', gap:14 }}>

        {/* Hero — Facturación hoy */}
        <div style={{ ...heroCard({ padding:'26px 28px', background:`linear-gradient(135deg, rgba(255,255,255,0.68) 0%, rgba(241,255,250,0.55) 100%)` }) }}>
          <Orb color={G.teal} size={200} top={-60} right={-60} opacity={0.10} />
          <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.10em', marginBottom:10 }}>Facturación hoy</div>
          <div style={{ fontSize:42, fontWeight:800, color:G.teal, letterSpacing:'-0.04em', fontFamily:fontDisplay, lineHeight:1 }}>
            {money(charts.facturacionHoy)}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>
            <span style={{ fontSize:12, fontWeight:700, color: revChange >= 0 ? G.teal : G.red, background: revChange >= 0 ? 'rgba(29,158,117,0.10)' : 'rgba(226,75,74,0.10)', padding:'3px 9px', borderRadius:99 }}>
              {revChange >= 0 ? '↑' : '↓'} {Math.abs(revChange)}%
            </span>
            <span style={{ fontSize:12, color:G.textFaint }}>vs semana anterior</span>
          </div>
          {/* Mini trend bar */}
          <div style={{ display:'flex', alignItems:'flex-end', gap:3, marginTop:18, height:36 }}>
            {(chartData.slice(-7)).map((d, i) => {
              const maxV = Math.max(...chartData.map(x=>x.actual||0), 1);
              const h = Math.max(4, ((d.actual||0)/maxV)*36);
              return <div key={i} style={{ flex:1, height:h, background: i === (chartData.slice(-7).length-1) ? G.teal : `rgba(29,158,117,${0.2+i*0.05})`, borderRadius:3, transition:'height 0.4s' }}/>;
            })}
          </div>
        </div>

        {/* KPIs secundarios */}
        {kpis.slice(1).map(k => (
          <div key={k.label} style={{ ...card(k.accent, { padding:'22px 22px', background:`rgba(255,255,255,0.55)` }) }}>
            <Orb color={k.orb} size={120} top={-30} right={-30} opacity={0.10} />
            <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.10em', marginBottom:8 }}>{k.label}</div>
            <div style={{ fontSize:30, fontWeight:800, color:k.color, letterSpacing:'-0.03em', fontFamily:fontDisplay, lineHeight:1.1 }}>{k.value}</div>
            <div style={{ fontSize:11, color:k.color, fontWeight:600, opacity:0.8, marginTop:6 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Gráfico principal ── */}
      <div style={{ ...heroCard({ padding:'26px 28px' }) }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:G.text, fontFamily:fontDisplay }}>Facturación comparativa</div>
            <div style={{ fontSize:12, color:G.textFaint, marginTop:2 }}>Este período vs anterior</div>
          </div>
          <div style={{ display:'flex', gap:4, background:'rgba(0,0,0,0.04)', borderRadius:12, padding:4 }}>
            {[['week','Semana'],['month','Mes'],['year','Año']].map(([k,l]) => (
              <button key={k} onClick={() => setPeriod(k)} style={{
                padding:'6px 16px', borderRadius:9, fontSize:12, fontWeight:600, border:'none', cursor:'pointer', transition:'all .2s',
                background: period===k ? 'white' : 'transparent',
                color: period===k ? G.teal : G.textMuted,
                boxShadow: period===k ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              }}>{l}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top:5, right:5, bottom:0, left:0 }}>
            <defs>
              <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={G.teal} stopOpacity={0.18}/>
                <stop offset="95%" stopColor={G.teal} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="gradAnterior" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={G.violet} stopOpacity={0.10}/>
                <stop offset="95%" stopColor={G.violet} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(0,0,0,0.04)" vertical={false} strokeDasharray="0" />
            <XAxis dataKey={xKey} tick={{ fontSize:11, fill:G.textFaint, fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize:11, fill:G.textFaint }} axisLine={false} tickLine={false}
              tickFormatter={v => v>=1000000?`$${(v/1000000).toFixed(1)}M`:v>=1000?`$${Math.round(v/1000)}k`:`$${v}`} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke:'rgba(0,0,0,0.06)', strokeWidth:1 }} />
            <Area type="monotone" dataKey="actual"   stroke={G.teal}   strokeWidth={2.5} fill="url(#gradActual)"   name={periodLabel} dot={false} activeDot={{ r:5, fill:G.teal, strokeWidth:0 }} />
            <Area type="monotone" dataKey="anterior" stroke={G.violet} strokeWidth={1.5} fill="url(#gradAnterior)" name="Período anterior" dot={false} strokeDasharray="4 2" activeDot={{ r:4, fill:G.violet, strokeWidth:0 }} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display:'flex', gap:20, marginTop:16 }}>
          {[[G.teal, periodLabel, false],[G.violet,'Período anterior', true]].map(([c,l,dashed]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ width:20, height:2.5, background:c, borderRadius:99, opacity: dashed ? 0.6 : 1 }} />
              <span style={{ fontSize:11, color:G.textMuted }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom 3 cols ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:16 }}>

        {/* Top productos del día */}
        <div style={{ ...card('', { padding:'22px 24px' }) }}>
          <Orb color={G.teal} size={140} top={-40} right={-40} opacity={0.07} />
          <div style={{ fontSize:14, fontWeight:700, color:G.text, marginBottom:18, fontFamily:fontDisplay }}>Top productos del día</div>
          {(!charts.topProducts || charts.topProducts.length === 0)
            ? <p style={{ fontSize:12, color:G.textFaint, margin:0 }}>Cerrá mesas para ver productos vendidos.</p>
            : <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
                {charts.topProducts.slice(0,5).map((p, i) => {
                  const colors = [G.teal, G.violet, G.blue, G.amber, G.coral];
                  const c = colors[i] || G.teal;
                  return (
                    <div key={p.nombre}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                          <span style={{ fontSize:11, fontWeight:800, color:G.textFaint, minWidth:20 }}>#{i+1}</span>
                          <span style={{ fontSize:13, color:G.text, fontWeight:600 }}>{p.nombre}</span>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <span style={{ fontSize:11, color:G.textFaint }}>{p.unidades} uds</span>
                          <span style={{ fontSize:11, color:c, fontWeight:600, marginLeft:8 }}>{money(p.monto)}</span>
                        </div>
                      </div>
                      <div style={{ height:4, background:'rgba(0,0,0,0.06)', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(p.unidades/maxProd)*100}%`, background:c, borderRadius:99, transition:'width 0.8s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        {/* Ticket promedio */}
        <div style={{ ...card('', { padding:'22px 24px' }) }}>
          <Orb color={G.violet} size={140} top={-40} right={-40} opacity={0.07} />
          <div style={{ fontSize:14, fontWeight:700, color:G.text, marginBottom:6, fontFamily:fontDisplay }}>Ticket promedio</div>
          <div style={{ fontSize:36, fontWeight:800, color:G.violet, fontFamily:fontDisplay, letterSpacing:'-0.03em', marginBottom:4 }}>
            {money(charts.ticketPromedio)}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:20 }}>
            <span style={{ fontSize:11, fontWeight:700, color: ticketChange >= 0 ? G.teal : G.red, background: ticketChange >= 0 ? 'rgba(29,158,117,0.10)' : 'rgba(226,75,74,0.10)', padding:'2px 8px', borderRadius:99 }}>
              {ticketChange >= 0 ? '↑' : '↓'} {Math.abs(ticketChange)}%
            </span>
            <span style={{ fontSize:11, color:G.textFaint }}>vs mes anterior</span>
          </div>
          {/* Breakdown */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { label:'Este período',    val:charts.ticketPromedio,   color:G.violet },
              { label:'Período anterior', val:charts.ticketAnterior||0, color:'rgba(127,119,221,0.4)' },
            ].map(row => (
              <div key={row.label}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontSize:11, color:G.textMuted }}>{row.label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:G.text }}>{money(row.val)}</span>
                </div>
                <div style={{ height:5, background:'rgba(0,0,0,0.06)', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:'100%', width: charts.ticketPromedio > 0 ? `${Math.min((row.val / (charts.ticketPromedio * 1.2)) * 100, 100)}%` : '0%', background:row.color, borderRadius:99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hora pico */}
        <div style={{ ...card('', { padding:'22px 24px' }) }}>
          <Orb color={G.amber} size={140} top={-40} right={-40} opacity={0.07} />
          <div style={{ fontSize:14, fontWeight:700, color:G.text, marginBottom:6, fontFamily:fontDisplay }}>Hora pico</div>
          {(() => {
            const closedTurns = store.closedTurns || [];
            const todayStart = new Date(); todayStart.setHours(0,0,0,0);
            const hoy = closedTurns.filter(t => t.closed_at >= todayStart.getTime());
            const porHora = {};
            hoy.forEach(t => {
              const h = new Date(t.closed_at).getHours();
              if (!porHora[h]) porHora[h] = 0;
              porHora[h] += t.total_facturado || 0;
            });
            const horas = Object.keys(porHora).map(Number).sort((a,b)=>a-b);
            const maxVal = Math.max(...Object.values(porHora), 1);
            const horaPico = horas.length > 0 ? horas.reduce((a,b) => porHora[a]>porHora[b]?a:b, horas[0]) : null;
            if (horas.length === 0) return <p style={{ fontSize:12, color:G.textFaint, margin:0 }}>Sin datos de hoy todavía.</p>;
            return (
              <>
                <div style={{ fontSize:32, fontWeight:800, color:G.amber, fontFamily:fontDisplay, letterSpacing:'-0.02em', marginBottom:4 }}>
                  {horaPico !== null ? `${String(horaPico).padStart(2,'0')}:00` : '--'}
                </div>
                <div style={{ fontSize:11, color:G.textFaint, marginBottom:18 }}>
                  {horaPico !== null ? `Pico de facturación — ${money(porHora[horaPico])}` : ''}
                </div>
                <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:52 }}>
                  {horas.map(h => (
                    <div key={h} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                      <div style={{ width:'100%', height: Math.max(4, (porHora[h]/maxVal)*48), background: h===horaPico ? G.amber : `rgba(239,159,39,0.25)`, borderRadius:4, transition:'height 0.4s' }} />
                      <span style={{ fontSize:9, color:G.textFaint }}>{h}h</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </div>

    </div>
  );
}
