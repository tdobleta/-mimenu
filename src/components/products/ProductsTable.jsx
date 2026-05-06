import { formatCurrency, formatPercent } from '@/lib/utils-format';

export default function ProductsTable({ products }) {
  return (
    <div className="bg-white p-[18px_20px]" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
      <table className="w-full">
        <thead>
          <tr style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            <th className="text-left pb-2 font-normal">Producto</th>
            <th className="text-right pb-2 font-normal">Unidades</th>
            <th className="text-right pb-2 font-normal">% del total</th>
            <th className="text-right pb-2 font-normal">Tendencia</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p.name} style={{ borderBottom: '0.5px solid hsl(var(--border))', fontSize: 13 }}>
              <td className="py-2.5">{p.name}</td>
              <td className="py-2.5 text-right">{p.qty}</td>
              <td className="py-2.5 text-right" style={{ color: 'rgba(0,0,0,0.5)' }}>{Math.round(p.pct)}%</td>
              <td className="py-2.5 text-right">
                <span style={{ color: p.change >= 0 ? '#1D9E75' : '#DC3545', fontSize: 12 }}>
                  {p.change >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(p.change), false)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


