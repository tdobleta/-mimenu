import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import TableCard from '../components/salon/TableCard';
import ComandaPanel from '../components/salon/ComandaPanel';
import LayoutEditor from '../components/salon/LayoutEditor';
import { dbLoadActiveTurns } from '@/lib/posApi';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';

export default function Salon() {
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [selectedTable, setSelectedTable] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [activeBranchTab, setActiveBranchTab] = useState(null);
  const [abriendo, setAbriendo] = useState(null);

  useEffect(() => {
    if (!activeBranchTab && store.sucursales.length > 0) {
      setActiveBranchTab(store.sucursales[0].id);
    }
  }, [store.sucursales]);

  const displayBranch = store.branchId === 'todas'
    ? (activeBranchTab || store.sucursales[0]?.id)
    : store.branchId;
  const tables = store.getTables(displayBranch);
  const grid = store.gridConfig[displayBranch] || { cols:4, rows:2 };
  const ocupadas = tables.filter(t => t.status === 'ocupada' || t.status === 'demorada').length;
  const libres   = tables.filter(t => t.status === 'libre').length;
  const selTable = selectedTable ? tables.find(t => t.id === selectedTable) : null;

  useEffect(() => {
    dbLoadActiveTurns(displayBranch).then(turns => {
      turns.forEach(t => {
        const existing = store.getTables(displayBranch).find(tb => tb.num === t.mesa_num);
        if (existing && existing.status === 'libre') {
          store.openTableWithTurn(displayBranch, existing.id, t.id, t.mozo, t.opened_at);
        }
      });
    }).catch(() => {});
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
      base44.entities.Turn.create({
        branch_id: displayBranch,
        mesa_num: table.num,
        status: 'abierta',
        opened_at: openedAt,
        total_facturado: 0,
        mozo: mozoNombre,
      })
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
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <h1 style={{ fontSize:20, fontWeight:600, color:'#111827', margin:0 }}>Salón</h1>
            <span style={{ fontSize:13, color:'#1D9E75', fontWeight:500 }}>{ocupadas} ocupada{ocupadas!==1?'s':''}</span>
            <span style={{ fontSize:13, color:'#9CA3AF' }}>{libres} libre{libres!==1?'s':''}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <Legend />
            <ShiftIndicator />
            <button onClick={() => setShowEditor(true)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:'pointer', transition:'all .15s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              Editar layout
            </button>
          </div>
        </div>

        {/* Branch tab when "todas" */}
        {store.branchId === 'todas' && (
          <div style={{ display:'flex', gap:6 }}>
            {store.sucursales.map(s => (
              <button key={s.id} onClick={() => { setActiveBranchTab(s.id); setSelectedTable(null); }}
                style={{ padding:'5px 14px', borderRadius:7, fontSize:13, cursor:'pointer', transition:'all .15s', border: activeBranchTab===s.id ? 'none' : '0.5px solid rgba(0,0,0,0.08)', backgroundColor: activeBranchTab===s.id ? '#1D9E75' : 'white', color: activeBranchTab===s.id ? 'white' : '#6B7280' }}>
                {s.nombre}
              </button>
            ))}
          </div>
        )}

        {/* Table grid */}
        <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:20, position:'relative' }}>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${grid.cols}, 1fr)`, gridTemplateRows:`repeat(${grid.rows}, auto)`, gap:12 }}>
            {tables.map(t => (
              <div key={t.id} style={{ gridColumn:t.gridCol, gridRow:t.gridRow }}>
                <TableCard
                  table={t}
                  isSelected={selTable?.id === t.id}
                  loading={abriendo === t.id}
                  onClick={() => handleClick(t)}
                  onComandaListaClick={() => {
                    if (t.turnId) {
                      base44.entities.Turn.update(t.turnId, { comanda_lista: false }).catch(() => {});
                      store.setTableComandaLista(displayBranch, t.id, false);
                    }
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ textAlign:'center', marginTop:16, fontSize:11, color:'#E5E7EB', letterSpacing:'1.5px', fontWeight:600 }}>ENTRADA</div>
        </div>
      </div>

      {/* Comanda Panel */}
      {selTable && (
        <ComandaPanel
          table={selTable}
          branchId={displayBranch}
          onClose={() => setSelectedTable(null)}
          addToast={addToast}
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
    const mins = Math.max(0, Math.floor((Date.now() - turnoActivo.abiertaAt) / 60000));
    const h = Math.floor(mins/60), m = mins%60;
    const elapsed = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return (
      <Link to="/caja" style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', backgroundColor:'#E8F7F2', color:'#1D9E75', borderRadius:99, fontSize:11, fontWeight:600, textDecoration:'none' }}>
        <span style={{ width:6, height:6, borderRadius:'50%', backgroundColor:'#1D9E75' }} />
        Turno abierto · {elapsed}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </Link>
    );
  }
  return (
    <Link to="/caja" style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', backgroundColor:'#F3F4F6', color:'#6B7280', borderRadius:99, fontSize:11, fontWeight:500, textDecoration:'none' }}>
      Sin turno
      <span style={{ color:'#1D9E75', fontWeight:600, marginLeft:2 }}>Abrir →</span>
    </Link>
  );
}

function Legend() {
  return (
    <div className="hidden sm:flex" style={{ gap:12 }}>
      {[['#E5E7EB','Libre'],['#1D9E75','Ocupada'],['#EF4444','Demorada'],['#3B82F6','Reservada']].map(([c,l])=>(
        <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:12,height:12,borderRadius:'50%',border:`2px solid ${c}`,display:'inline-block' }} />
          <span style={{ fontSize:12, color:'#9CA3AF' }}>{l}</span>
        </div>
      ))}
    </div>
  );
}


