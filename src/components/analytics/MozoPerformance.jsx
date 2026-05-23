// components/analytics/MozoPerformance.jsx
// Ranking de mozos: ventas, mesas atendidas, ticket promedio, propinas.
// Datos: store.closedTurns filtrados por período — sin queries adicionales.

import { useMemo } from 'react';
import { money } from '@/lib/fmt';
import { G } from '@/lib/glass';

const FONT_UI = "'DM Sans', system-ui, sans-serif";

/**
 * @param {Array}  periodTurns — turns cerrados del período seleccionado
 */
export default function MozoPerformance({ periodTurns }) {
  const stats = useMemo(() => {
    if (!periodTurns?.length) return [];

    const acc = {};
    periodTurns.forEach(t => {
      const mozo = (t.mozo || '').trim() || 'Sin asignar';
      if (!acc[mozo]) acc[mozo] = { mozo, ventas: 0, mesas: 0, propinas: 0 };
      acc[mozo].ventas   += (t.total_facturado || 0);
      acc[mozo].propinas += (t.propina || 0);
      acc[mozo].mesas++;
    });

    return Object.values(acc)
      .map(m => ({
        ...m,
        ventasTotales: m.ventas + m.propinas,
        ticketProm: m.mesas > 0 ? m.ventas / m.mesas : 0,
      }))
      .sort((a, b) => b.ventasTotales - a.ventasTotales);
  }, [periodTurns]);

  if (!stats.length) {
    return (
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', borderRadius:14, padding:'32px 20px', textAlign:'center' }}>
        <p style={{ color:G.textFaint, fontSize:13, margin:0 }}>No hay datos de mozos para este período.</p>
      </div>
    );
  }

  const maxVentas = stats[0]?.ventasTotales || 1;

  return (
    <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', borderRadius:14, padding:'20px 22px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.08em' }}>
            Ranking de mozos
          </div>
          <div style={{ fontSize:13, color:G.textMuted, marginTop:2 }}>
            {stats.length} mozo{stats.length !== 1 ? 's' : ''} · {periodTurns.length} mesas en el período
          </div>
        </div>
        {/* Leyenda */}
        <div style={{ display:'flex', gap:12, fontSize:11, color:G.textFaint }}>
          <span>Ventas</span>
          <span>Mesas</span>
          <span>Ticket</span>
          <span>Propinas</span>
        </div>
      </div>

      {/* Lista de mozos */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {stats.map((m, idx) => {
          const pct = Math.round((m.ventasTotales / maxVentas) * 100);
          const isMVP = idx === 0 && stats.length > 1;

          return (
            <div key={m.mozo}>
              {/* Fila principal */}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
                {/* Avatar inicial */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: isMVP ? 'rgba(29,158,117,0.12)' : '#F1F5F9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700,
                  color: isMVP ? G.teal : G.textMuted,
                  fontFamily: FONT_UI,
                }}>
                  {m.mozo === 'Sin asignar' ? '?' : m.mozo.charAt(0).toUpperCase()}
                </div>

                {/* Nombre + badge MVP */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:G.text, fontFamily:FONT_UI, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {m.mozo}
                    </span>
                    {isMVP && (
                      <span style={{ fontSize:9, fontWeight:700, color:G.teal, background:'rgba(29,158,117,0.1)', border:'1px solid rgba(29,158,117,0.2)', borderRadius:4, padding:'1px 5px', letterSpacing:'0.05em' }}>
                        MVP
                      </span>
                    )}
                    {idx === stats.length - 1 && stats.length > 2 && (
                      <span style={{ fontSize:9, fontWeight:700, color:'#94A3B8', background:'#F1F5F9', border:'1px solid #E2E8F0', borderRadius:4, padding:'1px 5px' }}>
                        #{idx + 1}
                      </span>
                    )}
                  </div>
                </div>

                {/* Métricas alineadas a la derecha */}
                <div style={{ display:'grid', gridTemplateColumns:'80px 52px 80px 72px', gap:0, textAlign:'right' }}>
                  <span style={{ fontSize:13, fontWeight:700, color: isMVP ? G.teal : G.text, fontFamily:FONT_UI }}>{money(m.ventasTotales)}</span>
                  <span style={{ fontSize:13, color:G.textMuted, fontFamily:FONT_UI }}>{m.mesas}</span>
                  <span style={{ fontSize:12, color:G.textMuted, fontFamily:FONT_UI }}>{money(m.ticketProm)}</span>
                  <span style={{ fontSize:12, color: m.propinas > 0 ? '#F59E0B' : G.textFaint, fontFamily:FONT_UI }}>
                    {m.propinas > 0 ? money(m.propinas) : '-'}
                  </span>
                </div>
              </div>

              {/* Barra de progreso */}
              <div style={{ marginLeft:42, height:3, background:'#F1F5F9', borderRadius:99, overflow:'hidden' }}>
                <div style={{
                  height:'100%', borderRadius:99,
                  width: `${pct}%`,
                  background: isMVP ? G.teal : '#CBD5E1',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Totales del período */}
      <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid #F1F5F9', display:'flex', gap:24, flexWrap:'wrap' }}>
        {[
          { label:'Total ventas período', value: money(stats.reduce((a,m) => a + m.ventas, 0)), color: G.teal },
          { label:'Total propinas', value: money(stats.reduce((a,m) => a + m.propinas, 0)), color:'#F59E0B' },
          { label:'Ticket promedio global', value: money(periodTurns.length > 0 ? stats.reduce((a,m) => a + m.ventas, 0) / periodTurns.length : 0), color: G.textMid },
        ].map(kpi => (
          <div key={kpi.label}>
            <div style={{ fontSize:10, color:G.textFaint, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em' }}>{kpi.label}</div>
            <div style={{ fontSize:16, fontWeight:800, color:kpi.color, fontFamily:FONT_UI, letterSpacing:'-0.02em' }}>{kpi.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
