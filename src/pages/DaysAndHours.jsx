import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import moment from 'moment';
import KPICard from '../components/KPICard';
import EmptyState from '../components/EmptyState';
import HeatMap from '../components/HeatMap';
import { formatCurrency, DAY_NAMES, DAY_NAMES_FULL } from '@/lib/utils-format';

export default function DaysAndHours() {
  const ctx = useOutletContext();
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
    // Normalizar: derivar fecha y turno desde closed_at
    const normalized = all.map(t => ({
      ...t,
      fecha: t.closed_at ? new Date(t.closed_at).toISOString().split('T')[0] : null,
      turno: t.closed_at ? (new Date(t.closed_at).getHours() < 17 ? 'mediodia' : 'noche') : 'noche',
    }));
    setTurns(normalized);
    setLoading(false);
  }

  const { heatData, bestMoment, worstDay, inactiveRange } = useMemo(() => {
    const last30 = moment().subtract(30, 'days').format('YYYY-MM-DD');
    const recent = turns.filter(t => t.fecha && t.fecha >= last30);

    // Build heatmap: day (0-6) x hour (12-23)
    const grid = {};
    const counts = {};
    DAY_NAMES.forEach((_, di) => {
      grid[di] = {};
      counts[di] = {};
      for (let h = 12; h <= 23; h++) {
        grid[di][h] = 0;
        counts[di][h] = 0;
      }
    });

    recent.forEach(t => {
      const dow = new Date(t.fecha).getDay();
      const di = dow === 0 ? 6 : dow - 1;
      const hours = t.turno === 'mediodia' ? [12, 13, 14, 15, 16] : [18, 19, 20, 21, 22, 23];
      const perHour = (t.total_facturado || 0) / hours.length;
      hours.forEach(h => {
        grid[di][h] += perHour;
        counts[di][h]++;
      });
    });

    // Average
    const avgGrid = {};
    let maxVal = 0;
    let bestDay = 0, bestHour = 12, bestVal = 0;
    DAY_NAMES.forEach((_, di) => {
      avgGrid[di] = {};
      for (let h = 12; h <= 23; h++) {
        const avg = counts[di][h] > 0 ? grid[di][h] / counts[di][h] : 0;
        avgGrid[di][h] = avg;
        if (avg > maxVal) maxVal = avg;
        if (avg > bestVal) { bestVal = avg; bestDay = di; bestHour = h; }
      }
    });

    // Day totals for worst day
    const dayTotals = DAY_NAMES.map((_, di) => {
      let sum = 0;
      for (let h = 12; h <= 23; h++) sum += avgGrid[di][h];
      return sum;
    });
    const worstDayIdx = dayTotals.indexOf(Math.min(...dayTotals));
    const bestDayTotal = Math.max(...dayTotals);
    const worstDiff = bestDayTotal > 0 ? ((dayTotals[worstDayIdx] - bestDayTotal) / bestDayTotal) * 100 : 0;

    // Inactive range
    let inactiveStart = null, inactiveEnd = null;
    for (let h = 12; h <= 23; h++) {
      let anyData = false;
      for (let di = 0; di < 7; di++) {
        if (avgGrid[di][h] > 0) { anyData = true; break; }
      }
      if (!anyData) {
        if (inactiveStart === null) inactiveStart = h;
        inactiveEnd = h;
      }
    }

    return {
      heatData: { grid: avgGrid, maxVal },
      bestMoment: { day: DAY_NAMES_FULL[bestDay], hour: bestHour, amount: bestVal },
      worstDay: { day: DAY_NAMES_FULL[worstDayIdx], diff: worstDiff },
      inactiveRange: inactiveStart !== null ? `${inactiveStart}:00 – ${inactiveEnd + 1}:00` : null,
    };
  }, [turns]);

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: '#1D9E75' }} /></div>;
  }

  if (turns.length === 0) {
    return <EmptyState title="Aún no hay datos para mostrar" subtitle="Cargá tu primer turno o conectá tu sistema." linkText="Ir a conexión de datos" linkTo="/configuracion?tab=conexion" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>
          ¿Cuándo entra la plata? <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)', fontWeight: 400 }}>— Promedio de los últimos 30 días</span>
        </h1>
      </div>

      <HeatMap data={heatData} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPICard
          label="Mejor momento"
          value={`${bestMoment.day} ${bestMoment.hour}:00`}
          context={`Promedio ${formatCurrency(bestMoment.amount)}`}
        />
        <KPICard
          label="Día más flojo"
          value={worstDay.day}
          context={`${Math.round(worstDay.diff)}% vs mejor día`}
          contextColor="#DC3545"
        />
        <KPICard
          label="Horario sin actividad"
          value={inactiveRange || 'Ninguno'}
          context={inactiveRange ? 'Sin ventas registradas en ese rango' : 'Todos los horarios tienen actividad'}
        />
      </div>
    </div>
  );
}


