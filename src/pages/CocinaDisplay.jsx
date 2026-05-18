import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useStore } from '@/lib/store';

const COLORS = {
  nueva:      { bg:'#FFFFFF', border:'#1D9E75', borderWidth:2,   headerBg:'#F0FBF7', headerText:'#111827', timerColor:'#1D9E75', pulse:true  },
  preparando: { bg:'#F0FBF7', border:'#1D9E75', borderWidth:1.5, headerBg:'#1D9E75', headerText:'white',   timerColor:'white',   pulse:false },
  lista:      { bg:'#F0FDF4', border:'#22C55E', borderWidth:2,   headerBg:'#22C55E', headerText:'white',   timerColor:'white',   pulse:false },
};
const ORDER = { nueva:0, preparando:1, lista:2 };

function fmtElapsed(openedAt) {
  const ms = typeof openedAt === 'string' ? new Date(openedAt).getTime() : openedAt;
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins/60)}h ${mins%60}m`;
}
function fmtHora(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function CocinaDisplay() {
  const { user } = useAuth();
  const { restaurante, branchId, sucursales } = useStore();
  const activeBranchId = branchId !== 'todas' ? branchId : sucursales[0]?.id;
  const [comandas, setComandas] = useState([]);
  const [itemsListos, setItemsListos] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [, setTick] = useState(0);
  const removalTimers = useRef({});

  const loadCocina = useCallback(async () => {
    if (!activeBranchId) return;
    try {
      const turns = await base44.entities.Turn.filter(
        { status:'abierta', enviado_cocina:true, branch_id:activeBranchId }, '-opened_at', 50
      );
      const withItems = await Promise.all((turns||[]).map(async turn => {
        try {
          const items = await base44.entities.TurnItem.filter({ turn_id:turn.id });
          return { turn, items:items||[] };
        } catch { return { turn, items:[] }; }
      }));
      setComandas(withItems);
      setLastUpdate(Date.now());
    } catch(err) { console.error('Error cargando cocina:', err); }
    setLoading(false);
  }, [activeBranchId]);

  useEffect(() => {
    if (!activeBranchId) return;
    loadCocina();
    const interval = setInterval(loadCocina, 12000);
    return () => clearInterval(interval);
  }, [activeBranchId, loadCocina]);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x+1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Marcar ítem individual ────────────────────────────────────────────────
  function toggleItem(turnId, itemId, totalItems, estadoActual) {
    setItemsListos(prev => {
      const set = new Set(prev[turnId] || []);
      if (set.has(itemId)) set.delete(itemId);
      else set.add(itemId);
      const next = { ...prev, [turnId]: set };
      if (set.size === totalItems && estadoActual === 'preparando') {
        setTimeout(() => cambiarEstado(turnId, 'lista'), 300);
      }
      return next;
    });
  }

  // ── Cambiar estado — persiste en Supabase ─────────────────────────────────
  async function cambiarEstado(turnId, nuevoEstado) {
    // Optimistic update — actualiza UI inmediatamente
    setComandas(prev => prev.map(c =>
      c.turn.id === turnId
        ? { ...c, turn: { ...c.turn, cocina_estado: nuevoEstado } }
        : c
    ));

    try {
      // Persiste en Supabase — no en localStorage
      await supabase
        .from('turns')
        .update({ cocina_estado: nuevoEstado })
        .eq('id', turnId);

      if (nuevoEstado === 'lista') {
        // Notifica al salón via realtime
        await supabase
          .from('turns')
          .update({ comanda_lista: true })
          .eq('id', turnId);

        // Remover la comanda después de 90s
        if (removalTimers.current[turnId]) clearTimeout(removalTimers.current[turnId]);
        removalTimers.current[turnId] = setTimeout(() => {
          setComandas(prev => prev.filter(c => c.turn.id !== turnId));
          setItemsListos(prev => { const n={...prev}; delete n[turnId]; return n; });
          delete removalTimers.current[turnId];
        }, 90000);
      } else if (nuevoEstado === 'preparando' || nuevoEstado === 'nueva') {
        await supabase
          .from('turns')
          .update({ comanda_lista: false })
          .eq('id', turnId);
      }
    } catch(err) {
      console.error('Error cambiando estado cocina:', err);
      // Revert optimistic update si falla
      loadCocina();
    }
  }

  const visibles = comandas
    .map(c => ({ ...c, estado: c.turn.cocina_estado || 'nueva' }))
    .sort((a,b) => (ORDER[a.estado]-ORDER[b.estado]) || (new Date(a.turn.opened_at).getTime()-new Date(b.turn.opened_at).getTime()));

  const segundosDesdeUpdate = lastUpdate ? Math.max(0, Math.floor((Date.now()-lastUpdate)/1000)) : null;

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#0D1117', color:'white' }}>
      <style>{`
        @keyframes cocpulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes cocspin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes itemIn   { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }
        .item-row { animation: itemIn 0.15s ease forwards; }
        .item-check:hover { transform: scale(1.08); }
      `}</style>

      {/* Header */}
      <div style={{ position:'sticky', top:0, zIndex:10, backgroundColor:'#0D1117', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ fontSize:22, fontWeight:600, letterSpacing:'-0.3px', color:'white' }}>
            mi<span style={{ color:'#1D9E75' }}>menú</span>
          </span>
          <span style={{ fontSize:14, color:'rgba(255,255,255,0.5)', fontWeight:500 }}>{restaurante?.nombre||''}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, backgroundColor:'rgba(29,158,117,0.15)', color:'#1D9E75', padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', backgroundColor:'#1D9E75', animation:'cocpulse 1.5s ease-in-out infinite' }} />
          Cocina activa
          {segundosDesdeUpdate !== null && <span style={{ color:'rgba(29,158,117,0.7)', fontWeight:400, fontSize:11 }}>· {segundosDesdeUpdate}s</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{user?.email||''}</span>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.href='/login')}
            style={{ padding:'6px 12px', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:7, fontSize:12, color:'rgba(255,255,255,0.7)', backgroundColor:'transparent', cursor:'pointer' }}>
            Cerrar sesión
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60 }}>
          <div style={{ width:32, height:32, border:'3px solid rgba(255,255,255,0.1)', borderTop:'3px solid #1D9E75', borderRadius:'50%', animation:'cocspin 0.8s linear infinite' }} />
        </div>
      )}

      {!loading && visibles.length === 0 && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'80px 20px', textAlign:'center' }}>
          <div style={{ width:80, height:80, borderRadius:'50%', backgroundColor:'rgba(29,158,117,0.1)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize:20, color:'white', fontWeight:600, marginBottom:6 }}>Sin comandas activas</div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)' }}>Las comandas aparecerán acá cuando los mozos las envíen</div>
        </div>
      )}

      {!loading && visibles.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:16, padding:20 }}>
          {visibles.map(({ turn, items, estado }) => {
            const c = COLORS[estado] || COLORS.nueva;
            const listos = itemsListos[turn.id] || new Set();
            const totalItems = items.length;
            const countListos = listos.size;
            const progreso = totalItems > 0 ? (countListos / totalItems) * 100 : 0;

            return (
              <div key={turn.id} style={{
                borderRadius:14, overflow:'hidden',
                border:`${c.borderWidth}px solid ${c.border}`,
                backgroundColor:c.bg,
                boxShadow: c.pulse ? '0 0 0 4px rgba(29,158,117,0.15)' : estado==='lista' ? '0 4px 20px rgba(34,197,94,0.2)' : '0 2px 8px rgba(0,0,0,0.12)',
                transition:'all 0.3s ease',
              }}>
                <div style={{ backgroundColor:c.headerBg, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                      <div style={{ fontSize:28, fontWeight:800, color:c.headerText, lineHeight:1 }}>Mesa {turn.mesa_num}</div>
                      {estado === 'nueva' && (
                        <span style={{ backgroundColor:'#1D9E75', color:'white', padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:800, letterSpacing:'0.5px', animation:'cocpulse 1.5s ease-in-out infinite' }}>NUEVA</span>
                      )}
                      {estado === 'lista' && (
                        <span style={{ backgroundColor:'rgba(255,255,255,0.25)', color:'white', padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:800 }}>✓ LISTA</span>
                      )}
                    </div>
                    {turn.mozo && <div style={{ fontSize:12, color:estado==='nueva'?'#6B7280':'rgba(255,255,255,0.85)', marginTop:4 }}>{turn.mozo}</div>}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:13, color:estado==='nueva'?'#9CA3AF':'rgba(255,255,255,0.85)' }}>{fmtHora(turn.opened_at)}</div>
                    <div style={{ fontSize:22, fontWeight:700, color:c.timerColor, lineHeight:1.2 }}>{fmtElapsed(turn.opened_at)}</div>
                  </div>
                </div>

                {estado === 'preparando' && totalItems > 0 && (
                  <div style={{ padding:'8px 16px 0' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:11, color:'#6B7280', fontWeight:600 }}>Progreso</span>
                      <span style={{ fontSize:11, color:'#1D9E75', fontWeight:700 }}>{countListos}/{totalItems} listos</span>
                    </div>
                    <div style={{ height:5, background:'rgba(0,0,0,0.07)', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${progreso}%`, background:'linear-gradient(90deg,#1D9E75,#22C55E)', borderRadius:99, transition:'width 0.4s ease' }} />
                    </div>
                  </div>
                )}

                <div style={{ padding:'10px 16px' }}>
                  {items.length === 0 ? (
                    <div style={{ fontSize:13, color:'#9CA3AF', padding:'8px 0', textAlign:'center' }}>Sin ítems</div>
                  ) : items.map(item => {
                    const isListo = listos.has(item.id);
                    const puedeTildar = estado === 'preparando';
                    return (
                      <div key={item.id} className="item-row" style={{
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'8px 0', borderBottom:'0.5px solid rgba(0,0,0,0.06)', gap:10,
                        opacity: isListo ? 0.55 : 1, transition:'opacity 0.2s',
                      }}>
                        <div style={{ display:'flex', alignItems:'center', gap:9, flex:1, minWidth:0 }}>
                          {puedeTildar && (
                            <button
                              className="item-check"
                              onClick={() => toggleItem(turn.id, item.id, totalItems, estado)}
                              style={{
                                width:22, height:22, borderRadius:6, flexShrink:0,
                                border:isListo ? 'none' : '2px solid #D1D5DB',
                                background:isListo ? '#1D9E75' : 'transparent',
                                cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                                transition:'all 0.15s',
                              }}
                            >
                              {isListo && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                            </button>
                          )}
                          <div style={{ minWidth:0 }}>
                            <span style={{ fontSize:14, fontWeight:500, color:'#111827', textDecoration:isListo?'line-through':'none' }}>
                              {item.menu_item_name||'Ítem'}
                            </span>
                            {item.notas && (
                              <div style={{ fontSize:11, color:'#F97316', marginTop:2, fontWeight:500 }}>📝 {item.notas}</div>
                            )}
                          </div>
                        </div>
                        <span style={{ fontSize:20, fontWeight:800, color:'#111827', flexShrink:0 }}>×{item.cantidad||1}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding:'12px 16px', borderTop:'0.5px solid rgba(0,0,0,0.08)', display:'flex', gap:8 }}>
                  {estado === 'nueva' && (
                    <button onClick={() => cambiarEstado(turn.id, 'preparando')}
                      style={{ width:'100%', padding:10, border:'none', borderRadius:9, backgroundColor:'#1D9E75', color:'white', fontSize:14, fontWeight:700, cursor:'pointer', transition:'transform 0.1s' }}
                      onMouseDown={e=>e.currentTarget.style.transform='scale(0.98)'}
                      onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>
                      Tomar pedido
                    </button>
                  )}
                  {estado === 'preparando' && (
                    <button onClick={() => cambiarEstado(turn.id, 'lista')}
                      style={{ width:'100%', padding:10, border:'none', borderRadius:9, backgroundColor:'#22C55E', color:'white', fontSize:14, fontWeight:700, cursor:'pointer', transition:'transform 0.1s' }}
                      onMouseDown={e=>e.currentTarget.style.transform='scale(0.98)'}
                      onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>
                      ✓ Marcar todo listo
                    </button>
                  )}
                  {estado === 'lista' && (
                    <div style={{ width:'100%', padding:10, borderRadius:9, backgroundColor:'rgba(34,197,94,0.10)', color:'#16A34A', fontSize:13, fontWeight:700, textAlign:'center', border:'1px solid rgba(34,197,94,0.25)' }}>
                      ✓ Lista para servir — notificado al salón
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
