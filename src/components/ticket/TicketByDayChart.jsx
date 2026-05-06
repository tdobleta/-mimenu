import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrency, abbreviateNumber } from '@/lib/utils-format';

export default function TicketByDayChart({ data }) {
  const maxTicket = Math.max(...data.map(d => d.ticket));

  return (
    <div className="bg-white p-[18px_20px]" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Ticket por día de la semana</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}>
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.4)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.4)' }} axisLine={false} tickLine={false} tickFormatter={v => abbreviateNumber(v)} />
          <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 4 }} />
          <Bar dataKey="ticket" radius={[3, 3, 0, 0]} name="Ticket">
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.ticket === maxTicket ? '#1D9E75' : '#9FE1CB'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


