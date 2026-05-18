import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import moment from 'moment';
import { formatCurrency, abbreviateNumber } from '@/lib/utils-format';

export default function MonthlyTrend({ turns }) {
  const { data, monthLabel } = useMemo(() => {
    const start = moment().startOf('month');
    const today = moment();
    const days = [];

    for (let d = start.clone(); d.isSameOrBefore(today); d.add(1, 'day')) {
      const dateStr = d.format('YYYY-MM-DD');
      const dayTurns = turns.filter(t => t.fecha === dateStr);
      const total = dayTurns.reduce((s, t) => s + (t.total_facturado || 0), 0);
      days.push({ name: d.format('D'), total });
    }

    return { data: days, monthLabel: moment().format('MMMM YYYY') };
  }, [turns]);

  return (
    <div className="bg-white p-[16px_18px]" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ fontSize: 13, fontWeight: 500 }}>Tendencia del mes</span>
        <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)' }}>· {monthLabel}</span>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data}>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.35)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.35)' }} axisLine={false} tickLine={false} tickFormatter={v => abbreviateNumber(v)} />
          <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 4 }} />
          <Area type="monotone" dataKey="total" stroke="#1D9E75" fill="rgba(29,158,117,0.06)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}


