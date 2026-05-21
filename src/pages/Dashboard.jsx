import { useState, useEffect, useRef, useCallback } from 'react';
import { useDashboardStore } from '@/lib/storeSelectors';
import { money, dateLong, elapsedMin, fmtElapsed } from '@/lib/fmt';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AnalyticsActions from '../components/analytics/AnalyticsActions';
import { G } from '@/lib/glass';
import GuidedTour, { useTour } from '@/components/GuidedTour';

// ── Design tokens ─────────────────────────────────────────────────────────────
const FONT_UI = "'DM Sans', system-ui, sans-serif";
const kpiCard = (extra = {}) => ({
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  borderRadius: 14,
  position: 'relative',
  overflow: 'hidden',
  ...extra,
});

// ── Helpers de fecha ──────────────────────────────────────────────────────────
const DAY_MS = 86400000;
function startOfDay(d = new Date()) {
  const r = new Date(d); r.setHours(0,0,0,0); return r.getTime();
}
function fmtDate(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function fmtDateShort(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}
function getLunesDeHoy() {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const dow = (hoy.getDay() + 6) % 7; // lun=0
  return hoy.getTime() - dow * DAY_MS;
}
// Presets
function getPresets() {
  const hoy = startOfDay();
  const ayer = hoy - DAY_MS;
  const lunes = getLunesDeHoy();
  const lunesAnt = lunes - 7 * DAY_MS;
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
  const inicioMesAnt = new Date(inicioMes); inicioMesAnt.setMonth(inicioMesAnt.getMonth()-1);
  const finMesAnt = new Date(inicioMes); finMesAnt.setTime(inicioMes.getTime() - 1);
  finMesAnt.setHours(23,59,59,999);
  const inicioAnio = new Date(new Date().getFullYear(), 0, 1).getTime();
  return [
    { label: 'Hoy',            start: hoy,                 end: hoy + DAY_MS },
    { label: 'Ayer',           start: ayer,                end: hoy },
    { label: 'Esta semana',    start: lunes,               end: hoy + DAY_MS },
    { label: 'Semana pasada',  start: lunesAnt,            end: lunes },
    { label: 'Últimos 7 días', start: hoy - 6*DAY_MS,     end: hoy + DAY_MS },
    { label: 'Este mes',       start: inicioMes.getTime(), end: hoy + DAY_MS },
    { label: 'Mes pasado',     start: inicioMesAnt.getTime(), end: inicioMes.getTime() },
    { label: 'Últimos 30 días',start: hoy - 29*DAY_MS,    end: hoy + DAY_MS },
    { label: 'Este año',       start: inicioAnio,          end: hoy + DAY_MS },
  ];
}

// ── DateRangePicker ───────────────────────────────────────────────────────────
function DateRangePicker({ startTs, endTs, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selecting, setSelecting] = useState(null); // null | 'start' | 'end'
  const [hoverTs, setHoverTs] = useState(null);
  const ref = useRef();
  const presets = getPresets();

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Días del mes en vista
  function getDaysInMonth(year, month) {
    const first = new Date(year, month, 1).getDay();
    const total = new Date(year, month+1, 0).getDate();
    const days = [];
    for (let i = 0; i < ((first + 6) % 7); i++) days.push(null); // offset lun
    for (let d = 1; d <= total; d++) {
      days.push(new Date(year, month, d).getTime());
    }
    return days;
  }

  const days = getDaysInMonth(viewMonth.year, viewMonth.month);
  const effectiveEnd = selecting === 'end' && hoverTs ? hoverTs + DAY_MS : endTs;
  const rangeLabel = startTs && endTs
    ? `${fmtDateShort(startTs)} → ${fmtDateShort(endTs - 1)}`
    : 'Seleccionar período';

  function handleDayClick(ts) {
    if (!selecting || selecting === 'start') {
      onChange(ts, ts + DAY_MS);
      setSelecting('end');
    } else {
      if (ts < startTs) { onChange(ts, startTs + DAY_MS); }
      else { onChange(startTs, ts + DAY_MS); }
      setSelecting(null);
      setOpen(false);
    }
  }

  function prevMonth() {
    setViewMonth(v => {
      if (v.month === 0) return { year: v.year-1, month: 11 };
      return { year: v.year, month: v.month-1 };
    });
  }
  function nextMonth() {
    setViewMonth(v => {
      if (v.month === 11) return { year: v.year+1, month: 0 };
      return { year: v.year, month: v.month+1 };
    });
  }

  const MES_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const DOW = ['Lu','Ma','Mi','Ju','Vi','Sa','Do'];

  return (
    <div ref={ref} style={{ position:'relative', fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      {/* Trigger */}
      <button onClick={() => { setOpen(v => !v); setSelecting('start'); }}
        style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:8, cursor:'pointer', fontSize:13, color:G.text, fontWeight:500, boxShadow:'0 1px 2px rgba(0,0,0,0.04)', minWidth:180 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={G.teal} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span>{rangeLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={G.textFaint} strokeWidth="2" style={{ marginLeft:'auto' }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position:'absolute', top:46, right:0, zIndex:500, background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.10)', display:'flex', overflow:'hidden', minWidth:520 }}>

          {/* Presets */}
          <div style={{ width:160, borderRight:'1px solid rgba(0,0,0,0.06)', padding:'12px 8px', display:'flex', flexDirection:'column', gap:2 }}>
            <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.08em', padding:'4px 8px', marginBottom:4 }}>Presets</div>
            {presets.map(p => {
              const active = p.start === startTs && p.end === endTs;
              return (
                <button key={p.label} onClick={() => { onChange(p.start, p.end); setOpen(false); setSelecting(null); }}
                  style={{ padding:'7px 10px', borderRadius:9, border:'none', cursor:'pointer', textAlign:'left', fontSize:12, fontWeight: active ? 700 : 400, background: active ? 'rgba(29,158,117,0.10)' : 'transparent', color: active ? G.teal : G.textMid, transition:'all 0.12s' }}>
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Calendario */}
          <div style={{ padding:'16px 18px', flex:1 }}>
            {selecting && (
              <div style={{ fontSize:12, fontWeight:600, color:G.teal, marginBottom:10, textAlign:'center', background:'rgba(29,158,117,0.06)', borderRadius:8, padding:'5px 10px' }}>
                {selecting === 'start' ? '👆 Elegí la fecha de inicio' : '👆 Elegí la fecha de fin'}
              </div>
            )}

            {/* Navegación mes */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <button onClick={prevMonth} style={{ background:'rgba(0,0,0,0.05)', border:'none', borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
              <span style={{ fontSize:13, fontWeight:700, color:G.text }}>{MES_NAMES[viewMonth.month]} {viewMonth.year}</span>
              <button onClick={nextMonth} style={{ background:'rgba(0,0,0,0.05)', border:'none', borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center' }}>›</button>
            </div>

            {/* Días de semana */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
              {DOW.map(d => <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:G.textFaint, padding:'2px 0' }}>{d}</div>)}
            </div>

            {/* Días */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
              {days.map((ts, i) => {
                if (!ts) return <div key={`e${i}`} />;
                const isStart = ts === startTs;
                const isEnd   = ts === effectiveEnd - DAY_MS;
                const inRange = ts >= startTs && ts < effectiveEnd;
                const isToday = ts === startOfDay();
                const isFuture = ts > startOfDay();
                return (
                  <button key={ts}
                    onMouseEnter={() => selecting === 'end' && setHoverTs(ts)}
                    onMouseLeave={() => setHoverTs(null)}
                    onClick={() => !isFuture && handleDayClick(ts)}
                    style={{
                      padding:'5px 2px', border:'none', borderRadius:8, cursor: isFuture ? 'default' : 'pointer',
                      fontSize:12, fontWeight: isStart || isEnd ? 700 : 400,
                      background: isStart || isEnd ? G.teal : inRange ? 'rgba(29,158,117,0.10)' : 'transparent',
                      color: isStart || isEnd ? 'white' : isFuture ? '#D1D5DB' : isToday ? G.teal : G.text,
                      outline: isToday && !isStart && !isEnd ? `1.5px solid ${G.teal}` : 'none',
                      transition: 'all 0.1s',
                    }}>
                    {new Date(ts).getDate()}
                  </button>
                );
              })}
            </div>

            {/* Rango seleccionado */}
            {startTs && endTs && (
              <div style={{ marginTop:12, padding:'8px 12px', background:'rgba(29,158,117,0.06)', borderRadius:10, fontSize:12, color:G.teal, fontWeight:600, textAlign:'center' }}>
                {fmtDate(startTs)} → {fmtDate(endTs - 1)} · {Math.ceil((endTs - startTs)/DAY_MS)} día{Math.ceil((endTs-startTs)/DAY_MS)!==1?'s':''}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tooltip del gráfico ───────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:10, padding:'10px 14px', fontSize:12, minWidth:150, boxShadow:'0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.05)', fontFamily:FONT_UI }}>
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

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const store = useDashboardStore();
  const { mostrar: mostrarTour, cerrar: cerrarTour } = useTour();

  // Rango por defecto: esta semana (lunes → hoy + 1)
  const defaultStart = getLunesDeHoy();
  const defaultEnd   = startOfDay() + DAY_MS;

  const [rangeStart, setRangeStart] = useState(defaultStart);
  const [rangeEnd,   setRangeEnd]   = useState(defaultEnd);

  const handleRangeChange = useCallback((start, end) => {
    setRangeStart(start);
    setRangeEnd(end);
    if (store.refreshChartsForRange) {
      store.refreshChartsForRange(start, end);
    }
  }, [store]);

  useEffect(() => {
    // Carga inicial con el rango por defecto
    if (store.refreshChartsForRange) {
      store.refreshChartsForRange(rangeStart, rangeEnd);
    } else if (store.refreshCharts) {
      store.refreshCharts();
    }

    // Auto-refresh cada 2 minutos
    const interval = setInterval(() => {
      if (store.refreshChartsForRange) store.refreshChartsForRange(rangeStart, rangeEnd);
      else if (store.refreshCharts) store.refreshCharts();
    }, 2 * 60 * 1000);

    // Refresh al volver de otra pestaña
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (store.refreshChartsForRange) store.refreshChartsForRange(rangeStart, rangeEnd);
        else if (store.refreshCharts) store.refreshCharts();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [store.branchId, rangeStart, rangeEnd]); // eslint-disable-line

  const charts   = store.getCharts();
  const activity = store.getActivity();

  const rangeDays = Math.ceil((rangeEnd - rangeStart) / DAY_MS);
  const chartData = charts.week || [];
  const maxProd   = charts.topProducts?.[0]?.unidades || 1;

  const revChange    = charts.facturacionAyer > 0 ? Math.round(((charts.facturacionHoy - charts.facturacionAyer) / charts.facturacionAyer) * 100) : 0;
  const ticketChange = charts.ticketAnterior  > 0 ? Math.round(((charts.ticketPromedio - charts.ticketAnterior)  / charts.ticketAnterior)  * 100) : 0;

  // Mesas activas
  let allTables = [];
  if (store.branchId === 'todas') {
    allTables = store.sucursales.flatMap(su => store.tables[su.id] || []);
  } else {
    allTables = store.tables[store.branchId] || [];
  }
  const activas   = allTables.filter(t => t.status === 'ocupada' || t.status === 'demorada').length;
  const demoradas = allTables.filter(t => t.status === 'demorada').length;

  // Hora pico desde closedTurns
  const porHora = {};
  (store.closedTurns || [])
    .filter(t => t._ts >= rangeStart && t._ts < rangeEnd)
    .forEach(t => {
      const h = new Date(t._ts || t.closed_at).getHours();
      if (!porHora[h]) porHora[h] = 0;
      porHora[h] += t.total_facturado || 0;
    });
  const horas = Object.keys(porHora).map(Number).sort((a,b) => a-b);
  const maxHoraVal = Math.max(...Object.values(porHora), 1);
  const horaPico = horas.length > 0 ? horas.reduce((a,b) => porHora[a]>porHora[b]?a:b, horas[0]) : null;

  const rangeLabel = rangeDays === 1
    ? 'Hoy'
    : rangeDays <= 7
    ? `${rangeDays} días`
    : rangeDays <= 31
    ? `${rangeDays} días`
    : `${Math.round(rangeDays/30)} meses`;

  const periodoLabel = `${fmtDateShort(rangeStart)} → ${fmtDateShort(rangeEnd - 1)}`;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      {mostrarTour && <GuidedTour onClose={cerrarTour} />}

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:G.text, margin:0, fontFamily:FONT_UI, letterSpacing:'-0.02em', lineHeight:1.2 }}>Dashboard</h1>
          <div style={{ fontSize:12, color:G.textFaint, marginTop:3 }}>{dateLong(new Date())}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <DateRangePicker
            startTs={rangeStart}
            endTs={rangeEnd}
            onChange={handleRangeChange}
          />
          <AnalyticsActions resetLabel="Reiniciar analíticas" editLabel="Editar analítica" />
        </div>
      </div>

      {/* ── Hero + KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:12 }}>

        {/* Hero */}
        <div style={{ ...kpiCard({ padding:'20px 22px' }) }}>
          <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.10em', marginBottom:3 }}>Facturación del período</div>
          <div style={{ fontSize:11, color:G.textFaint, marginBottom:10 }}>{periodoLabel}</div>
          <div style={{ fontSize:42, fontWeight:800, color:G.teal, letterSpacing:'-0.04em', fontFamily:FONT_UI, lineHeight:1 }}>
            {money(charts.facturacionHoy)}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color: revChange >= 0 ? G.teal : G.red, background: revChange >= 0 ? 'rgba(29,158,117,0.10)' : 'rgba(226,75,74,0.10)', padding:'3px 9px', borderRadius:99 }}>
              {revChange >= 0 ? '↑' : '↓'} {Math.abs(revChange)}%
            </span>
            <span style={{ fontSize:12, color:G.textFaint }}>vs período anterior</span>
          </div>
          {/* Sparkline */}
          <div style={{ display:'flex', alignItems:'flex-end', gap:2, marginTop:14, height:28 }}>
            {chartData.slice(-14).map((d, i) => {
              const maxV = Math.max(...chartData.map(x=>x.actual||0), 1);
              const h = Math.max(3, ((d.actual||0)/maxV)*28);
              return <div key={i} style={{ flex:1, height:h, background: i === chartData.slice(-14).length-1 ? G.teal : `rgba(29,158,117,${0.12+i*0.05})`, borderRadius:2 }}/>;
            })}
          </div>
        </div>

        {/* Ticket promedio */}
        <div style={{ ...kpiCard({ padding:'16px 18px' }) }}>
          <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.10em', marginBottom:6 }}>Ticket promedio</div>
          <div style={{ fontSize:32, fontWeight:800, color:G.violet, letterSpacing:'-0.03em', fontFamily:FONT_UI, lineHeight:1 }}>{money(charts.ticketPromedio)}</div>
          <div style={{ fontSize:11, color: ticketChange >= 0 ? G.teal : G.red, fontWeight:600, marginTop:4 }}>
            {ticketChange >= 0 ? '↑' : '↓'} {Math.abs(ticketChange)}% vs anterior
          </div>
        </div>

        {/* Mesas activas */}
        <div style={{ ...kpiCard({ padding:'16px 18px' }) }}>
          <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.10em', marginBottom:6 }}>Mesas activas</div>
          <div style={{ fontSize:32, fontWeight:800, color: demoradas > 0 ? G.red : G.blue, letterSpacing:'-0.03em', fontFamily:FONT_UI, lineHeight:1 }}>{activas}</div>
          <div style={{ fontSize:11, color: demoradas > 0 ? G.red : G.teal, fontWeight:600, marginTop:4 }}>
            {demoradas > 0 ? `${demoradas} demorada${demoradas>1?'s':''}` : 'Todo en orden'}
          </div>
        </div>

        {/* Mesas en el período */}
        <div style={{ ...kpiCard({ padding:'16px 18px' }) }}>
          <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.10em', marginBottom:6 }}>Mesas cerradas</div>
          <div style={{ fontSize:32, fontWeight:800, color:G.amber, letterSpacing:'-0.03em', fontFamily:FONT_UI, lineHeight:1 }}>
            {(store.closedTurns||[]).filter(t => (t._ts||0) >= rangeStart && (t._ts||0) < rangeEnd).length}
          </div>
          <div style={{ fontSize:11, color:G.textFaint, fontWeight:500, marginTop:4 }}>{rangeLabel}</div>
        </div>
      </div>

      {/* ── Gráfico principal ── */}
      <div style={{ ...kpiCard({ padding:'20px 22px' }) }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:G.text, fontFamily:FONT_UI }}>Facturación comparativa</div>
            <div style={{ fontSize:12, color:G.textFaint, marginTop:2 }}>
              {periodoLabel} vs período anterior ({fmtDateShort(rangeStart - (rangeEnd - rangeStart))} → {fmtDateShort(rangeStart - 1)})
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top:5, right:5, bottom:0, left:0 }}>
            <defs>
              <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={G.teal} stopOpacity={0.20}/>
                <stop offset="95%" stopColor={G.teal} stopOpacity={0.02}/>
              </linearGradient>
              <linearGradient id="gradAnterior" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={G.violet} stopOpacity={0.10}/>
                <stop offset="95%" stopColor={G.violet} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize:11, fill:G.textFaint }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize:11, fill:G.textFaint }} axisLine={false} tickLine={false} width={50}
              tickFormatter={v => v>=1000000?`$${(v/1000000).toFixed(1)}M`:v>=1000?`$${Math.round(v/1000)}k`:`$${v}`} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke:'#E2E8F0', strokeWidth:1 }} />
            <Area type="monotone" dataKey="actual"   stroke={G.teal}   strokeWidth={3}   fill="url(#gradActual)"   name="Período seleccionado" dot={false} activeDot={{ r:4, fill:G.teal, strokeWidth:0 }} />
            <Area type="monotone" dataKey="anterior" stroke={G.violet} strokeWidth={1.5} fill="url(#gradAnterior)" name="Período anterior" dot={false} strokeDasharray="4 2" activeDot={{ r:3, fill:G.violet, strokeWidth:0 }} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display:'flex', gap:20, marginTop:12 }}>
          {[[G.teal,'Período seleccionado',false],[G.violet,'Período anterior',true]].map(([c,l,dashed]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:18, height:2.5, background:c, borderRadius:99, opacity:dashed?0.5:1 }} />
              <span style={{ fontSize:11, color:G.textMuted, fontFamily:FONT_UI }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom 3 cols ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:12 }}>

        {/* Top productos */}
        <div style={{ ...kpiCard({ padding:'16px 20px' }) }}>
          <div style={{ fontSize:10, fontWeight:700, color:G.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:14, fontFamily:FONT_UI }}>Top productos del período</div>
          {(!charts.topProducts || charts.topProducts.length === 0)
            ? <p style={{ fontSize:12, color:G.textFaint, margin:0 }}>Sin datos para el período seleccionado.</p>
            : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {charts.topProducts.slice(0,5).map((p, i) => {
                  const colors = [G.teal, G.violet, G.blue, G.amber, '#F97316'];
                  const c = colors[i] || G.teal;
                  return (
                    <div key={p.nombre}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:10, fontWeight:800, color:G.textFaint, minWidth:18 }}>#{i+1}</span>
                          <span style={{ fontSize:13, color:G.text, fontWeight:600 }}>{p.nombre}</span>
                        </div>
                        <div>
                          <span style={{ fontSize:11, color:G.textFaint }}>{p.unidades} uds</span>
                          <span style={{ fontSize:11, color:c, fontWeight:700, marginLeft:8 }}>{money(p.monto)}</span>
                        </div>
                      </div>
                      <div style={{ height:3, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(p.unidades/maxProd)*100}%`, background:c, borderRadius:99 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        {/* Ticket promedio detalle */}
        <div style={{ ...kpiCard({ padding:'16px 20px' }) }}>
          <div style={{ fontSize:10, fontWeight:700, color:G.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10, fontFamily:FONT_UI }}>Ticket promedio</div>
          <div style={{ fontSize:36, fontWeight:800, color:G.violet, fontFamily:FONT_UI, letterSpacing:'-0.03em', marginBottom:2 }}>
            {money(charts.ticketPromedio)}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
            <span style={{ fontSize:11, fontWeight:700, color: ticketChange >= 0 ? G.teal : G.red, background: ticketChange >= 0 ? 'rgba(29,158,117,0.10)' : 'rgba(226,75,74,0.10)', padding:'2px 8px', borderRadius:99 }}>
              {ticketChange >= 0 ? '↑' : '↓'} {Math.abs(ticketChange)}%
            </span>
            <span style={{ fontSize:11, color:G.textFaint }}>vs mismo período anterior</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { label:'Este período',     val:charts.ticketPromedio,  color:G.violet },
              { label:'Período anterior', val:charts.ticketAnterior||0, color:'rgba(127,119,221,0.4)' },
            ].map(row => (
              <div key={row.label}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:11, color:G.textMuted }}>{row.label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:G.text }}>{money(row.val)}</span>
                </div>
                <div style={{ height:4, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${charts.ticketPromedio > 0 ? Math.min((row.val/(Math.max(charts.ticketPromedio,charts.ticketAnterior||1)*1.1))*100,100) : 0}%`, background:row.color, borderRadius:99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hora pico */}
        <div style={{ ...kpiCard({ padding:'16px 20px' }) }}>
          <div style={{ fontSize:10, fontWeight:700, color:G.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10, fontFamily:FONT_UI }}>Hora pico</div>
          {horas.length === 0
            ? <p style={{ fontSize:12, color:G.textFaint, margin:0 }}>Sin datos para el período seleccionado.</p>
            : <>
                <div style={{ fontSize:32, fontWeight:800, color:G.amber, fontFamily:FONT_UI, letterSpacing:'-0.02em', marginBottom:2 }}>
                  {`${String(horaPico).padStart(2,'0')}:00`}
                </div>
                <div style={{ fontSize:11, color:G.textFaint, marginBottom:14 }}>
                  {money(porHora[horaPico] || 0)} en ese horario
                </div>
                <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:48 }}>
                  {horas.map(h => (
                    <div key={h} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                      <div style={{ width:'100%', height:Math.max(3,(porHora[h]/maxHoraVal)*44), background:h===horaPico?G.amber:'#F1F5F9', borderRadius:3 }}/>
                      <span style={{ fontSize:9, color:G.textFaint }}>{h}h</span>
                    </div>
                  ))}
                </div>
              </>
          }
        </div>
      </div>

    </div>
  );
}
