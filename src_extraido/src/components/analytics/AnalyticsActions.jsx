import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import useUserRole from '@/lib/useUserRole';
import { useAuth } from '@/lib/AuthContext';
import ResetAnalyticsModal from './ResetAnalyticsModal';
import SalesEditorPanel from './SalesEditorPanel';

export default function AnalyticsActions({ resetLabel='Reiniciar analíticas', editLabel='Editar analítica' }) {
  const role = useUserRole();
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const [showReset, setShowReset] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  if (role !== 'Dueno') return null;
  const isTodas = store.branchId === 'todas';
  const branchName = isTodas ? 'Todas las sucursales' : (store.sucursales?.find(s=>s.id===store.branchId)?.nombre || '');

  async function handleReset() {
    if (isTodas || !store.branchId) return;
    setLoading(true);
    try {
      const branchIds = [store.branchId];
      const turnArrays = await Promise.all(
        branchIds.map(bid =>
          base44.entities.Turn.filter({ status: 'cerrada', branch_id: bid }, '-closed_at', 500).catch(() => [])
        )
      );
      const allTurns = turnArrays.flat();
      for (const turn of (allTurns||[])) {
        const items = await base44.entities.TurnItem.filter({ turn_id: turn.id });
        await Promise.all((items||[]).map(it => base44.entities.TurnItem.delete(it.id)));
        await base44.entities.Turn.delete(turn.id);
      }
      if (store.refreshCharts) await store.refreshCharts(store.branchId);
      store.logAccion({
        usuario: user?.email || 'Sistema',
        rol: role,
        categoria: 'Analíticas',
        accion: 'Analíticas reiniciadas',
        detalle: 'Sucursal: ' + branchName,
        sucursal: branchName,
      });
      addToast('Analíticas reiniciadas correctamente', 'success');
      setShowReset(false);
    } catch(err) {
      console.error(err);
      addToast('Error al reiniciar analíticas', 'error');
    }
    setLoading(false);
  }

  const btnBase = { display:'flex', alignItems:'center', gap:6, padding:'6px 12px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:12, color:'#374151', backgroundColor:'white', cursor:'pointer', whiteSpace:'nowrap' };

  return (
    <>
      <div style={{ display:'flex', gap:6 }}>
        <button onClick={()=>setShowEditor(true)} style={btnBase}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          {editLabel}
        </button>
        <button
          onClick={()=>!isTodas && setShowReset(true)}
          disabled={isTodas}
          title={isTodas ? 'Seleccioná una sucursal específica para reiniciar sus analíticas' : ''}
          style={{ ...btnBase, color: isTodas ? '#9CA3AF' : '#EF4444', borderColor: isTodas ? 'rgba(0,0,0,0.08)' : 'rgba(239,68,68,0.25)', cursor: isTodas?'not-allowed':'pointer', opacity: isTodas?0.6:1 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          {resetLabel}
        </button>
      </div>

      <ResetAnalyticsModal
        isOpen={showReset}
        onClose={()=>!loading && setShowReset(false)}
        onConfirm={handleReset}
        branchName={branchName}
        loading={loading}
      />

      <SalesEditorPanel isOpen={showEditor} onClose={()=>setShowEditor(false)} />
    </>
  );
}


