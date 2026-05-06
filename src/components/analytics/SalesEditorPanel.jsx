import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { money } from '@/lib/fmt';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';

const PAGE_SIZE = 20;

function fmtDate(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function SalesEditorPanel({ isOpen, onClose }) {
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [itemsCounts, setItemsCounts] = useState({}); // turnId -> number | 'loading'
  const [detail, setDetail] = useState(null); // {turn, items}
  const [delConfirm, setDelConfirm] = useState(null);
  const [anulConfirm, setAnulConfirm] = useState(null);
  const [anulMotivo, setAnulMotivo] = useState('Error en el pedido');

  useEffect(() => {
    if (!isOpen) return;
    loadTurns();
  // eslint-disable-next-line
  }, [isOpen, store.branchId]);

  async function loadTurns() {
    setLoading(true);
    try {
      const branchIds = (store.sucursales || []).map(b => b.id);
      const targetBranch = store.branchId && store.branchId !== 'todas' ? store.branchId : null;
      const [cerradas, anuladas] = await Promise.all([
        targetBranch
          ? base44.entities.Turn.filter({ status: 'cerrada', branch_id: targetBranch }, '-closed_at', 500)
          : Promise.all(branchIds.map(bid => base44.entities.Turn.filter({ status: 'cerrada', branch_id: bid }, '-closed_at', 500).catch(() => []))).then(r => r.flat()),
        targetBranch
          ? base44.entities.Turn.filter({ status: 'anulada', branch_id: targetBranch }, '-closed_at', 500).catch(() => [])
          : Promise.all(branchIds.map(bid => base44.entities.Turn.filter({ status: 'anulada', branch_id: bid }, '-closed_at', 500).catch(() => []))).then(r => r.flat()),
      ]);
      let combined = [...(cerradas||[]), ...(anuladas||[])];
      if (!targetBranch) combined = combined.filter(t => branchIds.includes(t.branch_id));
      combined.sort((a,b) => (b.closed_at||0) - (a.closed_at||0));
      setTurns(combined);
    } catch(err) {
      setTurns([]);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return turns;
    const q = search.toLowerCase();
    return turns.filter(t => {
      const fecha = t.closed_at ? fmtDate(t.closed_at) : '';
      return String(t.mesa_num||'').includes(q) || (t.mozo||'').toLowerCase().includes(q) || fecha.includes(q);
    });
  }, [turns, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageTurns = filtered.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);
  const totalPeriodo = filtered.reduce((a,t) => t.status !== 'anulada' ? a + (t.total_facturado||0) : a, 0);

  async function anularTurn(turn, motivo) {
    try {
      await base44.entities.Turn.update(turn.id, { status: 'anulada', motivo_anulacion: motivo, anulado_at: Date.now() });
      setTurns(prev => prev.map(t => t.id === turn.id ? { ...t, status: 'anulada', motivo_anulacion: motivo } : t));
      if (store.refreshCharts) store.refreshCharts();
      store.logAccion({
        usuario: user?.email || 'Sistema',
        rol: userRole,
        categoria: 'Analíticas',
        accion: 'Venta anulada',
        detalle: 'Mesa ' + turn.mesa_num + ' · ' + money(turn.total_facturado||0) + ' · Motivo: ' + motivo,
        sucursal: store.sucursales.find(s => s.id === store.branchId)?.nombre || '',
      });
      addToast('Venta anulada', 'success');
      setAnulConfirm(null);
    } catch(err) {
      addToast('Error al anular venta', 'error');
    }
  }

  // Load item counts for visible turns
  useEffect(() => {
    pageTurns.forEach(t => {
      if (itemsCounts[t.id] === undefined) {
        setItemsCounts(prev => ({ ...prev, [t.id]: 'loading' }));
        base44.entities.TurnItem.filter({ turn_id: t.id })
          .then(items => setItemsCounts(prev => ({ ...prev, [t.id]: (items||[]).length })))
          .catch(() => setItemsCounts(prev => ({ ...prev, [t.id]: 0 })));
      }
    });
  // eslint-disable-next-line
  }, [pageTurns]);

  async function openDetail(turn) {
    setDetail({ turn, items: null });
    try {
      const items = await base44.entities.TurnItem.filter({ turn_id: turn.id });
      setDetail({ turn, items: items || [] });
    } catch {
      setDetail({ turn, items: [] });
    }
  }

  async function deleteTurn(turn) {
    try {
      const items = await base44.entities.TurnItem.filter({ turn_id: turn.id });
      await Promise.all((items||[]).map(it => base44.entities.TurnItem.delete(it.id)));
      await base44.entities.Turn.delete(turn.id);
      setTurns(prev => prev.filter(t => t.id !== turn.id));
      setDelConfirm(null);
      if (store.refreshCharts) store.refreshCharts();
      store.logAccion({
        usuario: user?.email || 'Sistema',
        rol: userRole,
        categoria: 'Analíticas',
        accion: 'Venta eliminada',
        detalle: 'Mesa ' + turn.mesa_num + ' · ' + money(turn.total_facturado||0),
        sucursal: store.sucursales.find(s => s.id === store.branchId)?.nombre || '',
      });
      addToast('Venta eliminada', 'success');
    } catch(err) {
      addToast('Error al eliminar venta', 'error');
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.4)', zIndex:199 }} onClick={onClose} />
      <div style={{ position:'fixed', top:0, right:0, height:'100vh', width:520, maxWidth:'100vw', backgroundColor:'white', borderLeft:'0.5px solid rgba(0,0,0,0.08)', zIndex:200, display:'flex', flexDirection:'column', boxShadow:'-4px 0 16px rgba(0,0,0,0.06)' }}>
        {/* Header */}
        <div style={{ padding:'14px 20px', borderBottom:'0.5px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:600, color:'#111827' }}>Ventas registradas</div>
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{filtered.length} venta{filtered.length!==1?'s':''}</div>
          </div>
          <button onClick={onClose} style={{ color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ padding:'10px 20px', borderBottom:'0.5px solid rgba(0,0,0,0.06)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <input
            value={search}
            onChange={e=>{ setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por mesa, mozo o fecha..."
            style={{ flex:1, padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:12 }}
          />
          <span style={{ padding:'4px 10px', backgroundColor:'#E8F7F2', color:'#1D9E75', borderRadius:99, fontSize:12, fontWeight:600, whiteSpace:'nowrap' }}>{money(totalPeriodo)}</span>
        </div>

        {/* Table */}
        <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
          {loading ? (
            <div style={{ padding:'40px 20px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>Cargando...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:'40px 20px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>No hay ventas registradas</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead style={{ position:'sticky', top:0, backgroundColor:'#F9FAFB', zIndex:1 }}>
                <tr>
                  {[['Fecha',90],['Hora',60],['Mesa',60],['Mozo',100],['Ítems',55],['Total',90],['Método',90],['',70]].map(([h,w])=>(
                    <th key={h} style={{ width:w, padding:'8px 10px', fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'0.5px solid rgba(0,0,0,0.08)', textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageTurns.map(t => {
                  const ic = itemsCounts[t.id];
                  const anulada = t.status === 'anulada';
                  const rowOpacity = anulada ? 0.5 : 1;
                  return (
                    <tr key={t.id} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.04)', opacity: rowOpacity }}>
                      <td style={{ padding:'8px 10px', color:'#374151', whiteSpace:'nowrap' }}>{t.closed_at?fmtDate(t.closed_at):'-'}</td>
                      <td style={{ padding:'8px 10px', color:'#6B7280' }}>{t.closed_at?fmtTime(t.closed_at):'-'}</td>
                      <td style={{ padding:'8px 10px', fontWeight:600, color:'#111827', textDecoration: anulada?'line-through':'none' }}>{t.mesa_num||'-'}</td>
                      <td style={{ padding:'8px 10px', color:'#374151', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:100 }}>{t.mozo||'-'}</td>
                      <td style={{ padding:'8px 10px', color:'#6B7280' }}>{ic === 'loading' || ic === undefined ? '...' : `${ic} íts`}</td>
                      <td style={{ padding:'8px 10px', fontWeight:600, color:'#1D9E75' }}>{money(t.total_facturado||0)}</td>
                      <td style={{ padding:'8px 10px', color:'#6B7280', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:90 }}>{t.metodo_pago||'-'}</td>
                      <td style={{ padding:'8px 10px' }}>
                        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                          <button onClick={()=>openDetail(t)} title="Ver detalle"
                            style={{ width:24, height:24, border:'none', backgroundColor:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:4, color:'#1D9E75' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          {anulada ? (
                            <button onClick={()=>setDelConfirm(t)} title="Eliminar definitivamente"
                              style={{ width:24, height:24, border:'none', backgroundColor:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:4, color:'#EF4444' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                            </button>
                          ) : (
                            <button onClick={()=>{ setAnulConfirm(t); setAnulMotivo('Error en el pedido'); }} title="Anular venta"
                              style={{ width:24, height:24, border:'none', backgroundColor:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:4, color:'#F97316' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            </button>
                          )}
                          {anulada && (
                            <span style={{ backgroundColor:'#FFEDD5', color:'#F97316', padding:'1px 7px', borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:'0.3px', marginLeft:2 }}>Anulada</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding:'10px 20px', borderTop:'0.5px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', gap:10, flexShrink:0 }}>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={currentPage<=1}
              style={{ width:28, height:28, border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, backgroundColor:'white', cursor:currentPage>1?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', opacity:currentPage>1?1:0.4 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{ fontSize:12, color:'#6B7280' }}>{currentPage} / {totalPages}</span>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={currentPage>=totalPages}
              style={{ width:28, height:28, border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, backgroundColor:'white', cursor:currentPage<totalPages?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', opacity:currentPage<totalPages?1:0.4 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && <DetailModal detail={detail} onClose={()=>setDetail(null)} />}

      {/* Delete confirm Modal (eliminación definitiva) */}
      {delConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.5)' }} onClick={()=>setDelConfirm(null)}>
          <div style={{ backgroundColor:'white', borderRadius:12, width:380, padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:600, color:'#111827', marginBottom:10 }}>Eliminar venta del historial</div>
            <div style={{ backgroundColor:'#F9FAFB', borderRadius:8, padding:12, marginBottom:10, fontSize:12, color:'#374151', display:'flex', flexDirection:'column', gap:4 }}>
              <div>Mesa <strong>{delConfirm.mesa_num}</strong></div>
              <div>{delConfirm.closed_at ? `${fmtDate(delConfirm.closed_at)} ${fmtTime(delConfirm.closed_at)}` : '-'}</div>
              <div style={{ color:'#1D9E75', fontWeight:600 }}>{money(delConfirm.total_facturado||0)}</div>
            </div>
            <div style={{ fontSize:12, color:'#EF4444', marginBottom:14, lineHeight:'17px' }}>Esta acción elimina el registro permanentemente. No se puede deshacer.</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setDelConfirm(null)} style={{ flex:1, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, cursor:'pointer', backgroundColor:'white' }}>Cancelar</button>
              <button onClick={()=>deleteTurn(delConfirm)} style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#EF4444', cursor:'pointer' }}>Eliminar venta</button>
            </div>
          </div>
        </div>
      )}

      {/* Anular venta Modal */}
      {anulConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.5)' }} onClick={()=>setAnulConfirm(null)}>
          <div style={{ backgroundColor:'white', borderRadius:12, width:360, padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:700, color:'#111827', marginBottom:12 }}>¿Anular esta venta?</div>
            <div style={{ backgroundColor:'#F9FAFB', borderRadius:8, padding:12, marginBottom:12, fontSize:12, color:'#374151', display:'flex', flexDirection:'column', gap:4 }}>
              <div>Mesa <strong>{anulConfirm.mesa_num}</strong></div>
              <div>{anulConfirm.closed_at ? `${fmtDate(anulConfirm.closed_at)} ${fmtTime(anulConfirm.closed_at)}` : '-'}</div>
              <div style={{ color:'#1D9E75', fontWeight:600 }}>{money(anulConfirm.total_facturado||0)}</div>
            </div>
            <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>Motivo</div>
            <select value={anulMotivo} onChange={e=>setAnulMotivo(e.target.value)}
              style={{ width:'100%', padding:'8px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, backgroundColor:'white', marginBottom:14, boxSizing:'border-box' }}>
              <option>Error en el pedido</option>
              <option>Cambio de método de pago</option>
              <option>Ítem incorrecto</option>
              <option>Otro</option>
            </select>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setAnulConfirm(null)} style={{ flex:1, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, cursor:'pointer', backgroundColor:'white' }}>Cancelar</button>
              <button onClick={()=>anularTurn(anulConfirm, anulMotivo)} style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#F97316', cursor:'pointer' }}>Anular venta</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailModal({ detail, onClose }) {
  const { turn, items } = detail;
  const subtotal = (items||[]).reduce((a,it) => a + (it.cantidad||0)*(it.precio||0), 0);
  const descuento = Math.max(0, subtotal - (turn.total_facturado||0));

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div style={{ backgroundColor:'white', borderRadius:12, width:520, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', padding:24 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:600, color:'#111827' }}>Detalle de venta — Mesa {turn.mesa_num}</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>{turn.closed_at ? `${fmtDate(turn.closed_at)} ${fmtTime(turn.closed_at)}` : '-'}</div>
          </div>
          <button onClick={onClose} style={{ color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {items === null ? (
          <div style={{ padding:'30px 0', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>Cargando...</div>
        ) : items.length === 0 ? (
          <div style={{ padding:'30px 0', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>Sin ítems registrados</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, marginBottom:12 }}>
            <thead style={{ backgroundColor:'#F9FAFB' }}>
              <tr>
                {['Ítem','Cantidad','Precio unit','Subtotal'].map(h=>(
                  <th key={h} style={{ padding:'8px 10px', fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', textAlign:'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding:'8px 10px', color:'#111827' }}>{it.menu_item_name||'-'}</td>
                  <td style={{ padding:'8px 10px', color:'#374151' }}>{it.cantidad||0}</td>
                  <td style={{ padding:'8px 10px', color:'#374151' }}>{money(it.precio||0)}</td>
                  <td style={{ padding:'8px 10px', color:'#374151', fontWeight:500 }}>{money((it.cantidad||0)*(it.precio||0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ borderTop:'0.5px solid rgba(0,0,0,0.08)', paddingTop:10, display:'flex', flexDirection:'column', gap:5 }}>
          {descuento > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#EF4444' }}>
              <span>Descuento</span><span>−{money(descuento)}</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, color:'#1D9E75' }}>
            <span>Total</span><span>{money(turn.total_facturado||0)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#6B7280', marginTop:6 }}>
            <span>Método de pago</span><span>{turn.metodo_pago||'-'}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#6B7280' }}>
            <span>Mozo</span><span>{turn.mozo||'-'}</span>
          </div>
        </div>

        <button onClick={onClose} style={{ width:'100%', marginTop:16, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, cursor:'pointer', backgroundColor:'white' }}>Cerrar</button>
      </div>
    </div>
  );
}


