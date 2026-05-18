import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import moment from 'moment';
import PeriodSelector from '../components/PeriodSelector';
import EmptyState from '../components/EmptyState';
import TicketByDayChart from '../components/ticket/TicketByDayChart';
import TicketComparator from '../components/ticket/TicketComparator';
import { formatCurrency, formatPercent, DAY_NAMES, DAY_NAMES_FULL } from '@/lib/utils-format';

export default function AverageTicket() {
  const ctx = useOutletContext();
  const [period, setPeriod] = useState('week');
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [ctx.activeBranchId, ctx.branches]);

  async function loadData() {
    setLoading(true);
    const branchIds = ctx.getBranchIds();
    let all = [];
    for (const bid of branchIds) {
      const t = await base44.entities.Turn.filter({ branch_id: bid, status: 'cerrada' }, '-closed_at', 200).catch(() => []);
      all = all.concat(t || []);
    }
    const normalized = all.map(t => ({
      ...t,
      fecha: t.closed_at ? new Date(t.closed_at).toISOString().split('T')[0] : null,
    }));
    setTurns(normalized);
    setLoading(false);
  }

  const { currentTicket, ticketChange, bestDay, dayTickets } = useMemo(() => {
    const today = moment();
    let startDate, prevStart, prevEnd;

    if (period === 'today') {
      startDate = today.format('YYYY-MM-DD');
      prevStart = today.clone().subtract(1, 'day').format('YYYY-MM-DD');
      prevEnd = prevStart;
    } else if (period === 'week') {
      startDate = today.clone().startOf('isoWeek').format('YYYY-MM-DD');
      prevStart = today.clone().subtract(1, 'week').startOf('isoWeek').format('YYYY-MM-DD');
      prevEnd = today.clone().subtract(1, 'week').endOf('isoWeek').format('YYYY-MM-DD');
    } else {
      startDate = today.clone().startOf('month').format('YYYY-MM-DD');
      prevStart = today.clone().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
      prevEnd = today.clone().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
    }

    const current = turns.filter(t => t.fecha >= startDate);
    const prev = turns.filter(t => t.fecha >= prevStart && t.fecha <= prevEnd);

    const curRev = current.reduce((s, t) => s + (t.total_facturado || 0), 0);
    const curTicket = current.length > 0 ? curRev / current.length : 0;

    const prevRev = prev.reduce((s, t) => s + (t.total_facturado || 0), 0);
    const prevTicket = prev.length > 0 ? prevRev / prev.length : 0;

    const change = prevTicket > 0 ? ((curTicket - prevTicket) / prevTicket) * 100 : 0;

    // Ticket by day of week
    const dayData = DAY_NAMES.map((_, di) => {
      const dayTurns = turns.filter(t => {
        const dow = new Date(t.fecha).getDay();
        return (dow === 0 ? 6 : dow - 1) === di;
      });
      const rev = dayTurns.reduce((s, t) => s + (t.total_facturado || 0), 0);
      return { day: DAY_NAMES[di], ticket: dayTurns.length > 0 ? rev / dayTurns.length : 0 };
    });

    const bestIdx = dayData.reduce((best, d, i) => d.ticket > dayData[best].ticket ? i : best, 0);

    return {
      currentTicket: curTicket,
      ticketChange: change,
      bestDay: { name: DAY_NAMES_FULL[bestIdx], ticket: dayData[bestIdx].ticket },
      dayTickets: dayData,
    };
  }, [turns, period]);

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: '#1D9E75' }} /></div>;
  }

  if (turns.length === 0) {
    return <EmptyState title="Aún no hay datos para mostrar" subtitle="Cargá tu primer turno o conectá tu sistema." linkText="Ir a conexión de datos" linkTo="/configuracion?tab=conexion" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>Ticket promedio</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-[14px_16px]" style={{ backgroundColor: 'var(--color-background-secondary)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'rgba(0,0,0,0.4)' }}>
            Ticket del período
          </div>
          <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-1px', marginTop: 4 }}>
            {formatCurrency(currentTicket)}
          </div>
          <div style={{ fontSize: 11, color: ticketChange >= 0 ? '#1D9E75' : '#DC3545', marginTop: 2 }}>
            {ticketChange >= 0 ? '▲' : '▼'} {formatPercent(ticketChange)} vs período anterior
          </div>
        </div>
        <div className="p-[14px_16px]" style={{ backgroundColor: 'var(--color-background-secondary)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'rgba(0,0,0,0.4)' }}>
            Mejor día de la semana
          </div>
          <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-1px', marginTop: 4 }}>
            {bestDay.name}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', marginTop: 2 }}>
            Promedio {formatCurrency(bestDay.ticket)}
          </div>
        </div>
      </div>

      <TicketByDayChart data={dayTickets} />
      <TicketComparator turns={turns} />
    </div>
  );
}


