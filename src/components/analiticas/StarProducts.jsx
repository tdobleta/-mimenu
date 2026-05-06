import { useMemo } from 'react';
import { money } from '@/lib/fmt';

export default function StarProducts({ periodItems }) {
  const products = useMemo(() => {
    const map = {};
    periodItems.forEach(it => {
      const key = it.menu_item_name || 'Sin nombre';
      if (!map[key]) map[key] = { nombre: key, unidades: 0, monto: 0 };
      map[key].unidades += it.cantidad || 0;
      map[key].monto += (it.cantidad || 0) * (it.precio || 0);
    });
    const list = Object.values(map).map(p => ({
      ...p,
      precioProm: p.unidades > 0 ? p.monto / p.unidades : 0,
    }));

    const byUnits = [...list].sort((a,b) => b.unidades - a.unidades).slice(0, 3).map(p => p.nombre);
    const byMoney = [...list].sort((a,b) => b.monto - a.monto).slice(0, 3).map(p => p.nombre);
    const topUnits = new Set(byUnits);
    const topMoney = new Set(byMoney);

    return list
      .map(p => {
        let badge = null;
        const inU = topUnits.has(p.nombre);
        const inM = topMoney.has(p.nombre);
        if (inU && inM) badge = { label:'★ Estrella', bg:'#E8F7F2', color:'#1D9E75' };
        else if (inU) badge = { label:'Popular', bg:'#FEF9C3', color:'#CA8A04' };
        else if (inM) badge = { label:'Premium', bg:'#DBEAFE', color:'#3B82F6' };
        return { ...p, badge };
      })
      .sort((a,b) => b.monto - a.monto)
      .slice(0, 10);
  }, [periodItems]);

  const maxMonto = products[0]?.monto || 1;

  return (
    <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'18px 20px' }}>
      <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginBottom:6 }}>Ingeniería de menú — Qué vendés y cuánto ganás</div>
      <div style={{ fontSize:12, color:'#6B7280', marginBottom:16, lineHeight:'18px' }}>
        Los productos marcados con ★ son los más vendidos Y los que más ingresos generan. Son tus productos estrella.
      </div>
      {products.length === 0 ? (
        <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'24px 0' }}>Sin productos vendidos en este período.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {products.map(p => (
            <div key={p.nombre} style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ flex:'0 0 180px', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:13, fontWeight:500, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nombre}</span>
                {p.badge && (
                  <span style={{ backgroundColor:p.badge.bg, color:p.badge.color, padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:600, whiteSpace:'nowrap' }}>{p.badge.label}</span>
                )}
              </div>
              <div style={{ flex:1, height:8, backgroundColor:'#F3F4F6', borderRadius:99, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${(p.monto/maxMonto)*100}%`, backgroundColor:'#1D9E75', borderRadius:99 }} />
              </div>
              <div style={{ minWidth:60, textAlign:'right', fontSize:13, color:'#374151' }}>{p.unidades} uds</div>
              <div style={{ minWidth:90, textAlign:'right', fontSize:13, fontWeight:600, color:'#1D9E75' }}>{money(p.monto)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


