import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const COLORS = {
  nueva:      { bg:'#FFFFFF', border:'#1D9E75', borderWidth:2,   headerBg:'#F0FBF7', headerText:'#111827', timerColor:'#1D9E75', pulse:true  },
  preparando: { bg:'#F0FBF7', border:'#1D9E75', borderWidth:1.5, headerBg:'#1D9E75', headerText:'white',   timerColor:'white',   pulse:false },
  lista:      { bg:'#FEF2F2', border:'#EF4444', borderWidth:1.5, headerBg:'#EF4444', headerText:'white',   timerColor:'white',   pulse:false },
};

const ORDER = { nueva:0, preparando:1, lista:2 };

function tokenKey(branchId) {
  return `mimenu_cocina_device_token_${branchId || 'default'}`;
}

function isValidDeviceToken(token) {
  return typeof token === 'string' && token.length === 64 && /^[0-9a-f]+$/.test(token);
}

function fmtElapsed(openedAt) {
  const ms = typeof openedAt === 'string' ? new Date(openedAt).getTime() : openedAt;
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtHora(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function callKitchenFunction(functionName, deviceToken, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${deviceToken}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || 'Error de comunicacion con cocina');
  return json;
}

export default function Cocina() {
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get('branch');
  const urlToken = searchParams.get('token');
  const [deviceToken, setDeviceToken] = useState('');
  const [comandas, setComandas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState({});
  const removalTimers = useRef({});

  useEffect(() => {
    if (!branchId) return;
    if (isValidDeviceToken(urlToken)) {
      localStorage.setItem(tokenKey(branchId), urlToken);
      setDeviceToken(urlToken);
      const clean = new URL(window.location.href);
      clean.searchParams.delete('token');
      window.history.replaceState(null, '', clean.toString());
      return;
    }
    const stored = localStorage.getItem(tokenKey(branchId)) || '';
    setDeviceToken(isValidDeviceToken(stored) ? stored : '');
  }, [branchId, urlToken]);

  const loadCocina = useCallback(async () => {
    if (!branchId) {
      setLoading(false);
      setAuthError('Link invalido: falta sucursal.');
      return;
    }
    if (!deviceToken) {
      setLoading(false);
      setAuthError('Este monitor no tiene token de dispositivo. Genera una URL en Configuracion -> Cocina.');
      return;
    }

    try {
      const data = await callKitchenFunction('cocina-feed', deviceToken, { branch_id: branchId });
      const withItems = data.comandas || [];
      setComandas(prev => {
        const prevMap = new Map(prev.map(c => [c.turn.id, c.turn.cocina_estado]));
        return withItems.map(c => {
          const prevEstado = prevMap.get(c.turn.id);
          const dbEstado = c.turn.cocina_estado || 'nueva';
          const localOrder = ORDER[prevEstado] ?? -1;
          const dbOrder = ORDER[dbEstado] ?? -1;
          return localOrder > dbOrder
            ? { ...c, turn: { ...c.turn, cocina_estado: prevEstado } }
            : c;
        });
      });
      setLastUpdate(Date.now());
      setAuthError('');
    } catch (err) {
      setAuthError(err.message || 'No se pudo cargar cocina.');
    } finally {
      setLoading(false);
    }
  }, [branchId, deviceToken]);

  useEffect(() => {
    loadCocina();
    if (!branchId || !deviceToken) return undefined;
    const interval = setInterval(loadCocina, 12000);
    return () => clearInterval(interval);
  }, [branchId, deviceToken, loadCocina]);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(removalTimers.current).forEach(clearTimeout);
      removalTimers.current = {};
    };
  }, []);

  function toggleExpanded(turnId) {
    setExpanded(prev => ({ ...prev, [turnId]: !prev[turnId] }));
  }

  async function cambiarEstado(turnId, nuevoEstado) {
    const estadoAnterior = comandas.find(c => c.turn.id === turnId)?.turn?.cocina_estado || 'nueva';
    setComandas(prev => prev.map(c =>
      c.turn.id === turnId ? { ...c, turn: { ...c.turn, cocina_estado: nuevoEstado } } : c
    ));

    try {
      await callKitchenFunction('cocina-update', deviceToken, {
        turn_id: turnId,
        branch_id: branchId,
        cocina_estado: nuevoEstado,
        comanda_lista: nuevoEstado === 'lista',
      });
    } catch (err) {
      setAuthError(err.message || 'No se pudo actualizar cocina.');
      setComandas(prev => prev.map(c =>
        c.turn.id === turnId ? { ...c, turn: { ...c.turn, cocina_estado: estadoAnterior } } : c
      ));
      return;
    }

    if (nuevoEstado === 'lista') {
      if (removalTimers.current[turnId]) clearTimeout(removalTimers.current[turnId]);
      removalTimers.current[turnId] = setTimeout(() => {
        setComandas(prev => prev.filter(c => c.turn.id !== turnId));
        delete removalTimers.current[turnId];
      }, 90000);
    }
  }

  const visibles = [...comandas].sort((a, b) => {
    const ea = ORDER[a.turn.cocina_estado || 'nueva'] ?? 0;
    const eb = ORDER[b.turn.cocina_estado || 'nueva'] ?? 0;
    return ea !== eb ? ea - eb : new Date(a.turn.opened_at).getTime() - new Date(b.turn.opened_at).getTime();
  });

  const segundosDesdeUpdate = lastUpdate ? Math.max(0, Math.floor((Date.now() - lastUpdate) / 1000)) : null;
  const reciente = segundosDesdeUpdate !== null && segundosDesdeUpdate < 15;

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#0D1117', color:'white' }}>
      <style>{`
        @keyframes cocpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes cocspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ position:'sticky', top:0, zIndex:10, backgroundColor:'#0D1117', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ fontSize:22, fontWeight:600, letterSpacing:'-0.3px', color:'white' }}>
            mi<span style={{ color:'#1D9E75' }}>menu</span>
          </span>
          <span style={{ fontSize:14, color:'rgba(255,255,255,0.4)', fontWeight:500 }}>Cocina</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {reciente && <span style={{ width:8, height:8, borderRadius:'50%', backgroundColor:'#1D9E75', animation:'cocpulse 1.5s ease-in-out infinite' }} />}
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>
            {segundosDesdeUpdate === null ? 'Cargando...' : `Actualizado ${segundosDesdeUpdate}s atras`}
          </span>
        </div>
      </div>

      {authError && (
        <div style={{ margin:20, background:'#7F1D1D', border:'1px solid #EF4444', color:'#FEE2E2', borderRadius:10, padding:'14px 16px', fontSize:14, fontWeight:600 }}>
          {authError}
        </div>
      )}

      {loading && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60 }}>
          <div style={{ width:32, height:32, border:'3px solid rgba(255,255,255,0.1)', borderTop:'3px solid #1D9E75', borderRadius:'50%', animation:'cocspin 0.8s linear infinite' }} />
        </div>
      )}

      {!loading && !authError && visibles.length === 0 && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'80px 20px', textAlign:'center' }}>
          <div style={{ width:80, height:80, borderRadius:'50%', backgroundColor:'rgba(29,158,117,0.1)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize:20, color:'white', fontWeight:600, marginBottom:6 }}>Sin comandas activas</div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)' }}>Las comandas apareceran cuando los mozos las envien</div>
        </div>
      )}

      {!loading && !authError && visibles.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16, padding:20 }}>
          {visibles.map(({ turn, items }) => {
            const estado = turn.cocina_estado || 'nueva';
            const c = COLORS[estado] || COLORS.nueva;
            const tieneNotas = items.some(it => it.notas && it.notas.trim() !== '');
            const isOpen = !!expanded[turn.id];
            return (
              <div key={turn.id} style={{
                borderRadius:12,
                overflow:'hidden',
                border:`${c.borderWidth}px solid ${c.border}`,
                backgroundColor:c.bg,
                boxShadow: c.pulse ? '0 0 0 4px rgba(29,158,117,0.15)' : '0 2px 8px rgba(0,0,0,0.12)',
              }}>
                <div
                  onClick={() => tieneNotas && toggleExpanded(turn.id)}
                  style={{ backgroundColor:c.headerBg, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, cursor: tieneNotas ? 'pointer' : 'default', userSelect:'none' }}
                >
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                      <div style={{ fontSize:28, fontWeight:800, color: c.headerText, lineHeight:1 }}>Mesa {turn.mesa_num}</div>
                      {estado === 'nueva' && (
                        <span style={{ backgroundColor:'#1D9E75', color:'white', padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:800, letterSpacing:'0.5px', animation:'cocpulse 1.5s ease-in-out infinite' }}>NUEVA</span>
                      )}
                    </div>
                    {turn.mozo && <div style={{ fontSize:12, color: estado === 'nueva' ? '#6B7280' : 'rgba(255,255,255,0.72)' }}>Mozo: {turn.mozo}</div>}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:13, color: estado === 'nueva' ? '#9CA3AF' : 'rgba(255,255,255,0.85)' }}>{fmtHora(turn.opened_at)}</div>
                      <div style={{ fontSize:22, fontWeight:700, color:c.timerColor, lineHeight:1.2 }}>{fmtElapsed(turn.opened_at)}</div>
                    </div>
                    {tieneNotas && (
                      <span style={{ fontSize:20, color: c.headerText === 'white' ? 'rgba(255,255,255,0.75)' : '#6B7280', lineHeight:1, display:'inline-block', transition:'transform .2s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>v</span>
                    )}
                  </div>
                </div>

                <div style={{ padding:'12px 16px' }}>
                  {items.length === 0 ? (
                    <div style={{ fontSize:13, color:'#9CA3AF', padding:'8px 0', textAlign:'center' }}>Sin items</div>
                  ) : items.map(item => (
                    <div key={item.id}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom: (!isOpen || !item.notas || item.notas.trim() === '') ? '0.5px solid rgba(0,0,0,0.06)' : 'none', gap:10 }}>
                        <span style={{ fontSize:15, fontWeight:500, color:'#111827' }}>{item.menu_item_name || 'Item'}</span>
                        <span style={{ fontSize:20, fontWeight:800, color:'#111827', flexShrink:0 }}>x{item.cantidad || 1}</span>
                      </div>
                      {isOpen && item.notas && item.notas.trim() !== '' && (
                        <div style={{ fontSize:12, color:'#92600A', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:6, padding:'4px 8px', margin:'2px 0 6px 0', lineHeight:1.4 }}>
                          Nota: {item.notas.trim()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ padding:'12px 16px', borderTop:'0.5px solid rgba(0,0,0,0.08)', display:'flex', gap:8 }}>
                  {estado === 'nueva' && (
                    <button onClick={() => cambiarEstado(turn.id, 'preparando')}
                      style={{ width:'100%', padding:10, border:'none', borderRadius:8, backgroundColor:'#1D9E75', color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                      Tomar pedido
                    </button>
                  )}
                  {estado === 'preparando' && (
                    <button onClick={() => cambiarEstado(turn.id, 'lista')}
                      style={{ width:'100%', padding:10, border:'none', borderRadius:8, backgroundColor:'#EF4444', color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                      Marcar como lista
                    </button>
                  )}
                  {estado === 'lista' && (
                    <div style={{ width:'100%', padding:10, borderRadius:8, backgroundColor:'rgba(29,158,117,0.1)', color:'#1D9E75', fontSize:13, fontWeight:600, textAlign:'center' }}>
                      Lista para servir
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
