import { useMemo } from 'react';
import moment from 'moment';

export default function TopProducts({ turnItems }) {
  const products = useMemo(() => {
    const weekStart = moment().startOf('isoWeek').format('YYYY-MM-DD');
    const weekItems = turnItems.filter(ti => ti.created_date >= weekStart);
    
    const map = {};
    weekItems.forEach(ti => {
      const name = ti.menu_item_name || 'Producto';
      map[name] = (map[name] || 0) + (ti.cantidad || 0);
    });

    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));
  }, [turnItems]);

  const max = products.length > 0 ? products[0].qty : 1;

  return (
    <div className="bg-white p-[16px_18px]" style={{ border: '0.5px solid hsl(var(--border))', borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Top 5 esta semana</div>
      {products.length === 0 ? (
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.35)', textAlign: 'center', padding: '20px 0' }}>
          Sin datos para el período seleccionado
        </div>
      ) : (
        <div className="space-y-2.5">
          {products.map(p => (
            <div key={p.name} style={{ marginBottom: 10 }}>
              <div className="flex justify-between" style={{ fontSize: 12 }}>
                <span>{p.name}</span>
                <span style={{ color: 'rgba(0,0,0,0.4)' }}>{p.qty} uds</span>
              </div>
              <div style={{ height: 4, backgroundColor: 'var(--color-background-secondary)', borderRadius: 2, marginTop: 4 }}>
                <div style={{ height: '100%', width: `${(p.qty / max) * 100}%`, backgroundColor: '#1D9E75', borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


