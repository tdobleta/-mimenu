import { useMemo } from 'react';
import { money } from '@/lib/fmt';

const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

export default function AnalyticsSummary({ periodTurns, prevTurns }) {
  const stats = useMemo(() => {
    const total = periodTurns.reduce((a,t) => a + (t.total_facturado||0), 0);
    const ticket = periodTurns.length > 0 ? total / periodTurns.length : 0;
    const totalPrev = prevTurns.reduce((a,t) => a + (t.total_facturado||0), 0);
    const ticketPrev = prevTurns.length > 0 ? totalPrev / prevTurns.length : 0;

    const tiempos = periodTurns
      .filter(t => t.opened_at && t.closed_at && t.closed_at > t.opened_at)
      .map(t => (t.closed_at - t.opened_at) / 60000);
    const tiempoProm = tiempos.length > 0 ? Math.round(tiempos.reduce((a,b)=>a+b,0) / tiempos.length) : 0;

    const tiemposPrev = prevTurns
      .filter(t => t.opened_at && t.closed_at && t.closed_at > t.opened_at)
      .map(t => (t.closed_at - t.opened_at) / 60000);
    const tiempoPromPrev = tiemposPrev.length > 0 ? Math.round(tiemposPrev.reduce((a,b)=>a+b,0) / tiemposPrev.length) : 0;

    const byDay = {};
    periodTurns.forEach(t => {
      const d = new Date(t.closed_at).getDay();
      byDay[d] = (byDay[d]||0) + (t.total_facturado||0);
    });
    let bestDay = null, bestVal = 0;
    Object.entries(byDay).forEach(([d,v]) => { if (v > bestVal) { bestVal = v; bestDay = d; } });

    const change = (a,b) => b > 0 ? Math.round(((a-b)/b)*100) : 0;
    return {
      total, ticket, mesas: periodTurns.length, tiempoProm,
      bestDay: bestDay !== null ? DAYS[bestDay] : '—',
      changeTotal: change(total, totalPrev),
      changeTicket: change(ticket, ticketPrev),
      changeMesas: change(periodTurns.length, prevTurns.length),
      changeTiempo: change(tiempoProm, tiempoPromPrev),
    };
  }, [periodTurns, prevTurns]);

  const cards = [
    { label:'Facturación total', value: money(stats.total), change: stats.changeTotal },
    { label:'Ticket promedio',   value: money(Math.round(stats.ticket)), change: stats.changeTicket },
    { label:'Mesas atendidas',   value: stats.mesas, change: stats.changeMesas },
    { label:'Tiempo prom. mesa', value: `${stats.tiempoProm} min`, change: -stats.changeTiempo },
    { label:'Mejor día',         value: stats.bestDay, change: null },
  ];

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12 }}>
      {cards.map(c => (
        <div key={c.label} style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'18px 20px' }}>
          <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.5px', color:'#9CA3AF', marginBottom:8 }}>{c.label}</div>
          <div style={{ fontSize:28, fontWeight:700, color:'#111827', lineHeight:1, letterSpacing:'-0.5px' }}>{c.value}</div>
          {c.change !== null && (
            <div style={{ fontSize:12, marginTop:6, color: c.change > 0 ? '#1D9E75' : c.change < 0 ? '#EF4444' : '#9CA3AF' }}>
              {c.change > 0 ? '↑ ' : c.change < 0 ? '↓ ' : ''}{c.change > 0 ? '+' : ''}{c.change}% vs período anterior
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


