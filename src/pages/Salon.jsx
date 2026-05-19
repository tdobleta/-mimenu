import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import TableCard from '../components/salon/TableCard';
import ComandaPanel from '../components/salon/ComandaPanel';
import LayoutEditor from '../components/salon/LayoutEditor';
import { dbLoadActiveTurns } from '@/lib/posApi';
import { base44 } from '@/api/base44Client';
import { subscribeToTurns } from '@/lib/realtimeManager';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';
import { G, glass, glassDeep, glassLight, fontDisplay } from '@/lib/glass';

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

  const displayBranch = store.branchId === 'todas'
    ? (activeBranchTab || store.sucursales[0]?.id)
    : store.branchId;

  const tables  = store.getTables(displayBranch);
  const grid    = store.gridConfig[displayBranch] || { cols:4, rows:2 };
  const ocupadas= tables.filter(t => t.status === 'ocupada' || t.status === 'demorada').length;
  const libres  = tables.filter(t => t.status === 'libre').length;
  const selTable= selectedTable ? tables.find(t => t.id === selectedTable) : null;

  useEffect(() => {
    dbLoadActiveTurns(displayBranch).then(turns => {
      turns.forEach(t => {
        const existing = store.getTables(displayBranch).find(tb => tb.num === t.mesa_num);
        if (existing && existing.status === 'libre') store.openTableWithTurn(displayBranch, existing.id, t.id, t.mozo, t.opened_at);
        // Sync comanda_lista and cocina_estado on load
        if (existing && t.comanda_lista !== undefined) store.setTableComandaLista(displayBranch, existing.id, !!t.comanda_lista);
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
      // Solo procesar UPDATEs
      if (payload.eventType !== 'UPDATE') return;
      // storeRef.current es siempre el store más reciente (no el del montaje)
      const s = storeRef.current;
      const tables = s.getTables(displayBranch);
      // Buscar la mesa por turnId primero; fallback por mesa_num si turnId aún no sincronizó
      const tableMatch = tables.find(t => t.turnId === updated.id)
        || tables.find(t => t.num === updated.mesa_num && t.status !== 'libre');
      if (!tableMatch) return;
      if (updated.comanda_lista !== undefined) {
        s.setTableComandaLista(displayBranch, tableMatch.id, !!updated.comanda_lista);
      }
      // Sync cierre/anulación desde otro dispositivo
      if (updated.status === 'cerrada' || updated.status === 'anulada') {
        s.closeTable(displayBranch, tableMatch.id);
      }
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayBranch]);

  function handleClick(table) {
    if (table.status === 'libre') {
      if (abriendo) return;
      setAbriendo(table.id);
      const openedAt = Date.now();
      store.openTable(displayBranch, table.id, openedAt);
      addToast(`Mesa ${table.num} abierta`, 'success');
      const mozoNombre = store.teamMembers?.find(m => m.email === user?.email)?.nombre || user?.email || '';
      base44.entities.Turn.create({ branch_id:displayBranch, mesa_num:table.num, status:'abierta', opened_at:new Date(openedAt).toISOString(), total_facturado:0, mozo:mozoNombre })
        .then(turn => store.setTableTurnId(displayBranch, table.id, turn.id))
        .catch(() => {})
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

        {/* Table grid */}
        <div style={{ ...glassDeep({ padding:20, position:'relative', flex:1 }) }}>
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
