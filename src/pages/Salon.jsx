import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import TableCard from '../components/salon/TableCard';
import ComandaPanel from '../components/salon/ComandaPanel';
import LayoutEditor from '../components/salon/LayoutEditor';
import { dbLoadActiveTurns } from '@/lib/posApi';
import { fetchTurnItemsBatch } from '@/lib/pagination';
import { base44 } from '@/api/base44Client';
import { subscribeToTurns } from '@/lib/realtimeManager';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';
import { G, glassDeep, glassLight, fontDisplay } from '@/lib/glass';
import { getActiveStaff } from '@/lib/useActiveStaff';
import { enqueue } from '@/lib/offlineQueue';

export default function Salon() {
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const navigate = useNavigate();
  const [selectedTable, setSelectedTable] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [activeBranchTab, setActiveBranchTab] = useState(null);
  const [abriendo, setAbriendo] = useState(null);

  // Ref siempre actualizado para evitar stale closure en callbacks de Realtime
  const storeRef = useRef(store);
  useEffect(() => { storeRef.current = store; });

  useEffect(() => {
    if (!activeBranchTab && store.sucursales.length > 0) setActiveBranchTab(store.sucursales[0].id);
  }, [store.sucursales]);

  // Session timeout de 2h para tablets de mozos (dispositivos compartidos).
  // Previene que un mozo deje su sesión abierta para el próximo turno.
  useEffect(() => {
    if (userRole !== 'Mozo') return;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        supabase.auth.signOut().then(() => navigate('/login'));
      }, 2 * 60 * 60 * 1000); // 2 horas
    };
    reset();
    const events = ['click', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [userRole, navigate]);

  const displayBranch = store.branchId === 'todas'
    ? (activeBranchTab || store.sucursales[0]?.id)
    : store.branchId;

  const tables  = store.getTables(displayBranch);
  const grid    = store.gridConfig[displayBranch] || { cols:4, rows:2 };
  const ocupadas= tables.filter(t => t.status === 'ocupada' || t.status === 'demorada').length;
  const libres  = tables.filter(t => t.status === 'libre').length;
  const selTable= selectedTable ? tables.find(t => t.id === selectedTable) : null;

  useEffect(() => {
    dbLoadActiveTurns(displayBranch).then(async turns => {
      // 1. Sync estado de mesas en el store
      const turnTableMap = []; // { turnId, tableId }
      turns.forEach(t => {
        const existing = store.getTables(displayBranch).find(tb => tb.num === t.mesa_num);
        if (!existing) return;
        if (existing.status === 'libre') store.openTableWithTurn(displayBranch, existing.id, t.id, t.mozo, t.opened_at);
        if (t.comanda_lista !== undefined) store.setTableComandaLista(displayBranch, existing.id, !!t.comanda_lista);
        turnTableMap.push({ turnId: t.id, tableId: existing.id });
      });
      // 2. Cargar ítems de todos los turns activos en una sola query (fix: notas desaparecen al recargar)
      if (!turnTableMap.length) return;
      const allItems = await fetchTurnItemsBatch(turnTableMap.map(x => x.turnId));
      const byTurn = {};
      allItems.forEach(it => { if (!byTurn[it.turn_id]) byTurn[it.turn_id] = []; byTurn[it.turn_id].push(it); });
      turnTableMap.forEach(({ turnId, tableId }) => {
        const items = byTurn[turnId] || [];
        if (!items.length) return;
        store.updateTableOrder(displayBranch, tableId, items.map(it => ({
          itemId:     it.menu_item_id || null,
          nombre:     it.menu_item_name,
          precio:     it.precio,
          qty:        it.cantidad,
          turnItemId: it.id,
          nota:       it.notas || '',   // columna DB 'notas' → campo local 'nota'
          libre:      !it.menu_item_id,
        })));
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayBranch]);

  // Realtime: sync comanda_lista instantly when kitchen marks order ready.
  // Usamos storeRef para evitar stale closure — el store capturado al montar
  // puede tener mesas sin turnId si los turns aún no cargaron del DB.
  useEffect(() => {
    if (!displayBranch) return;
    // Usa singleton realtimeManager → comparte canal con otros componentes del mismo branch
    const unsub = subscribeToTurns(displayBranch, (payload) => {
      const updated = payload.new;
      const s = storeRef.current;
      const tables = s.getTables(displayBranch);

      // Turno nuevo abierto desde otro dispositivo → marcar mesa como ocupada
      if (payload.eventType === 'INSERT') {
        const tableMatch = tables.find(t => t.num === updated.mesa_num && t.status === 'libre');
        if (tableMatch) {
          s.openTableWithTurn(displayBranch, tableMatch.id, updated.id, updated.mozo, updated.opened_at);
          // Cargar ítems que pudieran existir (ej: mesa abierta desde POSView con items ya agregados)
          supabase.from('turn_items').select('*').eq('turn_id', updated.id)
            .then(({ data }) => {
              if (!data?.length) return;
              const order = data.map(it => ({
                itemId:     it.menu_item_id || null,
                nombre:     it.menu_item_name,
                precio:     it.precio,
                qty:        it.cantidad,
                turnItemId: it.id,
                nota:       it.notas || '',   // columna DB 'notas' → campo local 'nota'
                libre:      !it.menu_item_id,
              }));
              s.updateTableOrder(displayBranch, tableMatch.id, order);
            })
            .catch(() => {});
        }
        return;
      }

      if (payload.eventType !== 'UPDATE') return;

      const tableMatch = tables.find(t => t.turnId === updated.id)
        || tables.find(t => t.num === updated.mesa_num && t.status !== 'libre');
      if (!tableMatch) return;
      if (updated.comanda_lista !== undefined) {
        s.setTableComandaLista(displayBranch, tableMatch.id, !!updated.comanda_lista);
      }
      if (updated.status === 'cerrada' || updated.status === 'anulada') {
        s.closeTable(displayBranch, tableMatch.id);
      }
    });

    // Polling fallback cada 30s: re-sincroniza estados si el WebSocket cae
    // (Realtime puede desconectarse sin aviso en redes inestables del local)
    const pollInterval = setInterval(async () => {
      if (!navigator.onLine) return;
      try {
        const turns = await dbLoadActiveTurns(displayBranch);
        const s = storeRef.current;
        const currentTables = s.getTables(displayBranch);
        const openTurnIds = new Set(turns.map(t => t.id));

        // Abrir mesas que llegaron de otro dispositivo y aún aparecen libres
        turns.forEach(t => {
          const tb = currentTables.find(x => x.num === t.mesa_num);
          if (!tb) return;
          if (tb.status === 'libre') s.openTableWithTurn(displayBranch, tb.id, t.id, t.mozo, t.opened_at);
          // Actualizar badge "📦 Pronta" si cocina marcó lista y Realtime no lo entregó
          if (t.comanda_lista !== undefined) s.setTableComandaLista(displayBranch, tb.id, !!t.comanda_lista);
        });

        // Cerrar mesas que ya no están activas en DB (cobradas por otro dispositivo)
        currentTables
          .filter(tb => tb.status !== 'libre' && tb.turnId && !openTurnIds.has(tb.turnId))
          .forEach(tb => s.closeTable(displayBranch, tb.id));
      } catch(e) { /* silencioso — el polling es de respaldo, no crítico */ }
    }, 30000);

    return () => {
      unsub();
      clearInterval(pollInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayBranch]);

  // Listener para cobros offline que se sincronizaron al reconectar.
  // drainQueue dispara 'mimenu-table-synced' cuando CLOSE_TABLE se procesa exitosamente.
  useEffect(() => {
    const handler = (e) => {
      const { branchId: bid, tableId } = e.detail || {};
      if (!bid || !tableId) return;
      const s = storeRef.current;
      s.closeTable(bid, tableId);
      addToast('Cobro offline sincronizado con el servidor.', 'success');
    };
    window.addEventListener('mimenu-table-synced', handler);
    return () => window.removeEventListener('mimenu-table-synced', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClick(table) {
    // Mesa con cobro offline pendiente → no operable hasta que sincronice
    if (table.status === 'pendiente_cobro') {
      addToast('Mesa pendiente de sincronización — reconectate a internet para confirmar el cobro.', 'info');
      return;
    }
    if (table.status === 'libre') {
      if (abriendo) return;
      setAbriendo(table.id);
      const openedAt = Date.now();
      const mozoNombre = getActiveStaff()?.nombre || store.teamMembers?.find(m => m.email === user?.email)?.nombre || user?.email || '';

      // ── APERTURA OFFLINE ────────────────────────────────────────────────
      // Si no hay red, no intentamos el API call. Generamos un UUID local,
      // abrimos la mesa en el store, y encolamos INSERT_TURN para sincronizar
      // al reconectar. El mozo puede seguir tomando pedidos normalmente.
      if (!navigator.onLine) {
        const tempId = crypto.randomUUID();
        store.openTableWithTurn(displayBranch, table.id, tempId, mozoNombre, openedAt);
        enqueue({
          type: 'INSERT_TURN',
          id: tempId,
          data: {
            id: tempId,
            branch_id: displayBranch,
            mesa_num: table.num,
            status: 'abierta',
            opened_at: new Date(openedAt).toISOString(),
            total_facturado: 0,
            mozo: mozoNombre,
            caja_shift_id: store.turnoActivo?.id || null,
          },
        }).catch(() => {});
        addToast(`Mesa ${table.num} abierta (offline — se sincroniza al reconectar)`, 'warning');
        setAbriendo(null);
        return;
      }

      // ── APERTURA ONLINE ─────────────────────────────────────────────────
      store.openTable(displayBranch, table.id, openedAt);
      addToast(`Mesa ${table.num} abierta`, 'success');
      base44.entities.Turn.create({ branch_id:displayBranch, mesa_num:table.num, status:'abierta', opened_at:new Date(openedAt).toISOString(), total_facturado:0, mozo:mozoNombre, caja_shift_id: store.turnoActivo?.id || null })
        .then(turn => store.setTableTurnId(displayBranch, table.id, turn.id))
        .catch((err) => {
          const isDuplicate = err?.code === '23505' || err?.message?.includes('unique');
          if (isDuplicate) {
            // Otra tablet abrió la misma mesa simultáneamente — recargar el turno real
            addToast(`Mesa ${table.num} ya fue abierta por otro mozo`, 'warning');
            dbLoadActiveTurns(displayBranch).then(turns => {
              turns.forEach(t => {
                const existing = store.getTables(displayBranch).find(tb => tb.num === t.mesa_num);
                if (existing && existing.status === 'libre') {
                  store.openTableWithTurn(displayBranch, existing.id, t.id, t.mozo, t.opened_at);
                }
              });
            }).catch(() => {});
            store.closeTable(displayBranch, table.id);
          } else {
            // Error de red u otro error: convertir en apertura offline en lugar de revertir.
            // El mozo puede seguir tomando pedidos; la operación se sincroniza al reconectar.
            const tempId = crypto.randomUUID();
            store.openTableWithTurn(displayBranch, table.id, tempId, mozoNombre, openedAt);
            enqueue({
              type: 'INSERT_TURN',
              id: tempId,
              data: {
                id: tempId,
                branch_id: displayBranch,
                mesa_num: table.num,
                status: 'abierta',
                opened_at: new Date(openedAt).toISOString(),
                total_facturado: 0,
                mozo: mozoNombre,
                caja_shift_id: store.turnoActivo?.id || null,
              },
            }).catch(() => {});
            addToast(`Mesa ${table.num} abierta (modo offline por error de red)`, 'warning');
          }
        })
        .finally(() => setAbriendo(null));
    } else {
      setSelectedTable(table.id);
    }
  }

  return (
    <div style={{ display:'flex', gap:16, minHeight:0 }}>
      <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:16 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <h1 style={{ fontSize:22, fontWeight:700, color:G.text, margin:0, fontFamily:fontDisplay, letterSpacing:'-0.02em' }}>Salón</h1>
            <span style={{ ...glassLight({ padding:'3px 12px', borderRadius:99, fontSize:12, fontWeight:700, color:G.teal }) }}>
              {ocupadas} ocupada{ocupadas!==1?'s':''}
            </span>
            <span style={{ fontSize:12, color:G.textFaint }}>{libres} libre{libres!==1?'s':''}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Legend />
            <ShiftIndicator />
            <button onClick={() => setShowEditor(true)} style={{ ...glassLight({ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:12, fontSize:13, color:G.textMid, cursor:'pointer', border:'1px solid rgba(255,255,255,0.8)' }) }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              Editar layout
            </button>
          </div>
        </div>

        {/* Branch tabs */}
        {store.branchId === 'todas' && (
          <div style={{ display:'flex', gap:6 }}>
            {store.sucursales.map(s => (
              <button key={s.id} onClick={() => { setActiveBranchTab(s.id); setSelectedTable(null); }}
                style={{ padding:'6px 16px', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', transition:'all .15s', border:'none', background: activeBranchTab===s.id ? G.teal : 'rgba(255,255,255,0.55)', color: activeBranchTab===s.id ? 'white' : G.textMuted, boxShadow: activeBranchTab===s.id ? `0 4px 12px rgba(29,158,117,0.25)` : 'none' }}>
                {s.nombre}
              </button>
            ))}
          </div>
        )}

        {/* Aviso: sin turno de caja abierto */}
        {!store.turnoActivo && tables.length > 0 && (
          <Link to="/caja" style={{
            display:'flex', alignItems:'center', gap:10, padding:'10px 16px',
            background:'rgba(217,119,6,0.08)', border:'1.5px solid rgba(217,119,6,0.25)',
            borderRadius:12, textDecoration:'none', flexShrink:0,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" style={{ flexShrink:0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{ fontSize:13, color:'#92400E', fontWeight:600, flex:1 }}>
              Sin turno de caja abierto — los cobros no se registrarán correctamente.
            </span>
            <span style={{ fontSize:12, color:G.teal, fontWeight:700, flexShrink:0 }}>Abrir turno →</span>
          </Link>
        )}

        {/* Table grid */}
        <div style={{ ...glassDeep({ padding:20, position:'relative', flex:1 }) }}>
          {tables.length === 0 ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:220, gap:12, textAlign:'center' }}>
              <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(29,158,117,0.10)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={G.teal} strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </div>
              <div style={{ fontSize:15, fontWeight:700, color:G.text }}>Sin mesas configuradas</div>
              <div style={{ fontSize:13, color:G.textFaint, maxWidth:260 }}>
                Usá el editor de layout para agregar las mesas de tu salón.
              </div>
              <button onClick={() => setShowEditor(true)} style={{ marginTop:4, padding:'8px 20px', background:G.teal, color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Editar layout
              </button>
            </div>
          ) : (
            <>
              <div style={{ display:'grid', gridTemplateColumns:`repeat(${grid.cols}, 1fr)`, gridTemplateRows:`repeat(${grid.rows}, auto)`, gap:14 }}>
                {tables.map(t => (
                  <div key={t.id} style={{ gridColumn:t.gridCol, gridRow:t.gridRow }}>
                    <TableCard
                      table={t}
                      isSelected={selTable?.id === t.id}
                      loading={abriendo === t.id}
                      onClick={() => handleClick(t)}
                      onComandaListaClick={() => {
                        if (t.turnId) {
                          base44.entities.Turn.update(t.turnId, { comanda_lista:false }).catch(() => {});
                          store.setTableComandaLista(displayBranch, t.id, false);
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ textAlign:'center', marginTop:18, fontSize:10, color:'rgba(155,163,184,0.5)', letterSpacing:'2px', fontWeight:700 }}>ENTRADA</div>
            </>
          )}
        </div>
      </div>

      {/* Comanda Panel */}
      {selTable && (
        <ComandaPanel
          table={selTable}
          branchId={displayBranch}
          onClose={() => setSelectedTable(null)}
          addToast={addToast}
          onOpenPOS={() => navigate(`/pos?table=${selTable.id}&branch=${displayBranch}`)}
        />
      )}

      {showEditor && (
        <LayoutEditor branchId={displayBranch} onClose={() => setShowEditor(false)} addToast={addToast} />
      )}
    </div>
  );
}

function ShiftIndicator() {
  const { turnoActivo } = useStore();
  if (turnoActivo) {
    const abiertaMs = typeof turnoActivo.abiertaAt === 'string' ? new Date(turnoActivo.abiertaAt).getTime() : turnoActivo.abiertaAt;
    const mins = Math.max(0, Math.floor((Date.now() - abiertaMs) / 60000));
    const h = Math.floor(mins/60), m = mins%60;
    const elapsed = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return (
      <Link to="/caja" style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(29,158,117,0.12)', color:G.teal, border:'1px solid rgba(29,158,117,0.22)', borderRadius:99, padding:'4px 12px', fontSize:11, fontWeight:700, textDecoration:'none' }}>
        <span style={{ width:6, height:6, borderRadius:'50%', background:G.teal, boxShadow:`0 0 5px ${G.teal}` }} />
        Turno abierto · {elapsed}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </Link>
    );
  }
  return (
    <Link to="/caja" style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(0,0,0,0.05)', color:G.textMuted, borderRadius:99, padding:'4px 12px', fontSize:11, fontWeight:500, textDecoration:'none', border:'1px solid rgba(0,0,0,0.08)' }}>
      Sin turno · <span style={{ color:G.teal, fontWeight:700 }}>Abrir →</span>
    </Link>
  );
}

function Legend() {
  return (
    <div className="hidden sm:flex" style={{ gap:12, alignItems:'center' }}>
      {[
        ['#D1D5DB', G.textFaint, 'Libre'],
        [G.teal,    G.teal,      'Ocupada'],
        [G.red,     G.red,       'Demorada'],
        [G.blue,    G.blue,      'Reservada'],
      ].map(([c,,l]) => (
        <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:10, height:10, borderRadius:'50%', border:`2px solid ${c}`, background:`${c}22`, display:'inline-block' }} />
          <span style={{ fontSize:11, color:G.textFaint }}>{l}</span>
        </div>
      ))}
    </div>
  );
}
