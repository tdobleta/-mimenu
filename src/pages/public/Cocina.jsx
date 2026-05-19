import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function updateCocinaEstado(turnId, branchId, updates) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cocina-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ turn_id: turnId, branch_id: branchId, ...updates }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Error actualizando cocina');
  return data;
}

const COLORS = {
  nueva:      { bg:'#FFFFFF', border:'#1D9E75', borderWidth:2,   headerBg:'#F0FBF7', headerText:'#111827', timerColor:'#1D9E75', pulse:true  },
  preparando: { bg:'#F0FBF7', border:'#1D9E75', borderWidth:1.5, headerBg:'#1D9E75', headerText:'white',   timerColor:'white',   pulse:false },
  lista:      { bg:'#FEF2F2', border:'#EF4444', borderWidth:1.5, headerBg:'#EF4444', headerText:'white',   timerColor:'white',   pulse:false },
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

export default function Cocina() {
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get('branch');
  const [comandas, setComandas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [, setTick] = useState(0);
  const removalTimers = useRef({});

  async function loadCocina() {
    try {
      if (!branchId) { setLoading(false); return; }
      const turns = await base44.entities.Turn.filter({ status: 'abierta', enviado_cocina: true, branch_id: branchId }, '-opened_at', 50);
      const withItems = await Promise.all((turns || []).map(async (turn) => {
        try {
          const items = await base44.entities.TurnItem.filter({ turn_id: turn.id });
          return { turn, items: items || [] };
        } catch {
          return { turn, items: [] };
        }
      }));
      setComandas(prev => {
        // Preserve local cocina_estado for turns already showing (avoid flicker during poll)
        const prevMap = new Map(prev.map(c => [c.turn.id, c.turn.cocina_estado]));
        return withItems.map(c => {
          const prevEstado = prevMap.get(c.turn.id);
          // Only keep local estado if it's more advanced than DB (optimistic update pending write)
          const dbEstado = c.turn.cocina_estado || 'nueva';
          const localOrder = ORDER[prevEstado] ?? -1;
          const dbOrder = ORDER[dbEstado] ?? -1;
          return localOrder > dbOrder
            ? { ...c, turn: { ...c.turn, cocina_estado: prevEstado } }
            : c;
        });
      });
      setLastUpdate(Date.now());
    } catch(err) {
      console.error('Error cargando cocina:', err);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!branchId) return;
    loadCocina();
    const interval = setInterval(loadCocina, 12000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  // Realtime: sync state changes from Salon/ControlCocina immediately
  useEffect(() => {
    if (!branchId) return;
    const channel = supabase
      .channel(`cocina_public_${branchId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'turns',
        filter: `branch_id=eq.${branchId}`,
      }, (payload) => {
        const updated = payload.new;
        setComandas(prev => {
          // Turn became open+enviado_cocina → add it
          if (updated.status === 'abierta' && updated.enviado_cocina) {
            const exists = prev.some(c => c.turn.id === updated.id);
            if (exists) {
              return prev.map(c => c.turn.id === updated.id ? { ...c, turn: { ...c.turn, ...updated } } : c);
            }
            // New comanda arrived — trigger a full reload to get items too
            loadCocina();
            return prev;
          }
          // Turn closed/cancelled → remove it
          if (updated.status !== 'abierta') {
            return prev.filter(c => c.turn.id !== updated.id);
          }
          return prev.map(c => c.turn.id === updated.id ? { ...c, turn: { ...c.turn, ...updated } } : c);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Cleanup removal timers on unmount
  useEffect(() => {
    return () => {
      Object.values(removalTimers.current).forEach(clearTimeout);
      removalTimers.current = {};
    };
  }, []);

  async function cambiarEstado(turnId, nuevoEstado) {
    // Optimistic update on comandas array (not localStorage)
    setComandas(prev => prev.map(c =>
      c.turn.id === turnId ? { ...c, turn: { ...c.turn, cocina_estado: nuevoEstado } } : c
    ));

    try {
      const comanda_lista = nuevoEstado === 'lista';
      await updateCocinaEstado(turnId, branchId, {
        cocina_estado: nuevoEstado,
        comanda_lista,
      });
    } catch(err) {
      console.error('Error actualizando estado cocina:', err);
      // Revert optimistic update on error
      setComandas(prev => prev.map(c =>
        c.turn.id === turnId ? { ...c, turn: { ...c.turn, cocina_estado: c.turn.cocina_estado } } : c
      ));
    }

    if (nuevoEstado === 'lista') {
      if (removalTimers.current[turnId]) clearTimeout(removalTimers.current[turnId]);
      removalTimers.current[turnId] = setTimeout(() => {
        setComandas(prev => prev.filter(c => c.turn.id !== turnId));
        delete removalTimers.current[turnId];
      }, 90000);
    }
  }

  const visibles = [...comandas]
    .sort((a, b) => {
      const ea = ORDER[a.turn.cocina_estado || 'nueva'] ?? 0;
      const eb = ORDER[b.turn.cocina_estado || 'nueva'] ?? 0;
      return ea !== eb ? ea - eb : new Date(a.turn.opened_at).getTime() - new Date(b.turn.opened_at).getTime();
    });

  const segundosDesdeUpdate = lastUpdate ? Math.max(0, Math.floor((Date.now() - lastUpdate) / 1000)) : null;
  const reciente = segundosDesdeUpdate !== null && segundosDesdeUpdate < 15;

  if (!loading && !branchId) {
    return (
      <div style={{ minHeight:'100vh', backgroundColor:'#0D1117', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ color:'rgba(255,255,255,0.4)', fontSize:14, textAlign:'center' }}>
          Link inválido. Usá el link de cocina desde la configuración de mimenú.
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#0D1117', color:'white' }}>
      <style>{`
        @keyframes cocpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes cocspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ position:'sticky', top:0, zIndex:10, backgroundColor:'#0D1117', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ fontSize:22, fontWeight:600, letterSpacing:'-0.3px', color:'white' }}>
            mi<span style={{ color:'#1D9E75' }}>menú</span>
          </span>
          <span style={{ fontSize:14, color:'rgba(255,255,255,0.4)', fontWeight:500 }}>Cocina</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {reciente && <span style={{ width:8, height:8, borderRadius:'50%', backgroundColor:'#1D9E75', animation:'cocpulse 1.5s ease-in-out infinite' }} />}
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>
            {segundosDesdeUpdate === null ? 'Cargando...' : `Actualizado ${segundosDesdeUpdate}s atrás`}
          </span>
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
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16, padding:20 }}>
          {visibles.map(({ turn, items }) => {
            const estado = turn.cocina_estado || 'nueva';
            const c = COLORS[estado] || COLORS.nueva;
            return (
              <div key={turn.id} style={{
                borderRadius:12, overflow:'hidden',
                border:`${c.borderWidth}px solid ${c.border}`,
                backgroundColor:c.bg,
                boxShadow: c.pulse ? '0 0 0 4px rgba(29,158,117,0.15)' : '0 2px 8px rgba(0,0,0,0.12)',
              }}>
                {/* Header */}
                <div style={{ backgroundColor:c.headerBg, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                      <div style={{ fontSize:28, fontWeight:800, color: c.headerText, lineHeight:1 }}>Mesa {turn.mesa_num}</div>
                      {estado === 'nueva' && (
                        <span style={{ backgroundColor:'#1D9E75', color:'white', padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:800, letterSpacing:'0.5px', animation:'cocpulse 1.5s ease-in-out infinite' }}>NUEVA</span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:13, color: estado==='nueva' ? '#9CA3AF' : 'rgba(255,255,255,0.85)' }}>{fmtHora(turn.opened_at)}</div>
                    <div style={{ fontSize:22, fontWeight:700, color:c.timerColor, lineHeight:1.2 }}>{fmtElapsed(turn.opened_at)}</div>
                  </div>
                </div>

                {/* Items */}
                <div style={{ padding:'12px 16px' }}>
                  {items.length === 0 ? (
                    <div style={{ fontSize:13, color:'#9CA3AF', padding:'8px 0', textAlign:'center' }}>Sin ítems</div>
                  ) : items.map(item => (
                    <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'0.5px solid rgba(0,0,0,0.06)', gap:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', minWidth:0 }}>
                        <span style={{ fontSize:15, fontWeight:500, color:'#111827' }}>{item.menu_item_name || 'Ítem'}</span>
                        {(item.menu_item_id == null || (typeof item.menu_item_id === 'string' && item.menu_item_id.startsWith('libre_'))) && (
                          <span style={{ backgroundColor:'#FFEDD5', color:'#F97316', padding:'1px 6px', borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:'0.3px' }}>LIBRE</span>
                        )}
                      </div>
                      <span style={{ fontSize:20, fontWeight:800, color:'#111827', flexShrink:0 }}>×{item.cantidad || 1}</span>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div style={{ padding:'12px 16px', borderTop:'0.5px solid rgba(0,0,0,0.08)', display:'flex', gap:8 }}>
                  {estado === 'nueva' && (
                    <button onClick={()=>cambiarEstado(turn.id, 'preparando')}
                      style={{ width:'100%', padding:10, border:'none', borderRadius:8, backgroundColor:'#1D9E75', color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                      Tomar pedido
                    </button>
                  )}
                  {estado === 'preparando' && (
                    <button onClick={()=>cambiarEstado(turn.id, 'lista')}
                      style={{ width:'100%', padding:10, border:'none', borderRadius:8, backgroundColor:'#EF4444', color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                      Marcar como lista
                    </button>
                  )}
                  {estado === 'lista' && (
                    <div style={{ width:'100%', padding:10, borderRadius:8, backgroundColor:'rgba(29,158,117,0.1)', color:'#1D9E75', fontSize:13, fontWeight:600, textAlign:'center' }}>
                      ✓ Lista para servir
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

