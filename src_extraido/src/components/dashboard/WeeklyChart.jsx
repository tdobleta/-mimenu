import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import moment from 'moment';
import { formatCurrency, DAY_NAMES } from '@/lib/utils-format';

export default function WeeklyChart({ turns }) {
  const data = useMemo(() => {
    const thisWeekStart = moment().startOf('isoWeek');
    const lastWeekStart = moment().subtract(1, 'week').startOf('isoWeek');

    return DAY_NAMES.map((day, i) => {
      const thisDay = thisWeekStart.clone().add(i, 'days').format('YYYY-MM-DD');
      const lastDay = lastWeekStart.clone().add(i, 'days').format('YYYY-MM-DD');

      const thisTotal = turns
        .filter(t => t.closed_at && new Date(t.closed_at).toISOString().split('T')[0] === thisDay)
        .reduce((s, t) => s + (t.total_facturado || 0), 0);
      const lastTotal = turns
        .filter(t => t.closed_at && new Date(t.closed_at).toISOString().split('T')[0] === lastDay)
        .reduce((s, t) => s + (t.total_facturado || 0), 0);

      return { name: day, esta: thisTotal, anterior: lastTotal };
    });
  }, [turns]);

  return (
    <div className="bg-white p-[16px_18px]" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontSize: 13, fontWeight: 500 }}>Ventas de la semana</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#1D9E75', display: 'inline-block' }} />
            Esta semana
          </span>
          <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#9FE1CB', display: 'inline-block' }} />
            Semana anterior
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid stroke="rgba(0,0,0,0.04)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.4)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.4)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 4, border: '0.5px solid #eee' }} />
          <Bar dataKey="esta" fill="#1D9E75" radius={[3, 3, 0, 0]} name="Esta semana" />
          <Bar dataKey="anterior" fill="#9FE1CB" radius={[3, 3, 0, 0]} name="Semana anterior" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


