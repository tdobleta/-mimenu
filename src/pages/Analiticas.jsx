import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import AnalyticsSummary from '../components/analytics/AnalyticsSummary';
import SalesEvolution from '../components/analytics/SalesEvolution';
import IncomeDistribution from '../components/analytics/IncomeDistribution';
import TablePerformance from '../components/analytics/TablePerformance';
import StarProducts from '../components/analytics/StarProducts';
import TeamAndReservations from '../components/analytics/TeamAndReservations';

const PERIODS = [
  ['today','Hoy'],
  ['week','Esta semana'],
  ['month','Este mes'],
  ['quarter','Últimos 3 meses'],
];

function getPeriodStart(period) {
  const now = new Date();
  if (period === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d.getTime(); }
  if (period === 'week')  { const d = new Date(now); d.setDate(d.getDate() - d.getDay() + (d.getDay()===0?-6:1)); d.setHours(0,0,0,0); return d.getTime(); }
  if (period === 'month') { return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); }
  if (period === 'quarter') { const d = new Date(now); d.setMonth(d.getMonth()-3); d.setHours(0,0,0,0); return d.getTime(); }
  return 0;
}

export default function Analiticas() {
  const store = useStore();
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [allTurns, setAllTurns] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [menuItemsDb, setMenuItemsDb] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const branchIds = store.branchId && store.branchId !== 'todas'
          ? [store.branchId]
          : (store.sucursales || []).map(b => b.id);

        let turns;
        if (store.branchId && store.branchId !== 'todas') {
          turns = await base44.entities.Turn.filter({ status: 'cerrada', branch_id: store.branchId }, '-closed_at', 500);
        } else {
          const arrays = await Promise.all(
            branchIds.map(bid =>
              base44.entities.Turn.filter({ status: 'cerrada', branch_id: bid }, '-closed_at', 500).catch(() => [])
            )
          );
          turns = arrays.flat();
        }
        turns = turns || [];

        const top200 = turns.slice(0, 200);
        const itemsArrays = await Promise.all(
          top200.map(t => base44.entities.TurnItem.filter({ turn_id: t.id }).catch(() => []))
        );
        const items = itemsArrays.flat();

        let menus = [];
        try {
          if (branchIds.length > 0) {
            const menuArrays = await Promise.all(branchIds.map(bid => base44.entities.MenuItem.filter({ branch_id: bid }).catch(() => [])));
            menus = menuArrays.flat();
          }
        } catch(e) {}

        if (!cancelled) {
          setAllTurns(turns);
          setAllItems(items);
          setMenuItemsDb(menus);
          setLoading(false);
        }
      } catch(err) {
        console.error('Error cargando analíticas:', err);
        if (!cancelled) {
          setAllTurns([]);
          setAllItems([]);
          setLoading(false);
        }
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [store.branchId, store.sucursales]);

  const periodStart = getPeriodStart(period);
  const periodEnd = Date.now();

  const periodTurns = useMemo(() => allTurns.filter(t => t.closed_at && t.closed_at >= periodStart), [allTurns, periodStart]);
  const periodTurnIds = useMemo(() => new Set(periodTurns.map(t => t.id)), [periodTurns]);
  const periodItems = useMemo(() => allItems.filter(it => periodTurnIds.has(it.turn_id)), [allItems, periodTurnIds]);

  const prevStart = periodStart - (periodEnd - periodStart);
  const prevTurns = useMemo(() => allTurns.filter(t => t.closed_at && t.closed_at >= prevStart && t.closed_at < periodStart), [allTurns, prevStart, periodStart]);

  const reservas = store.getReservas();

  const isEmpty = !loading && periodTurns.length === 0;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <h1 style={{ fontSize:20, fontWeight:600, color:'#111827', margin:0 }}>Analíticas</h1>
        <div style={{ display:'flex', gap:4 }}>
          {PERIODS.map(([k,l])=>(
            <button key={k} onClick={()=>setPeriod(k)}
              style={{ padding:'6px 14px', borderRadius:99, fontSize:12, fontWeight:500, cursor:'pointer', backgroundColor:period===k?'#1D9E75':'white', color:period===k?'white':'#6B7280', border:period===k?'none':'0.5px solid rgba(0,0,0,0.10)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'80px 0' }}>
          <div style={{ width:32, height:32, border:'3px solid #E5E7EB', borderTopColor:'#1D9E75', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : isEmpty ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'80px 20px', textAlign:'center' }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" style={{ marginBottom:16 }}>
            <path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/>
          </svg>
          <div style={{ fontSize:16, color:'#374151', fontWeight:500, marginBottom:6 }}>Todavía no hay datos para este período</div>
          <div style={{ fontSize:13, color:'#9CA3AF', marginBottom:18 }}>Cerrá tu primera mesa para empezar a ver tus analíticas</div>
          <Link to="/salon" style={{ padding:'9px 18px', backgroundColor:'#1D9E75', color:'white', textDecoration:'none', borderRadius:7, fontSize:13, fontWeight:500 }}>Ir al Salón</Link>
        </div>
      ) : (
        <>
          <AnalyticsSummary periodTurns={periodTurns} prevTurns={prevTurns} />
          <SalesEvolution periodTurns={periodTurns} period={period} allTurns={allTurns} periodStart={periodStart} />
          <IncomeDistribution periodTurns={periodTurns} periodItems={periodItems} menuItemsDb={menuItemsDb} />
          <TablePerformance periodTurns={periodTurns} period={period} periodStart={periodStart} />
          <StarProducts periodItems={periodItems} />
          <TeamAndReservations periodTurns={periodTurns} reservas={reservas} period={period} periodStart={periodStart} />
        </>
      )}
    </div>
  );
}


