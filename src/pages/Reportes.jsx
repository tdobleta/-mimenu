import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { money } from '@/lib/fmt';
import AnalyticsActions from '../components/analytics/AnalyticsActions';
import { G, glass, glassDeep, glassLight, labelStyle, fontDisplay } from '@/lib/glass';

const TABS = [['ventas','Ventas'],['productos','Productos'],['mozos','Mozos'],['reservas','Reservas']];

function getPeriodStart(period) {
  const now = new Date();
  if (period === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d.getTime(); }
  if (period === 'week')  { const d = new Date(now); d.setDate(d.getDate() - d.getDay() + (d.getDay()===0?-6:1)); d.setHours(0,0,0,0); return d.getTime(); }
  if (period === 'month') { return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); }
  if (period === 'year')  { return new Date(now.getFullYear(), 0, 1).getTime(); }
  return 0;
}

function downloadCSV(filename, headers, rows) {
  const content = '\uFEFF' + [headers.join(','), ...rows.map(r=>r.join(','))].join('\n');
  const blob = new Blob([content], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

function parsePagos(t) {
  if (t.pagos) {
    try {
      const arr = Array.isArray(t.pagos) ? t.pagos : JSON.parse(t.pagos);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {}
  }
  const m = t.metodo_pago || '';
  if (!m.toLowerCase().startsWith('mixto')) return [{ metodo: m, monto: t.total_facturado || 0 }];
  const inner = m.match(/\((.+)\)/)?.[1];
  if (!inner) return [{ metodo: m, monto: t.total_facturado || 0 }];
  const parts = inner.split('+').map(part => {
    const match = part.trim().match(/^(.+?)\s+\$([\d.,]+)$/);
    if (!match) return null;
    return { metodo: match[1].trim(), monto: Number(match[2].replace(/\./g, '').replace(',', '.')) };
  }).filter(Boolean);
  return parts.length > 0 ? parts : [{ metodo: m, monto: t.total_facturado || 0 }];
}

function clasificarMetodo(metodo, monto, row) {
  const m = (metodo || '').toLowerCase();
  if (m.includes('efectivo'))                                                                      row.efectivo      += monto;
  else if (m.includes('tarjeta')||m.includes('dÃ©b')||m.includes('deb')||m.includes('crÃ©d')||m.includes('cred')) row.tarjeta += monto;
  else if (m.includes('mercado'))                                                                  row.mp            += monto;
  else if (m.includes('trans'))                                                                    row.transferencia += monto;
  else                                                                                             row.efectivo      += monto;
}

// ── Normalizar timestamps de base44 (puede venir como ms, segundos o ISO string)
function normTs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'string') { const d = new Date(ts); return isNaN(d.getTime()) ? 0 : d.getTime(); }
  const n = Number(ts);
  return n < 9_000_000_000 ? n * 1000 : n;
}

export default function Reportes() {
  const store = useStore();
  const [tab, setTab] = useState('ventas');
  const [period, setPeriod] = useState('week');
  const charts = store.getCharts();
  const dbTurns = store.closedTurns || [];
  const reservas = store.getReservas();

  useEffect(() => { if (store.refreshCharts) store.refreshCharts(); }, [store.branchId]); // eslint-disable-line

  const periodStart = getPeriodStart(period);
  const periodTurns = useMemo(() => (dbTurns||[]).filter(t => t.closed_at && normTs(t.closed_at) >= periodStart), [dbTurns, periodStart]);

  const VENTAS_DATA = useMemo(() => {
    if (periodTurns.length === 0) return [];
    const byDate = {};
    periodTurns.forEach(t => {
      const d = new Date(t.closed_at);
      const fecha = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      if (!byDate[fecha]) byDate[fecha] = { fecha, mesas:0, total:0, efectivo:0, tarjeta:0, mp:0, transferencia:0, propinas:0 };
      byDate[fecha].mesas += 1;
      byDate[fecha].total += t.total_facturado || 0;
      byDate[fecha].propinas += t.propina || 0;
      const pagosArr = parsePagos(t);
      if (pagosArr.length > 1) {
        pagosArr.forEach(p => clasificarMetodo(p.metodo, Number(p.monto)||0, byDate[fecha]));
      } else {
        clasificarMetodo(t.metodo_pago, t.total_facturado||0, byDate[fecha]);
      }
    });
    return Object.values(byDate).sort((a,b) => a.fecha.localeCompare(b.fecha));
  }, [periodTurns]);

  const MOZOS_DATA = useMemo(() => {
    if (periodTurns.length === 0) return [];
    const byMozo = {};
    periodTurns.forEach(t => {
      const m = (t.mozo||'').trim(); if (!m) return;
      if (!byMozo[m]) byMozo[m] = { mozo:m, mesas:0, total:0 };
      byMozo[m].mesas += 1; byMozo[m].total += t.total_facturado||0;
    });
    const totalGeneral = Object.values(byMozo).reduce((a,m) => a+m.total, 0);
    return Object.values(byMozo).map(m => ({ ...m, ticket: m.mesas>0?Math.round(m.total/m.mesas):0, pct: totalGeneral>0?((m.total/totalGeneral)*100).toFixed(1):'0.0' })).sort((a,b) => b.total-a.total);
  }, [periodTurns]);

  const RESERVAS_DATA = useMemo(() => {
    const total=reservas.length, confirmadas=reservas.filter(r=>r.estado==='confirmada').length,
      canceladas=reservas.filter(r=>r.estado==='cancelada').length,
      noShows=reservas.filter(r=>r.estado==='no-show'||r.estado==='noshow').length,
      online=reservas.filter(r=>(r.canal||'').toLowerCase()!=='manual').length;
    return { total, confirmadas, canceladas, noShows, online };
  }, [reservas]);

  const products = useMemo(() => {
    const p = charts.topProducts||[]; const totalMonto=p.reduce((a,x)=>a+x.monto,0);
    return p.map(x=>({...x, pct:totalMonto>0?((x.monto/totalMonto)*100).toFixed(1):'0.0'}));
  }, [charts]);

  const maxProd = products[0]?.unidades||1;
  const totalVentas = VENTAS_DATA.reduce((a,r)=>({ mesas:a.mesas+r.mesas, total:a.total+r.total, efectivo:a.efectivo+r.efectivo, tarjeta:a.tarjeta+r.tarjeta, mp:a.mp+r.mp, transferencia:a.transferencia+r.transferencia, propinas:a.propinas+(r.propinas||0) }), { mesas:0, total:0, efectivo:0, tarjeta:0, mp:0, transferencia:0, propinas:0 });

  function exportVentas()    { downloadCSV('ventas.csv',   ['Fecha','Mesas','Total','Efectivo','Tarjeta','MercadoPago','Transferencia','Propinas'], VENTAS_DATA.map(r=>[r.fecha,r.mesas,r.total,r.efectivo,r.tarjeta,r.mp,r.transferencia,r.propinas])); }
  function exportProductos() { downloadCSV('productos.csv',['Producto','Unidades','Total','%'], products.map(p=>[p.nombre,p.unidades,p.monto,p.pct])); }
  function exportMozos()     { downloadCSV('mozos.csv',    ['Mozo','Mesas','Total','Ticket','%'], MOZOS_DATA.map(m=>[m.mozo,m.mesas,m.total,m.ticket,m.pct])); }
  function exportReservas()  { downloadCSV('reservas.csv', ['MÃ©trica','Valor'], [['Total',RESERVAS_DATA.total],['Confirmadas',RESERVAS_DATA.confirmadas],['Canceladas',RESERVAS_DATA.canceladas],['No-shows',RESERVAS_DATA.noShows],['Online',RESERVAS_DATA.online]]); }

  const BtnExport = ({ onClick }) => (
    <button onClick={onClick} style={{ ...glassLight({ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:10, fontSize:12, color:G.textMid, cursor:'pointer', border:'1px solid rgba(255,255,255,0.8)' }) }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Exportar CSV
    </button>
  );

  const thStyle = { textAlign:'left', padding:'11px 16px', fontSize:11, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.3)' };
  const tdStyle = { padding:'11px 16px', fontSize:13, color:G.textMid, borderBottom:'1px solid rgba(255,255,255,0.35)' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <h1 style={{ fontSize:22, fontWeight:700, color:G.text, margin:0, fontFamily:fontDisplay, letterSpacing:'-0.02em' }}>Reportes</h1>
          <button onClick={()=>store.refreshCharts&&store.refreshCharts()} style={{ ...glassLight({ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:10, fontSize:12, color:G.textMid, cursor:'pointer', border:'1px solid rgba(255,255,255,0.8)' }) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Actualizar
          </button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <AnalyticsActions resetLabel="Reiniciar reportes" editLabel="Editar reportes" />
          <div style={{ display:'flex', gap:4 }}>
            {[['today','Hoy'],['week','Esta semana'],['month','Este mes'],['year','Este aÃ±o']].map(([k,l])=>(
              <button key={k} onClick={()=>setPeriod(k)} style={{ padding:'6px 14px', borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', border:'none', transition:'all .15s', background:period===k?G.teal:'rgba(255,255,255,0.55)', color:period===k?'white':G.textMuted, boxShadow:period===k?`0 4px 12px rgba(29,158,117,0.25)`:'none' }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4 }}>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:'8px 18px', fontSize:13, fontWeight:tab===k?700:500, cursor:'pointer', borderRadius:12, border:'none', transition:'all .15s', background:tab===k?'rgba(255,255,255,0.75)':'transparent', color:tab===k?G.teal:G.textFaint, boxShadow:tab===k?'0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)':'none' }}>{l}</button>
        ))}
      </div>

      {/* VENTAS vacÃ­o */}
      {tab==='ventas' && VENTAS_DATA.length===0 && (
        <div style={{ ...glass({ padding:'40px 20px', textAlign:'center' }) }}>
          <div style={{ fontSize:14, color:G.textMid, marginBottom:6, fontWeight:600 }}>No hay ventas cerradas en este perÃ­odo</div>
          <div style={{ fontSize:12, color:G.textFaint, marginBottom:18 }}>CerrÃ¡ tu primera mesa para empezar a ver datos.</div>
          <Link to="/salon" style={{ display:'inline-block', padding:'9px 20px', background:G.teal, color:'white', textDecoration:'none', borderRadius:10, fontSize:13, fontWeight:600, boxShadow:`0 4px 14px rgba(29,158,117,0.3)` }}>Ir al SalÃ³n</Link>
        </div>
      )}

      {/* VENTAS con datos */}
      {tab==='ventas' && VENTAS_DATA.length>0 && (
        <div style={{ ...glassDeep({ overflow:'hidden', padding:0 }) }}>
          {/* Resumen mÃ©todos de pago */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:0, padding:'18px 20px', borderBottom:'1px solid rgba(255,255,255,0.4)', alignItems:'center' }}>
            {[
              { label:'Efectivo',    val:totalVentas.efectivo,      color:G.teal },
              { label:'Tarjeta',     val:totalVentas.tarjeta,       color:G.violet },
              { label:'MercadoPago', val:totalVentas.mp,            color:G.amber },
              { label:'Transf.',     val:totalVentas.transferencia, color:G.blue },
              { label:'Propinas',    val:totalVentas.propinas,      color:G.textMuted },
            ].map(m=>(
              <div key={m.label} style={{ padding:'4px 20px', borderRight:'1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ ...labelStyle, marginBottom:3 }}>{m.label}</div>
                <div style={{ fontSize:17, fontWeight:700, color:m.color, fontFamily:fontDisplay }}>{money(m.val)}</div>
              </div>
            ))}
            <div style={{ marginLeft:'auto', paddingLeft:20 }}><BtnExport onClick={exportVentas}/></div>
          </div>
          {/* Tabla */}
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:680 }}>
              <thead><tr>{['Fecha','Mesas','Total','Efectivo','Tarjeta','MercadoPago','Transf.','Propinas'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {VENTAS_DATA.map(r=>(
                  <tr key={r.fecha} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ ...tdStyle, fontWeight:600, color:G.text }}>{r.fecha}</td>
                    <td style={tdStyle}>{r.mesas}</td>
                    <td style={{ ...tdStyle, fontWeight:700, color:G.teal }}>{money(r.total)}</td>
                    <td style={tdStyle}>{money(r.efectivo)}</td>
                    <td style={{ ...tdStyle, color:r.tarjeta>0?G.violet:G.textFaint }}>{money(r.tarjeta)}</td>
                    <td style={{ ...tdStyle, color:r.mp>0?G.amber:G.textFaint }}>{money(r.mp)}</td>
                    <td style={{ ...tdStyle, color:r.transferencia>0?G.blue:G.textFaint }}>{money(r.transferencia)}</td>
                    <td style={tdStyle}>{money(r.propinas)}</td>
                  </tr>
                ))}
                <tr style={{ background:'rgba(29,158,117,0.06)' }}>
                  <td style={{ ...tdStyle, fontWeight:800, color:G.text, fontSize:11, letterSpacing:'0.06em' }}>TOTAL</td>
                  <td style={{ ...tdStyle, fontWeight:700, color:G.text }}>{totalVentas.mesas}</td>
                  <td style={{ ...tdStyle, fontWeight:800, color:G.teal }}>{money(totalVentas.total)}</td>
                  <td style={{ ...tdStyle, fontWeight:700 }}>{money(totalVentas.efectivo)}</td>
                  <td style={{ ...tdStyle, fontWeight:700, color:G.violet }}>{money(totalVentas.tarjeta)}</td>
                  <td style={{ ...tdStyle, fontWeight:700, color:G.amber }}>{money(totalVentas.mp)}</td>
                  <td style={{ ...tdStyle, fontWeight:700, color:G.blue }}>{money(totalVentas.transferencia)}</td>
                  <td style={{ ...tdStyle, fontWeight:700 }}>{money(totalVentas.propinas)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PRODUCTOS */}
      {tab==='productos' && (
        <div style={{ ...glassDeep({ padding:'20px 24px' }) }}>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:18 }}><BtnExport onClick={exportProductos}/></div>
          {products.length===0
            ? <div style={{ textAlign:'center', fontSize:13, color:G.textFaint, padding:'30px 0' }}>No hay productos vendidos en este perÃ­odo.</div>
            : <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {products.map((p,i)=>(
                  <div key={p.nombre} style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <span style={{ fontSize:11, fontWeight:800, color:G.textFaint, minWidth:20 }}>#{i+1}</span>
                    <div style={{ flex:2, minWidth:140 }}><div style={{ fontSize:13, fontWeight:600, color:G.text }}>{p.nombre}</div></div>
                    <div style={{ flex:3 }}>
                      <div style={{ height:7, background:'rgba(0,0,0,0.07)', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(p.unidades/maxProd)*100}%`, background:G.teal, borderRadius:99, transition:'width 0.6s ease' }}/>
                      </div>
                    </div>
                    <div style={{ minWidth:60, textAlign:'right', fontSize:13, fontWeight:700, color:G.teal }}>{p.unidades} uds</div>
                    <div style={{ minWidth:110, textAlign:'right', fontSize:13, color:G.textMid }}>{money(p.monto)}</div>
                    <div style={{ minWidth:44, textAlign:'right', fontSize:12, color:G.textFaint }}>{p.pct}%</div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* MOZOS */}
      {tab==='mozos' && (
        <div style={{ ...glassDeep({ overflow:'hidden', padding:0 }) }}>
          <div style={{ display:'flex', justifyContent:'flex-end', padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,0.4)' }}><BtnExport onClick={exportMozos}/></div>
          {MOZOS_DATA.length===0
            ? <div style={{ textAlign:'center', fontSize:13, color:G.textFaint, padding:'30px 0' }}>No hay datos de mozos en este perÃ­odo.</div>
            : <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>{['Mozo','Mesas','Total facturado','Ticket promedio','% del total'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {MOZOS_DATA.map(m=>(
                    <tr key={m.mozo} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{ ...tdStyle, fontWeight:600, color:G.text }}>{m.mozo}</td>
                      <td style={tdStyle}>{m.mesas}</td>
                      <td style={{ ...tdStyle, fontWeight:700, color:G.teal }}>{money(m.total)}</td>
                      <td style={tdStyle}>{money(m.ticket)}</td>
                      <td style={tdStyle}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, height:5, background:'rgba(0,0,0,0.07)', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${m.pct}%`, background:G.teal, borderRadius:99 }}/>
                          </div>
                          <span style={{ minWidth:36, fontSize:12, color:G.textMuted }}>{m.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}

      {/* RESERVAS */}
      {tab==='reservas' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', justifyContent:'flex-end' }}><BtnExport onClick={exportReservas}/></div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
            {[
              { label:'Total reservas',  value:RESERVAS_DATA.total,        color:G.text  },
              { label:'Confirmadas',     value:RESERVAS_DATA.confirmadas,   color:G.teal  },
              { label:'Canceladas',      value:RESERVAS_DATA.canceladas,    color:G.red   },
              { label:'No-shows',        value:RESERVAS_DATA.noShows,       color:G.amber },
              { label:'Reservas online', value:RESERVAS_DATA.online,        color:G.blue  },
            ].map(k=>(
              <div key={k.label} style={{ ...glass({ padding:'18px 20px' }) }}>
                <div style={labelStyle}>{k.label}</div>
                <div style={{ fontSize:32, fontWeight:700, color:k.color, lineHeight:1, fontFamily:fontDisplay }}>{k.value}</div>
                {k.sub && <div style={{ fontSize:12, color:k.color, marginTop:6, fontWeight:600, opacity:0.8 }}>{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}