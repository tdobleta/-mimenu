import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { money } from '@/lib/fmt';

function fmtDateShort(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}
function fmtDateRange(start, end) {
  return `${fmtDateShort(start)} — ${fmtDateShort(end)}`;
}

export default function SalesEvolution({ periodTurns, period, allTurns, periodStart }) {
  const periodEnd = Date.now();

  const chartData = useMemo(() => {
    if (period === 'today') {
      const buckets = Array.from({length:24}, (_,h) => ({ label:`${String(h).padStart(2,'0')}:00`, monto:0 }));
      periodTurns.forEach(t => {
        const h = new Date(t.closed_at).getHours();
        buckets[h].monto += t.total_facturado || 0;
      });
      return buckets.filter((_,i) => i >= 8 && i <= 23);
    }
    const DAY_MS = 86400000;
    const startDay = new Date(periodStart); startDay.setHours(0,0,0,0);
    const days = Math.ceil((periodEnd - startDay.getTime()) / DAY_MS) + 1;
    const buckets = [];
    for (let i = 0; i < days; i++) {
      const dayStart = startDay.getTime() + i * DAY_MS;
      const dayEnd = dayStart + DAY_MS;
      const monto = periodTurns
        .filter(t => t.closed_at >= dayStart && t.closed_at < dayEnd)
        .reduce((a,t) => a + (t.total_facturado||0), 0);
      buckets.push({ label: fmtDateShort(dayStart), monto, ts: dayStart });
    }
    return buckets;
  }, [periodTurns, period, periodStart, periodEnd]);

  const subStats = useMemo(() => {
    if (period === 'today' || chartData.length === 0) return null;
    const withTs = chartData.filter(d => d.monto > 0);
    if (withTs.length === 0) return null;
    const max = withTs.reduce((a,b) => b.monto > a.monto ? b : a);
    const min = withTs.reduce((a,b) => b.monto < a.monto ? b : a);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth()+1, 0);
    const daysInMonth = monthEnd.getDate();
    const daysElapsed = Math.max(1, Math.ceil((Date.now() - monthStart) / 86400000));
    const monthTotal = (allTurns || [])
      .filter(t => t.closed_at >= monthStart && t.closed_at <= Date.now())
      .reduce((a,t) => a + (t.total_facturado||0), 0);
    const proyeccion = (monthTotal / daysElapsed) * daysInMonth;

    return { max, min, proyeccion };
  }, [chartData, period, allTurns]);

  return (
    <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'18px 20px' }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Evolución de ventas</div>
        <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>
          {period === 'today' ? `Hoy ${fmtDateShort(periodStart)}` : fmtDateRange(periodStart, periodEnd)}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1D9E75" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#1D9E75" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false}
            tickFormatter={v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v/1000)}k` : `$${v}`} />
          <Tooltip contentStyle={{ border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:8, fontSize:12 }} formatter={v => [money(v), 'Facturación']} />
          <Area type="monotone" dataKey="monto" stroke="#1D9E75" strokeWidth={2} fill="url(#areaFill)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>

      {subStats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:10, marginTop:14 }}>
          <SubCard label="Mejor día" value={money(subStats.max.monto)} sub={subStats.max.label} color="#1D9E75" />
          <SubCard label="Día más bajo" value={money(subStats.min.monto)} sub={subStats.min.label} color="#EF4444" />
          <SubCard label="Proyección mensual" value={money(Math.round(subStats.proyeccion))} sub="al cierre del mes" color="#3B82F6" />
        </div>
      )}
    </div>
  );
}

function SubCard({ label, value, sub, color }) {
  return (
    <div style={{ backgroundColor:'#F9FAFB', borderRadius:8, padding:'12px 14px' }}>
      <div style={{ fontSize:11, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:16, fontWeight:700, color, marginBottom:2 }}>{value}</div>
      <div style={{ fontSize:11, color:'#6B7280' }}>{sub}</div>
    </div>
  );
}


