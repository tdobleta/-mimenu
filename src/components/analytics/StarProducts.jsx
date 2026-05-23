import { useMemo } from 'react';
import { money } from '@/lib/fmt';

const FONT_UI = "'DM Sans', system-ui, sans-serif";

// Food cost % → color-code (lower % = mejor margen)
function fcColor(pct) {
  if (pct === null || pct === undefined) return '#94A3B8'; // sin datos
  if (pct < 30)  return '#1D9E75'; // verde  — excelente
  if (pct < 45)  return '#F59E0B'; // amber  — aceptable
  return '#EF4444';                // rojo   — alto costo
}
function fcLabel(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct < 30)  return 'Rentable';
  if (pct < 45)  return 'Aceptable';
  return 'Alto costo';
}

/**
 * @param {Array}  periodItems   — turn items del período
 * @param {Array}  [menuItemsDb] — menu items de la DB (para cruzar con recetas)
 * @param {Object} [stockRecipes]— { [menuItemId]: [{ ingredienteId, cantidad }] }
 * @param {Object} [stockPrecios]— { [stockItemId]: { costo, proveedor } }
 */
export default function StarProducts({ periodItems, menuItemsDb, stockRecipes, stockPrecios }) {
  const hasCostData = menuItemsDb?.length > 0 && stockRecipes && Object.keys(stockRecipes).length > 0;

  // Mapa nombre → menu item (para cruzar items por nombre)
  const nameToItem = useMemo(() => {
    const map = {};
    (menuItemsDb || []).forEach(m => { map[(m.nombre || '').trim().toLowerCase()] = m; });
    return map;
  }, [menuItemsDb]);

  // Agrupar items vendidos por nombre de producto
  const products = useMemo(() => {
    const map = {};
    (periodItems || []).forEach(it => {
      const key = (it.menu_item_name || 'Sin nombre').trim();
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

    return list.map(p => {
      let badge = null;
      const inU = topUnits.has(p.nombre);
      const inM = topMoney.has(p.nombre);
      if (inU && inM) badge = { label:'★ Estrella', bg:'#E8F7F2', color:'#1D9E75' };
      else if (inU)   badge = { label:'Popular',    bg:'#FEF9C3', color:'#CA8A04' };
      else if (inM)   badge = { label:'Premium',    bg:'#DBEAFE', color:'#3B82F6' };
      return { ...p, badge };
    });
  }, [periodItems]);

  // Calcular food cost para cada producto (solo si tenemos datos de stock)
  const productsWithCost = useMemo(() => {
    return products.map(p => {
      if (!hasCostData) return { ...p, foodCostPct: null, foodCost: null };

      const menuItem = nameToItem[p.nombre.trim().toLowerCase()];
      if (!menuItem) return { ...p, foodCostPct: null, foodCost: null };

      const recipe = (stockRecipes || {})[menuItem.id];
      if (!recipe || recipe.length === 0) return { ...p, foodCostPct: null, foodCost: null };

      let cost = 0;
      recipe.forEach(r => {
        const pr = (stockPrecios || {})[r.ingredienteId];
        if (pr?.costo) cost += Number(pr.costo) * Number(r.cantidad);
      });
      if (cost === 0) return { ...p, foodCostPct: null, foodCost: null };

      const precioBase = menuItem.precio || p.precioProm || 0;
      const foodCostPct = precioBase > 0 ? Math.round((cost / precioBase) * 100) : null;
      return { ...p, foodCostPct, foodCost: cost };
    })
    // Con datos: ordenar por margen bruto desc (menor food cost % primero = mejor margen)
    .sort((a, b) => {
      if (hasCostData) {
        // Si ambos tienen datos: menor food cost % primero
        if (a.foodCostPct !== null && b.foodCostPct !== null) return a.foodCostPct - b.foodCostPct;
        if (a.foodCostPct !== null) return -1;
        if (b.foodCostPct !== null) return 1;
      }
      return b.monto - a.monto;
    })
    .slice(0, 12);
  }, [products, hasCostData, nameToItem, stockRecipes, stockPrecios]);

  const maxMonto = Math.max(...productsWithCost.map(p => p.monto), 1);

  return (
    <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', borderRadius:12, padding:'18px 20px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12, gap:12, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:'#111827', fontFamily:FONT_UI }}>
            Ingeniería de menú
          </div>
          <div style={{ fontSize:12, color:'#6B7280', marginTop:2, lineHeight:'18px' }}>
            {hasCostData
              ? 'Productos ordenados por margen. El % de food cost indica qué parte del precio es costo.'
              : 'Los productos con ★ son los más vendidos Y los que más ingresos generan.'}
          </div>
        </div>
        {hasCostData && (
          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            {[['<30%','#E8F7F2','#1D9E75','Rentable'],['30-45%','#FEF3C7','#D97706','Aceptable'],['>45%','#FEE2E2','#EF4444','Alto costo']].map(([rng,bg,c,lbl]) => (
              <div key={rng} style={{ fontSize:10, fontWeight:600, background:bg, color:c, padding:'2px 7px', borderRadius:6 }}>
                {rng} {lbl}
              </div>
            ))}
          </div>
        )}
      </div>

      {productsWithCost.length === 0 ? (
        <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'24px 0' }}>
          Sin productos vendidos en este período.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {productsWithCost.map(p => (
            <div key={p.nombre} style={{ display:'flex', alignItems:'center', gap:10 }}>
              {/* Nombre + badge */}
              <div style={{ flex:'0 0 170px', display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                <span style={{ fontSize:13, fontWeight:500, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:FONT_UI }}>
                  {p.nombre}
                </span>
                {p.badge && (
                  <span style={{ backgroundColor:p.badge.bg, color:p.badge.color, padding:'1px 6px', borderRadius:99, fontSize:9, fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
                    {p.badge.label}
                  </span>
                )}
              </div>

              {/* Barra de volumen */}
              <div style={{ flex:1, height:6, backgroundColor:'#F3F4F6', borderRadius:99, overflow:'hidden', minWidth:40 }}>
                <div style={{ height:'100%', width:`${(p.monto/maxMonto)*100}%`, backgroundColor:'#1D9E75', borderRadius:99, transition:'width 0.3s ease' }} />
              </div>

              {/* Unidades */}
              <div style={{ minWidth:52, textAlign:'right', fontSize:12, color:'#6B7280', fontFamily:FONT_UI }}>
                {p.unidades} uds
              </div>

              {/* Total ventas */}
              <div style={{ minWidth:82, textAlign:'right', fontSize:13, fontWeight:600, color:'#1D9E75', fontFamily:FONT_UI }}>
                {money(p.monto)}
              </div>

              {/* Food cost % — solo si tenemos datos */}
              {hasCostData && (
                <div style={{ minWidth:72, textAlign:'right' }}>
                  {p.foodCostPct !== null ? (
                    <span style={{
                      fontSize:11, fontWeight:700,
                      background: p.foodCostPct < 30 ? '#E8F7F2' : p.foodCostPct < 45 ? '#FEF3C7' : '#FEE2E2',
                      color: fcColor(p.foodCostPct),
                      padding:'2px 7px', borderRadius:6,
                      fontFamily:FONT_UI,
                    }}>
                      {p.foodCostPct}% costo
                    </span>
                  ) : (
                    <span style={{ fontSize:11, color:'#CBD5E1' }}>sin receta</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Leyenda de badges */}
      {!hasCostData && productsWithCost.length > 0 && (
        <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid #F3F4F6', display:'flex', gap:10, flexWrap:'wrap' }}>
          {[
            { label:'★ Estrella', bg:'#E8F7F2', color:'#1D9E75', desc:'Top ventas + Top ingresos' },
            { label:'Popular',    bg:'#FEF9C3', color:'#CA8A04', desc:'Top en unidades vendidas'  },
            { label:'Premium',    bg:'#DBEAFE', color:'#3B82F6', desc:'Top en ingresos totales'   },
          ].map(b => (
            <div key={b.label} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ backgroundColor:b.bg, color:b.color, padding:'1px 7px', borderRadius:99, fontSize:9, fontWeight:700 }}>{b.label}</span>
              <span style={{ fontSize:11, color:'#9CA3AF' }}>{b.desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* Callout: configurar recetas */}
      {!hasCostData && menuItemsDb?.length > 0 && (
        <div style={{ marginTop:12, padding:'10px 14px', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8 }}>
          <div style={{ fontSize:12, color:'#64748B', fontFamily:FONT_UI }}>
            💡 <strong>Tip:</strong> Configurá las recetas en <strong>Stock → Recetas</strong> para ver el food cost % de cada producto.
          </div>
        </div>
      )}
    </div>
  );
}
