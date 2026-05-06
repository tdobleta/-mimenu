import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { money } from '@/lib/fmt';
import AnalyticsActions from '../components/analytics/AnalyticsActions';

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

export default function Reportes() {
  const store = useStore();
  const [tab, setTab] = useState('ventas');
  const [period, setPeriod] = useState('week');
  const charts = store.getCharts();
  const dbTurns = store.closedTurns || [];
  const reservas = store.getReservas();

  useEffect(() => {
    if (store.refreshCharts) store.refreshCharts();
  // eslint-disable-next-line
  }, [store.branchId]);

  const periodStart = getPeriodStart(period);

  const periodTurns = useMemo(() => {
    return (dbTurns || []).filter(t => t.closed_at && t.closed_at >= periodStart);
  }, [dbTurns, periodStart]);

  const VENTAS_DATA = useMemo(() => {
    if (periodTurns.length === 0) return [];
    const byDate = {};
    periodTurns.forEach(t => {
      const d = new Date(t.closed_at);
      const fecha = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      if (!byDate[fecha]) byDate[fecha] = { fecha, mesas:0, total:0, efectivo:0, debito:0, credito:0, mp:0, transferencia:0, propinas:0 };
      byDate[fecha].mesas += 1;
      byDate[fecha].total += t.total_facturado || 0;
      const mp = (t.metodo_pago || 'efectivo').toLowerCase();
      if (mp.includes('efectivo')) byDate[fecha].efectivo += t.total_facturado || 0;
      else if (mp.includes('déb') || mp.includes('deb')) byDate[fecha].debito += t.total_facturado || 0;
      else if (mp.includes('créd') || mp.includes('cred')) byDate[fecha].credito += t.total_facturado || 0;
      else if (mp.includes('mercado')) byDate[fecha].mp += t.total_facturado || 0;
      else if (mp.includes('trans')) byDate[fecha].transferencia += t.total_facturado || 0;
      byDate[fecha].propinas += t.propina || 0;
    });
    return Object.values(byDate).sort((a,b) => a.fecha.localeCompare(b.fecha));
  }, [periodTurns]);

  const MOZOS_DATA = useMemo(() => {
    if (periodTurns.length === 0) return [];
    const byMozo = {};
    periodTurns.forEach(t => {
      const m = (t.mozo || '').trim();
      if (!m) return;
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

  const RESERVAS_DATA = useMemo(() => {
    const total = reservas.length;
    const confirmadas = reservas.filter(r => r.estado === 'confirmada').length;
    const canceladas = reservas.filter(r => r.estado === 'cancelada').length;
    const noShows = reservas.filter(r => r.estado === 'no-show' || r.estado === 'noshow').length;
    const online = reservas.filter(r => (r.canal||'').toLowerCase() !== 'manual').length;
    return { total, confirmadas, canceladas, noShows, online };
  }, [reservas]);

  const products = useMemo(()=>{
    const p = charts.topProducts || [];
    const totalMonto = p.reduce((a,x)=>a+x.monto,0);
    return p.map(x=>({ ...x, pct: totalMonto>0 ? ((x.monto/totalMonto)*100).toFixed(1) : '0.0' }));
  },[charts]);

  const maxProd = products[0]?.unidades || 1;

  const totalVentas = VENTAS_DATA.reduce((a,r)=>({
    mesas:a.mesas+r.mesas, total:a.total+r.total, efectivo:a.efectivo+r.efectivo,
    debito:a.debito+r.debito, credito:a.credito+r.credito, mp:a.mp+r.mp,
    transferencia:a.transferencia+r.transferencia, propinas:a.propinas+(r.propinas||0),
  }), { mesas:0, total:0, efectivo:0, debito:0, credito:0, mp:0, transferencia:0, propinas:0 });

  function exportVentas() {
    downloadCSV('ventas.csv', ['Fecha','Mesas','Total','Efectivo','Débito','Crédito','MP','Transfer','Propinas'],
      VENTAS_DATA.map(r=>[r.fecha,r.mesas,r.total,r.efectivo,r.debito,r.credito,r.mp,r.transferencia,r.propinas]));
  }
  function exportProductos() {
    downloadCSV('productos.csv', ['Producto','Unidades','Total','%'], products.map(p=>[p.nombre,p.unidades,p.monto,p.pct]));
  }
  function exportMozos() {
    downloadCSV('mozos.csv', ['Mozo','Mesas','Total','Ticket promedio','% del total'], MOZOS_DATA.map(m=>[m.mozo,m.mesas,m.total,m.ticket,m.pct]));
  }
  function exportReservas() {
    downloadCSV('reservas.csv', ['Métrica','Valor'], [['Total',RESERVAS_DATA.total],['Confirmadas',RESERVAS_DATA.confirmadas],['Canceladas',RESERVAS_DATA.canceladas],['No-shows',RESERVAS_DATA.noShows],['Online',RESERVAS_DATA.online]]);
  }

  const BtnExport = ({ onClick }) => (
    <button onClick={onClick} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:12, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Exportar CSV
    </button>
  );

  const Col = ({children, style={}}) => <th style={{ textAlign:'left', padding:'10px 14px', fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'0.5px solid rgba(0,0,0,0.08)', ...style }}>{children}</th>;
  const Cell = ({children, style={}}) => <td style={{ padding:'10px 14px', fontSize:13, color:'#374151', ...style }}>{children}</td>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <h1 style={{ fontSize:20, fontWeight:600, color:'#111827', margin:0 }}>Reportes</h1>
          <button onClick={()=>store.refreshCharts && store.refreshCharts()}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:12, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Actualizar
          </button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <AnalyticsActions resetLabel="Reiniciar reportes" editLabel="Editar reportes" />
          <div style={{ display:'flex', gap:4 }}>
            {[['today','Hoy'],['week','Esta semana'],['month','Este mes'],['year','Este año']].map(([k,l])=>(
              <button key={k} onClick={()=>setPeriod(k)}
                style={{ padding:'5px 12px', borderRadius:7, fontSize:12, cursor:'pointer', backgroundColor:period===k?'#1D9E75':'white', color:period===k?'white':'#6B7280', border:period===k?'none':'0.5px solid rgba(0,0,0,0.10)' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', borderBottom:'0.5px solid rgba(0,0,0,0.08)' }}>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{ padding:'8px 16px', fontSize:13, border:'none', background:'none', cursor:'pointer', marginBottom:-1, fontWeight:tab===k?500:400, color:tab===k?'#1D9E75':'#9CA3AF', borderBottom:tab===k?'2px solid #1D9E75':'2px solid transparent', transition:'all .15s' }}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'ventas' && VENTAS_DATA.length === 0 && (
        <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'40px 20px', textAlign:'center' }}>
          <div style={{ fontSize:14, color:'#374151', marginBottom:6, fontWeight:500 }}>No hay ventas cerradas en este período</div>
          <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:16 }}>Cerrá tu primera mesa para empezar a ver datos.</div>
          <Link to="/salon" style={{ display:'inline-block', padding:'8px 16px', backgroundColor:'#1D9E75', color:'white', textDecoration:'none', borderRadius:7, fontSize:13 }}>Ir al Salón</Link>
        </div>
      )}

      {tab === 'ventas' && VENTAS_DATA.length > 0 && (
        <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'flex-end', padding:'12px 16px', borderBottom:'0.5px solid rgba(0,0,0,0.06)' }}>
            <BtnExport onClick={exportVentas} />
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:800 }}>
              <thead style={{ backgroundColor:'#F9FAFB' }}>
                <tr>{['Fecha','Mesas','Total','Efectivo','Deb. débito','Deb. crédito','MercadoPago','Transf.','Propinas'].map(h=><Col key={h}>{h}</Col>)}</tr>
              </thead>
              <tbody>
                {VENTAS_DATA.map(r=>(
                  <tr key={r.fecha} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                    <Cell>{r.fecha}</Cell>
                    <Cell>{r.mesas}</Cell>
                    <Cell style={{ fontWeight:600, color:'#111827' }}>{money(r.total)}</Cell>
                    <Cell>{money(r.efectivo)}</Cell>
                    <Cell>{money(r.debito)}</Cell>
                    <Cell>{money(r.credito)}</Cell>
                    <Cell>{money(r.mp)}</Cell>
                    <Cell>{money(r.transferencia)}</Cell>
                    <Cell>{money(r.propinas)}</Cell>
                  </tr>
                ))}
                <tr style={{ backgroundColor:'#F9FAFB' }}>
                  <td style={{ padding:'10px 14px', fontSize:13, color:'#111827', fontWeight:700 }}>TOTAL</td>
                  <Cell style={{ fontWeight:700, color:'#111827' }}>{totalVentas.mesas}</Cell>
                  <Cell style={{ fontWeight:700, color:'#1D9E75' }}>{money(totalVentas.total)}</Cell>
                  <Cell style={{ fontWeight:700, color:'#111827' }}>{money(totalVentas.efectivo)}</Cell>
                  <Cell style={{ fontWeight:700, color:'#111827' }}>{money(totalVentas.debito)}</Cell>
                  <Cell style={{ fontWeight:700, color:'#111827' }}>{money(totalVentas.credito)}</Cell>
                  <Cell style={{ fontWeight:700, color:'#111827' }}>{money(totalVentas.mp)}</Cell>
                  <Cell style={{ fontWeight:700, color:'#111827' }}>{money(totalVentas.transferencia)}</Cell>
                  <Cell style={{ fontWeight:700, color:'#111827' }}>{money(totalVentas.propinas)}</Cell>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'productos' && (
        <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:20 }}>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <BtnExport onClick={exportProductos} />
          </div>
          {products.length === 0 ? (
            <div style={{ textAlign:'center', fontSize:13, color:'#9CA3AF', padding:'30px 0' }}>No hay productos vendidos en este período.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {products.map(p=>(
                <div key={p.nombre} style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ flex:2, minWidth:140 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'#111827' }}>{p.nombre}</div>
                  </div>
                  <div style={{ flex:3 }}>
                    <div style={{ flex:1, height:8, backgroundColor:'#F3F4F6', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${(p.unidades/maxProd)*100}%`, backgroundColor:'#1D9E75', borderRadius:99 }} />
                    </div>
                  </div>
                  <div style={{ minWidth:60, textAlign:'right', fontSize:13, fontWeight:600, color:'#374151' }}>{p.unidades} uds</div>
                  <div style={{ minWidth:100, textAlign:'right', fontSize:13, color:'#374151' }}>{money(p.monto)}</div>
                  <div style={{ minWidth:50, textAlign:'right', fontSize:12, color:'#9CA3AF' }}>{p.pct}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'mozos' && (
        <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'flex-end', padding:'12px 16px', borderBottom:'0.5px solid rgba(0,0,0,0.06)' }}>
            <BtnExport onClick={exportMozos} />
          </div>
          {MOZOS_DATA.length === 0 ? (
            <div style={{ textAlign:'center', fontSize:13, color:'#9CA3AF', padding:'30px 0' }}>No hay datos de mozos en este período.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead style={{ backgroundColor:'#F9FAFB' }}>
                <tr>{['Mozo','Mesas atendidas','Total facturado','Ticket promedio','% del total'].map(h=><Col key={h}>{h}</Col>)}</tr>
              </thead>
              <tbody>
                {MOZOS_DATA.map(m=>(
                  <tr key={m.mozo} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                    <Cell style={{ fontWeight:500, color:'#111827' }}>{m.mozo}</Cell>
                    <Cell>{m.mesas}</Cell>
                    <Cell style={{ fontWeight:600, color:'#1D9E75' }}>{money(m.total)}</Cell>
                    <Cell>{money(m.ticket)}</Cell>
                    <Cell>{m.pct}%</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'reservas' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <BtnExport onClick={exportReservas} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
            {[
              { label:'Total reservas',   value:RESERVAS_DATA.total,       color:'#111827', sub:null },
              { label:'Confirmadas',      value:RESERVAS_DATA.confirmadas,  color:'#1D9E75', sub:RESERVAS_DATA.total>0?`${Math.round(RESERVAS_DATA.confirmadas/RESERVAS_DATA.total*100)}%`:null },
              { label:'Canceladas',       value:RESERVAS_DATA.canceladas,   color:'#EF4444', sub:RESERVAS_DATA.total>0?`${Math.round(RESERVAS_DATA.canceladas/RESERVAS_DATA.total*100)}%`:null },
              { label:'No-shows',         value:RESERVAS_DATA.noShows,      color:'#CA8A04', sub:RESERVAS_DATA.total>0?`${Math.round(RESERVAS_DATA.noShows/RESERVAS_DATA.total*100)}%`:null },
              { label:'Reservas online',  value:RESERVAS_DATA.online,       color:'#3B82F6', sub:RESERVAS_DATA.total>0?`${Math.round(RESERVAS_DATA.online/RESERVAS_DATA.total*100)}% del total`:null },
            ].map(k=>(
              <div key={k.label} style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:18 }}>
                <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.5px', color:'#9CA3AF', marginBottom:8 }}>{k.label}</div>
                <div style={{ fontSize:32, fontWeight:700, color:k.color, lineHeight:1 }}>{k.value}</div>
                {k.sub && <div style={{ fontSize:12, color:'#6B7280', marginTop:6 }}>{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


