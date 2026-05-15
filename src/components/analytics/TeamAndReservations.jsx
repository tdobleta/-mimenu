import { useMemo } from 'react';
import { money } from '@/lib/fmt';

const DAY_NAMES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

export default function TeamAndReservations({ periodTurns, reservas, periodStart }) {
  const team = useMemo(() => {
    const byMozo = {};
    periodTurns.forEach(t => {
      const m = (t.mozo || '').trim() || 'Sin asignar';
      if (!byMozo[m]) byMozo[m] = { mozo:m, mesas:0, total:0 };
      byMozo[m].mesas += 1;
      byMozo[m].total += t.total_facturado || 0;
    });
    const totalGeneral = Object.values(byMozo).reduce((a,m) => a + m.total, 0);
    return Object.values(byMozo).map(m => ({
      ...m,
      ticket: m.mesas > 0 ? Math.round(m.total / m.mesas) : 0,
      pct: totalGeneral > 0 ? ((m.total / totalGeneral) * 100).toFixed(1) : '0.0',
    })).sort((a,b) => b.total - a.total);
  }, [periodTurns]);

  const periodEnd = Date.now();
  const periodReservas = useMemo(() => {
    return (reservas || []).filter(r => {
      if (!r.fecha) return false;
      const ts = new Date(r.fecha + 'T00:00:00').getTime();
      return ts >= periodStart && ts <= periodEnd;
    });
  }, [reservas, periodStart, periodEnd]);

  const resStats = useMemo(() => {
    const total = periodReservas.length;
    const confirmadas = periodReservas.filter(r => r.estado === 'confirmada').length;
    const canceladas = periodReservas.filter(r => r.estado === 'cancelada').length;
    const online = periodReservas.filter(r => (r.canal||'').toLowerCase() !== 'manual' && (r.canal||'').toLowerCase() !== 'teléfono').length;
    return { total, confirmadas, canceladas, online };
  }, [periodReservas]);

  const reservasByDay = useMemo(() => {
    const counts = [0,0,0,0,0,0,0];
    periodReservas.forEach(r => {
      if (!r.fecha) return;
      const d = new Date(r.fecha + 'T00:00:00').getDay();
      const idx = (d + 6) % 7;
      counts[idx] += 1;
    });
    const max = Math.max(...counts, 1);
    return counts.map((c,i) => ({ day: DAY_NAMES[i], count: c, pct: (c/max)*100 }));
  }, [periodReservas]);

  const pct = (n) => resStats.total > 0 ? Math.round((n/resStats.total)*100) : 0;

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:16 }}>
      <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'18px 20px' }}>
        <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginBottom:14 }}>Rendimiento del equipo</div>
        {team.length === 0 ? (
          <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'20px 0' }}>Sin datos del equipo</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>
                {['Mozo','Mesas','Total','Ticket prom.','% del total'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 10px', fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((m,i) => (
                <tr key={m.mozo} style={{ backgroundColor: i%2 === 0 ? '#F9FAFB' : 'white' }}>
                  <td style={{ padding:'8px 10px', fontWeight:500, color:'#111827' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                      {i === 0 && <span style={{ width:6, height:6, borderRadius:'50%', backgroundColor:'#1D9E75' }} />}
                      {m.mozo}
                    </span>
                  </td>
                  <td style={{ padding:'8px 10px', color:'#374151' }}>{m.mesas}</td>
                  <td style={{ padding:'8px 10px', fontWeight:600, color:'#1D9E75' }}>{money(m.total)}</td>
                  <td style={{ padding:'8px 10px', color:'#374151' }}>{money(m.ticket)}</td>
                  <td style={{ padding:'8px 10px', color:'#6B7280' }}>{m.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'18px 20px' }}>
        <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginBottom:14 }}>Reservas del período</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:18 }}>
          <KPI label="Total" value={resStats.total} color="#111827" />
          <KPI label="Confirmadas" value={resStats.confirmadas} sub={`${pct(resStats.confirmadas)}%`} color="#1D9E75" />
          <KPI label="Canceladas" value={resStats.canceladas} sub={`${pct(resStats.canceladas)}%`} color="#EF4444" />
          <KPI label="Vía online" value={resStats.online} sub={`${pct(resStats.online)}%`} color="#3B82F6" />
        </div>
        <div style={{ fontSize:11, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>Por día de la semana</div>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:6, height:80 }}>
          {reservasByDay.map(d => (
            <div key={d.day} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{ fontSize:10, color:'#6B7280' }}>{d.count}</div>
              <div style={{ width:'100%', height:`${Math.max(4, d.pct*0.6)}px`, backgroundColor:'#1D9E75', borderRadius:'3px 3px 0 0', opacity: d.count > 0 ? 1 : 0.2 }} />
              <div style={{ fontSize:10, color:'#9CA3AF' }}>{d.day}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, sub, color }) {
  return (
    <div style={{ backgroundColor:'#F9FAFB', borderRadius:8, padding:'10px 12px' }}>
      <div style={{ fontSize:10, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>{sub}</div>}
    </div>
  );
}


