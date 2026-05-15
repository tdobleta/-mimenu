import { useMemo } from 'react';
import { useStore } from '@/lib/store';

const DAY_NAMES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 12);
const LEVELS = ['#F3F4F6', '#E1F5EE', '#9FE1CB', '#5DCAA5', '#1D9E75', '#0F6E56'];

function getLevel(value, max) {
  if (!value || max === 0) return 0;
  const pct = value / max;
  if (pct < 0.2) return 1;
  if (pct < 0.4) return 2;
  if (pct < 0.6) return 3;
  if (pct < 0.8) return 4;
  return 5;
}

export default function TablePerformance({ periodTurns, period, periodStart }) {
  const store = useStore();

  const stats = useMemo(() => {
    const totalMesas = store.branchId === 'todas'
      ? store.sucursales.reduce((a, su) => a + (store.tables[su.id]?.length || 0), 0)
      : (store.tables[store.branchId]?.length || 0);

    const periodEnd = Date.now();
    const days = Math.max(1, Math.ceil((periodEnd - periodStart) / 86400000));
    const ocupacion = totalMesas > 0 ? ((periodTurns.length / (totalMesas * days)) * 100).toFixed(1) : '0.0';

    const tiempos = periodTurns
      .filter(t => t.opened_at && t.closed_at && t.closed_at > t.opened_at)
      .map(t => (t.closed_at - t.opened_at) / 60000);
    const tiempoProm = tiempos.length > 0 ? Math.round(tiempos.reduce((a,b)=>a+b,0) / tiempos.length) : 0;

    const byMesa = {};
    periodTurns.forEach(t => {
      if (t.mesa_num) byMesa[t.mesa_num] = (byMesa[t.mesa_num]||0) + 1;
    });
    let mesaTop = null, mesaCount = 0;
    Object.entries(byMesa).forEach(([m,c]) => { if (c > mesaCount) { mesaCount = c; mesaTop = m; } });

    return { ocupacion, tiempoProm, mesaTop, mesaCount };
  }, [periodTurns, periodStart, store]);

  const heat = useMemo(() => {
    const grid = Array.from({length:7}, () => ({}));
    let max = 0;
    periodTurns.forEach(t => {
      const d = new Date(t.closed_at);
      const dow = (d.getDay() + 6) % 7; // Lun=0
      const h = d.getHours();
      if (h < 12 || h > 23) return;
      grid[dow][h] = (grid[dow][h] || 0) + (t.total_facturado || 0);
      if (grid[dow][h] > max) max = grid[dow][h];
    });
    return { grid, max };
  }, [periodTurns]);

  return (
    <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'18px 20px' }}>
      <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginBottom:14 }}>Rendimiento del salón</div>

      <div style={{ display:'flex', flexWrap:'wrap', borderTop:'0.5px solid rgba(0,0,0,0.06)', borderBottom:'0.5px solid rgba(0,0,0,0.06)', marginBottom:18 }}>
        <Stat label="Tasa de ocupación" value={`${stats.ocupacion}%`} divider />
        <Stat label="Tiempo prom. de mesa" value={`${stats.tiempoProm} min`} divider />
        <Stat label="Mesa más activa" value={stats.mesaTop ? `Mesa ${stats.mesaTop}` : '—'} sub={stats.mesaTop ? `${stats.mesaCount} turnos` : ''} />
      </div>

      <div style={{ fontSize:12, color:'#6B7280', marginBottom:10 }}>Calor por día y hora (facturación)</div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ borderCollapse:'separate', borderSpacing:'2px', width:'100%' }}>
          <thead>
            <tr>
              <th style={{ width:32 }} />
              {HOURS.map(h => (
                <th key={h} style={{ fontSize:10, color:'#9CA3AF', fontWeight:400, padding:'0 0 4px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_NAMES.map((day, di) => (
              <tr key={day}>
                <td style={{ fontSize:10, color:'#9CA3AF', textAlign:'right', paddingRight:6 }}>{day}</td>
                {HOURS.map(h => {
                  const v = heat.grid[di]?.[h] || 0;
                  const lvl = getLevel(v, heat.max);
                  return (
                    <td key={h}>
                      <div title={v > 0 ? `$${v.toLocaleString('es-AR')}` : ''}
                        style={{ height:22, borderRadius:3, backgroundColor:LEVELS[lvl] }} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center', marginTop:10, fontSize:11, color:'#9CA3AF' }}>
        <span>Menos</span>
        {LEVELS.slice(1).map((c,i) => <div key={i} style={{ width:12, height:12, borderRadius:2, backgroundColor:c }} />)}
        <span>Más</span>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, divider }) {
  return (
    <div style={{ flex:1, minWidth:160, padding:'14px 16px', borderRight: divider ? '0.5px solid rgba(0,0,0,0.06)' : 'none' }}>
      <div style={{ fontSize:11, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:700, color:'#111827', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>{sub}</div>}
    </div>
  );
}


