import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function ProductsChart({ products }) {
  const data = [...products].reverse();
  const height = Math.max(products.length * 40 + 80, 200);

  return (
    <div className="bg-white p-[18px_20px]" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
          <XAxis type="number" tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.4)' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'rgba(0,0,0,0.6)' }} axisLine={false} tickLine={false} width={80} />
          <Tooltip
            formatter={(v, name, props) => [`${v} uds`, props.payload.name]}
            contentStyle={{ fontSize: 12, borderRadius: 4, border: '0.5px solid #eee' }}
          />
          <Bar dataKey="qty" fill="#1D9E75" radius={[0, 3, 3, 0]} name="Unidades" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


