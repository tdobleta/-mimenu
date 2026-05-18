import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import moment from 'moment';
import PeriodSelector from '../components/PeriodSelector';
import EmptyState from '../components/EmptyState';
import ProductsChart from '../components/products/ProductsChart';
import ProductsTable from '../components/products/ProductsTable';

export default function Products() {
  const ctx = useOutletContext();
  const [period, setPeriod] = useState('week');
  const [turnItems, setTurnItems] = useState([]);
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [ctx.activeBranchId, ctx.branches]);

  async function loadData() {
    setLoading(true);
    const branchIds = ctx.getBranchIds();
    let allItems = [];
    let allTurns = [];
    for (const bid of branchIds) {
      const items = await base44.entities.TurnItem.filter({ branch_id: bid }, '-created_date', 500).catch(() => []);
      allItems = allItems.concat(items || []);
      const t = await base44.entities.Turn.filter({ branch_id: bid, status: 'cerrada' }, '-closed_at', 200).catch(() => []);
      allTurns = allTurns.concat(t || []);
    }
    setTurnItems(allItems);
    setTurns(allTurns);
    setLoading(false);
  }

  const { products, prevProducts } = useMemo(() => {
    let startDate, prevStartDate, prevEndDate;
    const today = moment();
    
    if (period === 'today') {
      startDate = today.format('YYYY-MM-DD');
      prevStartDate = today.clone().subtract(1, 'day').format('YYYY-MM-DD');
      prevEndDate = prevStartDate;
    } else if (period === 'week') {
      startDate = today.clone().startOf('isoWeek').format('YYYY-MM-DD');
      prevStartDate = today.clone().subtract(1, 'week').startOf('isoWeek').format('YYYY-MM-DD');
      prevEndDate = today.clone().subtract(1, 'week').endOf('isoWeek').format('YYYY-MM-DD');
    } else {
      startDate = today.clone().startOf('month').format('YYYY-MM-DD');
      prevStartDate = today.clone().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
      prevEndDate = today.clone().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
    }

    const startTs = new Date(startDate + 'T00:00:00').getTime();
    const prevStartTs = new Date(prevStartDate + 'T00:00:00').getTime();
    const prevEndTs = new Date(prevEndDate + 'T23:59:59').getTime();
    const turnIds = new Set(turns.filter(t => t.closed_at && t.closed_at >= startTs).map(t => t.id));
    const prevTurnIds = new Set(turns.filter(t => t.closed_at && t.closed_at >= prevStartTs && t.closed_at <= prevEndTs).map(t => t.id));

    const currentItems = turnItems.filter(ti => turnIds.has(ti.turn_id));
    const prevItems = turnItems.filter(ti => prevTurnIds.has(ti.turn_id));

    const map = {};
    currentItems.forEach(ti => {
      const name = ti.menu_item_name || 'Producto';
      if (!map[name]) map[name] = { name, qty: 0, amount: 0 };
      map[name].qty += ti.cantidad || 0;
    });

    const prevMap = {};
    prevItems.forEach(ti => {
      const name = ti.menu_item_name || 'Producto';
      if (!prevMap[name]) prevMap[name] = { name, qty: 0 };
      prevMap[name].qty += ti.cantidad || 0;
    });

    const totalQty = Object.values(map).reduce((s, p) => s + p.qty, 0);

    const sorted = Object.values(map)
      .sort((a, b) => b.qty - a.qty)
      .map(p => ({
        ...p,
        pct: totalQty > 0 ? (p.qty / totalQty) * 100 : 0,
        prevQty: prevMap[p.name]?.qty || 0,
        change: prevMap[p.name]?.qty > 0 ? ((p.qty - prevMap[p.name].qty) / prevMap[p.name].qty) * 100 : 0,
      }));

    return { products: sorted, prevProducts: prevMap };
  }, [turnItems, turns, period]);

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: '#1D9E75' }} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Productos</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {products.length === 0 ? (
        <EmptyState title="No hay ventas registradas en este período" />
      ) : (
        <>
          <ProductsChart products={products} />
          <ProductsTable products={products} />
        </>
      )}
    </div>
  );
}


