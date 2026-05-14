import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { money, elapsedMin, fmtTableTime, tableTotal } from '@/lib/fmt';
import CloseTableModal from './CloseTableModal';
import { dbAddTurnItem, dbUpdateTurnItem } from '@/lib/posApi';
import { base44 } from '@/api/base44Client';
import { getPrinterConfig, printComanda } from '@/lib/printer';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';
import { G, glass, glassLight, fontDisplay } from '@/lib/glass';
import FacturaModal from '../facturacion/FacturaModal';
import { getAfipConfig } from '@/lib/afip';
import { base44 as _base44 } from '@/api/base44Client'; // para stock descuento
import { MENU_CATEGORIES, DEFAULT_CATEGORY, getCategoryColor } from '@/lib/menuCategories';
import { fetchRecetas, addEgreso as dbAddEgreso } from '@/lib/stockApi';

// ── Descuento automático de stock al cerrar mesa ──────────────────────────────
async function descontarStockPorMesa(order, branchId, store) {
  try {
    const recetas = await fetchRecetas(branchId);
    if (!recetas || Object.keys(recetas).length === 0) return;
    const stock = store.getStock ? store.getStock() : (store.stock[branchId] || []);
    for (const item of order) {
      const rec = recetas[item.itemId || item.id];
      if (!rec || rec.length === 0) continue;
      for (const r of rec) {
        const ing = stock.find(s => s.id === r.ingredienteId);
        if (!ing) continue;
        const cantidad = Number(r.cantidad) * (item.qty || 1);
        const nuevoStock = Math.max(0, Number(ing.actual) - cantidad);
        try {
          await _base44.entities.StockItem.update(ing.id, { actual: nuevoStock });
          store.updateStockItem(branchId, ing.id, { actual: nuevoStock });
          await dbAddEgreso(branchId, {
            ingredienteId: ing.id,
            ingredienteNombre: ing.nombre,
            cantidad,
            unidad: ing.unidad,
            motivo: `Mesa ${item.mesa || ''} (automático)`,
            origen: 'automatico',
          });
        } catch(e) {}
      }
    }
  } catch(e) {}
}

// Colores para categorías extra no definidas en MENU_CATEGORIES
const EXTRA_COLORS = [G.teal, G.violet, G.blue, G.amber, '#F97316', '#EC4899', '#6366F1', '#14B8A6'];
function getCatColor(cat, allCats) {
  const fromConstants = getCategoryColor(cat);
  if (fromConstants !== '#8B5CF6') return fromConstants; // encontró en constants
  const idx = allCats.indexOf(cat) % EXTRA_COLORS.length;
  return EXTRA_COLORS[idx];
}

const STATUS_BADGE = {
  ocupada:  { bg:'rgba(29,158,117,0.12)',  c:G.teal },
  demorada: { bg:'rgba(226,75,74,0.12)',   c:G.red  },
  reservada:{ bg:'rgba(55,138,221,0.12)',  c:G.blue },
};

export default function ComandaPanel({ table, branchId, onClose, addToast }) {
  const store = useStore();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [cat, setCat] = useState(DEFAULT_CATEGORY);
  const [showClose, setShowClose] = useState(false);
  const [freeMode, setFreeMode] = useState(false);
  const [freeForm, setFreeForm] = useState({ nombre:'', precio:'', qty:1 });
  const [showPreCuenta, setShowPreCuenta] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [enviandoCocina, setEnviandoCocina] = useState(false);
  const [yaEnviado, setYaEnviado] = useState(false);
  const [showFactura, setShowFactura] = useState(false);
const [facturaDatos, setFacturaDatos] = useState(null);

  useEffect(() => { setYaEnviado(false); }, [table.turnId]);

  // Polling 15s
  useEffect(() => {
    if (!table.turnId) return;
    const interval = setInterval(async () => {
      try {
        const turns = await base44.entities.Turn.filter({ id: table.turnId }).catch(() => []);
        const turn = turns?.[0];
        if (turn?.comanda_lista !== undefined) store.setTableComandaLista(branchId, table.id, !!turn.comanda_lista);
        const items = await base44.entities.TurnItem.filter({ turn_id: table.turnId });
        if (!items || items.length === 0) return;
        const serverOrder = items.map(it => ({ itemId:it.menu_item_id||null, nombre:it.menu_item_name, precio:it.precio, qty:it.cantidad, turnItemId:it.id, libre:!it.menu_item_id }));
        const localIds  = (table.order||[]).map(i => i.turnItemId).sort().join(',');
        const serverIds = serverOrder.map(i => i.turnItemId).sort().join(',');
        const localQtys  = (table.order||[]).map(i => `${i.turnItemId}:${i.qty}`).sort().join(',');
        const serverQtys = serverOrder.map(i => `${i.turnItemId}:${i.qty}`).sort().join(',');
        if (localIds !== serverIds || localQtys !== serverQtys) store.updateTableOrder(branchId, table.id, serverOrder);
      } catch(e) {}
    }, 15000);
    return () => clearInterval(interval);
  }, [table.turnId, branchId]);

 async function enviarCocina() {
    if (!table.turnId) {
      addToast('Abrí la mesa antes de enviar a cocina', 'warning');
      return;
    }
    setEnviandoCocina(true);
    try {
      await base44.entities.Turn.update(table.turnId, { enviado_cocina: true });
      setYaEnviado(true);
      addToast('Comanda enviada a cocina ✓', 'success');
      const cfg = getPrinterConfig();
      if (cfg.autoPrintComanda) {
        try {
          await printComanda({
            mesa:  table.num,
            mozo:  table.mozo || '',
            items: (table.order || []).map(it => ({
              nombre: it.nombre,
              qty:    it.qty,
              nota:   it.nota || '',
            })),
          }, cfg);
        } catch (printErr) {
          addToast('Enviado a cocina pero no se pudo imprimir: ' + printErr.message, 'warning');
        }
      }
    } catch(err) {
      addToast('Error al enviar a cocina — revisá tu conexión', 'error');
    } finally {
      setEnviandoCocina(false);
    }
  }

  const allItems = store.getMenuItems(branchId).filter(i => i.disponible !== false);
  // Categorías únicas del menú real (no hardcodeadas)
  const CATS = [...new Set(allItems.map(i => i.categoria).filter(Boolean))];
  // Si no hay categorías custom, usar las por defecto para evitar pantalla vacía
  const cats = CATS.length > 0 ? CATS : MENU_CATEGORIES.map(c => c.nombre);
  // Asegurar que la cat seleccionada es válida
  const activeCat = cats.includes(cat) ? cat : cats[0] || 'Principales';
  const menuItems = allItems.filter(i => i.categoria === activeCat);
  const order = table.order || [];
  const total = tableTotal(order);
  const elapsed = table.openedAt ? elapsedMin(table.openedAt) : 0;
  const badge = STATUS_BADGE[table.status] || { bg:'rgba(0,0,0,0.06)', c:G.textMuted };
  const accentColor = getCatColor(activeCat, cats);

  function addItem(item) {
    const ex = order.find(i => i.itemId === item.id && !i.libre);
    const next = ex
      ? order.map(i => (i.itemId === item.id && !i.libre) ? { ...i, qty:i.qty+1 } : i)
      : [...order, { itemId:item.id, nombre:item.nombre, precio:item.precio, qty:1 }];
    store.updateTableOrder(branchId, table.id, next);
    if (table.turnId) {
      if (ex) {
        const updated = next.find(i => i.itemId === item.id && !i.libre);
        if (ex.turnItemId) dbUpdateTurnItem(ex.turnItemId, updated.qty).catch(() => {
          addToast('No se actualizó la cantidad en el servidor. Revisá conexión.', 'warning');
        });
      } else {
        // Intentar 2 veces antes de mostrar error
        const tryAdd = (retries) => dbAddTurnItem({ turnId:table.turnId, branchId, menuItemId:item.id, nombre:item.nombre, precio:item.precio, qty:1 })
          .then(ti => store.setOrderItemTurnItemId(branchId, table.id, item.id, ti.id))
          .catch(err => {
            if (retries > 0) setTimeout(() => tryAdd(retries - 1), 1500);
            else addToast('Ítem en pedido local pero no guardado. Revisá conexión.', 'warning');
          });
        tryAdd(1);
      }
    }
  }

  function changeQty(itemId, d, turnItemId) {
    const orderItem = turnItemId ? order.find(i => i.turnItemId === turnItemId) : order.find(i => i.itemId === itemId);
    if (!orderItem) return;
    const next = order.map(i =>
      (turnItemId ? i.turnItemId === turnItemId : i.itemId === itemId && i.turnItemId === orderItem.turnItemId)
        ? { ...i, qty:i.qty+d } : i
    ).filter(i => i.qty > 0);
    store.updateTableOrder(branchId, table.id, next);
    if (orderItem?.turnItemId) dbUpdateTurnItem(orderItem.turnItemId, orderItem.qty + d).catch(() => {});
  }

  const panelStyle = {
    width: 320,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(255,255,255,0.60)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    borderLeft: '1px solid rgba(255,255,255,0.7)',
    borderRadius: '0 0 0 0',
    overflow: 'hidden',
    height: '100%',
    boxShadow: '-4px 0 24px rgba(80,80,180,0.07)',
  };

  // PRE-CUENTA
  if (showPreCuenta) {
    const now = new Date();
    const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaStr = `${dias[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]} · ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    return (
      <div style={panelStyle}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.55)', flexShrink:0 }}>
          <button onClick={() => setShowPreCuenta(false)} style={{ fontSize:12, color:G.textFaint, background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:8 }}>← Volver</button>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:16, fontWeight:700, color:G.text, fontFamily:fontDisplay }}>Pre-cuenta</div>
            <div style={{ fontSize:13, color:G.textFaint, marginTop:2 }}>Mesa {table.num}</div>
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          <div style={{ fontSize:11, color:G.textFaint, textAlign:'center', marginBottom:12 }}>{fechaStr}</div>
          <div style={{ height:'0.5px', background:'rgba(0,0,0,0.08)', marginBottom:12 }} />
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {order.map(item => (
              <div key={item.itemId} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', minWidth:0 }}>
                  <span style={{ fontSize:13, color:G.textMid }}>{item.nombre} × {item.qty}</span>
                  {item.libre && <span style={{ background:'rgba(249,115,22,0.12)', color:'#F97316', padding:'1px 6px', borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:'0.3px' }}>LIBRE</span>}
                </div>
                <span style={{ fontSize:13, fontWeight:700, color:G.text, whiteSpace:'nowrap' }}>{money(item.precio * item.qty)}</span>
              </div>
            ))}
          </div>
          <div style={{ height:'1px', background:'rgba(0,0,0,0.10)', margin:'14px 0' }} />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:10, fontWeight:700, color:G.textFaint, letterSpacing:'0.08em', textTransform:'uppercase' }}>Total</span>
            <span style={{ fontSize:26, fontWeight:800, color:G.teal, fontFamily:fontDisplay }}>{money(total)}</span>
          </div>
          <div style={{ fontSize:11, color:G.textFaint, textAlign:'center', marginTop:10 }}>Vista previa · No es comprobante fiscal</div>
        </div>
        <div style={{ padding:12, borderTop:'1px solid rgba(255,255,255,0.55)', display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={() => setShowPreCuenta(false)} style={{ flex:1, padding:'9px 0', ...glassLight({ borderRadius:11, fontSize:13, color:G.textMid, cursor:'pointer', border:'1px solid rgba(255,255,255,0.8)' }) }}>Volver</button>
          <button onClick={() => { setShowPreCuenta(false); setShowClose(true); }} style={{ flex:1, padding:'9px 0', background:G.teal, border:'none', borderRadius:11, fontSize:13, color:'white', cursor:'pointer', fontWeight:700, boxShadow:`0 4px 14px rgba(29,158,117,0.28)` }}>Cobrar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.55)', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <button onClick={onClose} style={{ color:G.textMuted, background:'none', border:'none', cursor:'pointer', padding:0, display:'flex' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ fontSize:15, fontWeight:700, color:G.text, fontFamily:fontDisplay }}>Mesa {table.num}</span>
        <span style={{ background:badge.bg, color:badge.c, padding:'2px 9px', borderRadius:99, fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>{table.status}</span>
        <div style={{ flex:1 }} />
        <button style={{ fontSize:12, color:G.amber, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Transferir</button>
      </div>

      {/* Mozo + tiempo */}
      {(table.mozo || table.openedAt) && (
        <div style={{ padding:'6px 16px', borderBottom:'1px solid rgba(255,255,255,0.45)', display:'flex', gap:12, flexShrink:0 }}>
          {table.mozo    && <span style={{ fontSize:12, color:G.textFaint }}>Mozo: <strong style={{ color:G.textMid }}>{table.mozo}</strong></span>}
          {table.openedAt && <span style={{ fontSize:12, color:G.textFaint }}>hace <strong style={{ color:G.textMid }}>{fmtTableTime(elapsed)}</strong></span>}
        </div>
      )}

      {!freeMode && (
        <>
          {/* Category tabs */}
          <div style={{ display:'flex', gap:2, padding:'8px 10px', flexShrink:0, borderBottom:'1px solid rgba(255,255,255,0.45)' }}>
            {cats.map(c => {
              const cc = getCatColor(c, cats);
              return (
                <button key={c} onClick={() => setCat(c)} style={{
                  flex:1, padding:'6px 2px', fontSize:11, fontWeight:700, cursor:'pointer', border:'none', borderRadius:9, transition:'all .15s',
                  background: activeCat===c ? `${cc}18` : 'transparent',
                  color: activeCat===c ? cc : G.textFaint,
                  boxShadow: activeCat===c ? `inset 0 0 0 1px ${cc}30` : 'none',
                }}>{c}</button>
              );
            })}
          </div>

          {/* Menu grid */}
          <div style={{ padding:10, maxHeight:220, overflowY:'auto', flexShrink:0 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {menuItems.map(item => (
                <button key={item.id} onClick={() => addItem(item)} style={{
                  padding:'10px 10px', border:`1.5px solid ${accentColor}33`, borderRadius:12, textAlign:'left', cursor:'pointer',
                  background:'rgba(255,255,255,0.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)',
                  transition:'all .1s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background=`${accentColor}10`; e.currentTarget.style.borderColor=`${accentColor}66`; }}
                  onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.65)'; e.currentTarget.style.borderColor=`${accentColor}33`; }}>
                  <div style={{ fontSize:12, fontWeight:600, color:G.text, lineHeight:'15px', marginBottom:3 }}>{item.nombre}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:accentColor }}>{money(item.precio)}</div>
                </button>
              ))}
              {menuItems.length === 0 && (
                <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'16px 0', fontSize:12, color:G.textFaint }}>Sin ítems en esta categoría</div>
              )}
            </div>
            <div style={{ height:'0.5px', background:'rgba(0,0,0,0.06)', margin:'10px 0' }} />
            <button onClick={() => { setFreeMode(true); setFreeForm({ nombre:'', precio:'', qty:1 }); }}
              style={{ width:'100%', padding:'9px', border:`1.5px dashed rgba(0,0,0,0.14)`, borderRadius:10, background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, color:G.textFaint, fontSize:12 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              + Ítem libre
            </button>
          </div>
        </>
      )}

      {/* Free mode */}
      {freeMode && (
        <div style={{ padding:14, borderBottom:'1px solid rgba(255,255,255,0.45)', flexShrink:0, display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:G.text }}>Ítem libre</div>
            <div style={{ fontSize:11, color:G.textFaint, marginTop:2 }}>Para productos fuera de carta</div>
          </div>
          <div>
            <div style={{ fontSize:11, color:G.textMuted, marginBottom:3 }}>Descripción</div>
            <input value={freeForm.nombre} onChange={e => setFreeForm(f => ({ ...f, nombre:e.target.value }))} placeholder="Ej: Porción especial del chef"
              style={{ width:'100%', padding:'8px 10px', border:'1px solid rgba(255,255,255,0.7)', background:'rgba(255,255,255,0.6)', borderRadius:9, fontSize:13, boxSizing:'border-box', outline:'none', backdropFilter:'blur(8px)' }} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div>
              <div style={{ fontSize:11, color:G.textMuted, marginBottom:3 }}>Precio</div>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:G.textFaint }}>$</span>
                <input type="number" value={freeForm.precio} onChange={e => setFreeForm(f => ({ ...f, precio:e.target.value }))} placeholder="0"
                  style={{ width:'100%', padding:'8px 10px 8px 22px', border:'1px solid rgba(255,255,255,0.7)', background:'rgba(255,255,255,0.6)', borderRadius:9, fontSize:13, boxSizing:'border-box', outline:'none' }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:G.textMuted, marginBottom:3 }}>Cantidad</div>
              <div style={{ display:'flex', alignItems:'center', gap:4, border:'1px solid rgba(255,255,255,0.7)', background:'rgba(255,255,255,0.6)', borderRadius:9, padding:'2px 4px' }}>
                <button onClick={() => setFreeForm(f => ({ ...f, qty:Math.max(1,(f.qty||1)-1) }))} style={{ width:26, height:26, border:'none', background:'none', cursor:'pointer', fontSize:16, color:G.textMuted }}>−</button>
                <input type="number" value={freeForm.qty} onChange={e => setFreeForm(f => ({ ...f, qty:Math.max(1,Number(e.target.value)||1) }))}
                  style={{ flex:1, minWidth:0, textAlign:'center', border:'none', outline:'none', fontSize:13, fontWeight:700, padding:'5px 0', background:'transparent' }} />
                <button onClick={() => setFreeForm(f => ({ ...f, qty:(f.qty||1)+1 }))} style={{ width:26, height:26, border:'none', background:'none', cursor:'pointer', fontSize:16, color:G.textMuted }}>+</button>
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={() => setFreeMode(false)} style={{ flex:1, padding:'8px 0', ...glassLight({ borderRadius:10, fontSize:12, color:G.textMid, cursor:'pointer', border:'1px solid rgba(255,255,255,0.8)' }) }}>Cancelar</button>
            <button onClick={() => {
              const nombre = freeForm.nombre.trim();
              const precio = Number(freeForm.precio) || 0;
              const qty = Math.max(1, Number(freeForm.qty)||1);
              if (!nombre || precio <= 0) return;
              const itemId = 'libre_' + Date.now();
              const next = [...(order||[]), { itemId, nombre, precio, qty, libre:true }];
              store.updateTableOrder(branchId, table.id, next);
              if (table.turnId) {
                dbAddTurnItem({ turnId:table.turnId, branchId, menuItemId:null, nombre, precio, qty })
                  .then(ti => store.setOrderItemTurnItemId(branchId, table.id, itemId, ti.id))
                  .catch(() => {});
              }
              addToast('Ítem agregado al pedido', 'success');
              setFreeMode(false);
            }} style={{ flex:1, padding:'8px 0', background:G.teal, border:'none', borderRadius:10, fontSize:12, color:'white', cursor:'pointer', fontWeight:700 }}>Agregar</button>
          </div>
        </div>
      )}

      {/* Order list */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 14px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, letterSpacing:'0.08em', margin:'10px 0 8px', textTransform:'uppercase' }}>Pedido actual</div>
        {order.length === 0
          ? <div style={{ fontSize:12, color:G.textFaint, textAlign:'center', padding:'20px 0' }}>Agregá ítems desde el menú</div>
          : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {order.map(item => (
                <div key={item.turnItemId || item.itemId} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,0.4)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:G.text, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span>{item.nombre}</span>
                      {item.libre && <span style={{ background:'rgba(249,115,22,0.12)', color:'#F97316', padding:'1px 6px', borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:'0.3px' }}>LIBRE</span>}
                    </div>
                    <div style={{ fontSize:11, color:G.textFaint }}>{money(item.precio)} c/u</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:2, border:'1px solid rgba(255,255,255,0.7)', background:'rgba(255,255,255,0.5)', borderRadius:99, padding:'2px' }}>
                    <button onClick={() => changeQty(item.itemId, -1, item.turnItemId)} style={{ width:22, height:22, border:'none', background:'none', cursor:'pointer', fontSize:15, color:G.textMuted, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                    <span style={{ fontSize:12, fontWeight:700, minWidth:18, textAlign:'center', color:G.text }}>{item.qty}</span>
                    <button onClick={() => changeQty(item.itemId, 1, item.turnItemId)} style={{ width:22, height:22, border:'none', background:'none', cursor:'pointer', fontSize:15, color:G.textMuted, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, color:G.text, minWidth:60, textAlign:'right' }}>{money(item.precio*item.qty)}</div>
                </div>
              ))}
            </div>
        }
      </div>

      {/* Footer */}
      <div style={{ padding:12, borderTop:'1px solid rgba(255,255,255,0.55)', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <span style={{ fontSize:14, fontWeight:700, color:G.text }}>Total</span>
          <span style={{ fontSize:22, fontWeight:800, color:G.teal, fontFamily:fontDisplay }}>{money(total)}</span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={enviarCocina} disabled={enviandoCocina} style={{
            flex:1, padding:'8px 0',
            border: yaEnviado ? `1px solid ${G.teal}` : '1px solid rgba(255,255,255,0.7)',
            borderRadius:10, fontSize:12, fontWeight:600,
            color: enviandoCocina ? G.textFaint : G.teal,
            background: yaEnviado ? 'rgba(29,158,117,0.10)' : 'rgba(255,255,255,0.55)',
            cursor: enviandoCocina ? 'not-allowed' : 'pointer',
            opacity: enviandoCocina ? 0.6 : 1,
          }}>
            {enviandoCocina ? 'Enviando...' : (yaEnviado ? '✓ En cocina' : '→ Cocina')}
          </button>
          {order.length > 0 && (
            <button onClick={() => setShowPreCuenta(true)} disabled={cerrando} style={{ flex:1, padding:'8px 0', border:'1px solid rgba(255,255,255,0.7)', borderRadius:10, fontSize:12, color:G.textMid, background:'rgba(255,255,255,0.55)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Pre-cuenta
            </button>
          )}
          <button onClick={() => setShowClose(true)} disabled={cerrando} style={{ flex:1, padding:'8px 0', border:'none', borderRadius:10, fontSize:12, fontWeight:700, color:'white', background:G.teal, cursor: cerrando ? 'not-allowed' : 'pointer', opacity: cerrando ? 0.6 : 1, boxShadow:`0 4px 14px rgba(29,158,117,0.28)` }}>
            {cerrando ? 'Cerrando...' : 'Cerrar mesa'}
          </button>
        </div>
      </div>

      {showClose && (
        <CloseTableModal table={table} total={total} branchId={branchId}
          onClose={() => !cerrando && setShowClose(false)}
          onConfirmWithDiscount={async (method, finalTotal, discAmount, discMotivo, propinaAmount) => {
            if (cerrando) return;
            setCerrando(true);
            if (!store.turnoActivo) { addToast('No hay turno de caja abierto. Abrí la caja antes de cerrar mesas.', 'error'); setCerrando(false); return; }
            if (table.turnId) {
              const currentTurn = await base44.entities.Turn.filter({ id: table.turnId }).catch(() => []);
              if (currentTurn && currentTurn[0]?.status === 'cerrada') { addToast('Esta mesa ya fue cerrada.', 'warning'); store.closeTable(branchId, table.id); setShowClose(false); onClose(); setCerrando(false); return; }
            }
            const cajaShiftId = store.turnoActivo.id;
            try {
              if (table.turnId) {
                await base44.entities.Turn.update(table.turnId, { status:'cerrada', closed_at:Date.now(), total_facturado:finalTotal, descuento:discAmount||0, propina:propinaAmount||0, metodo_pago:method, mozo:table.mozo||'', ...(cajaShiftId?{caja_shift_id:cajaShiftId}:{}) });
              } else {
                const turn = await base44.entities.Turn.create({ branch_id:branchId, mesa_num:table.num, status:'cerrada', opened_at:table.openedAt||Date.now(), closed_at:Date.now(), total_facturado:finalTotal, descuento:discAmount||0, propina:propinaAmount||0, metodo_pago:method, mozo:table.mozo||'', ...(cajaShiftId?{caja_shift_id:cajaShiftId}:{}) });
                await Promise.all((table.order||[]).map(item => base44.entities.TurnItem.create({ turn_id:turn.id, branch_id:branchId, menu_item_name:item.nombre, menu_item_id:item.itemId, cantidad:item.qty, precio:item.precio })));
              }
              store.closeTable(branchId, table.id);
              // Descontar stock automáticamente según recetas configuradas
              descontarStockPorMesa(table.order || [], branchId, store).catch(() => {});
              try {
                const turnsActualizados = await base44.entities.Turn.filter({ caja_shift_id:cajaShiftId, status:'cerrada' }).catch(() => []);
                const nuevoTotal = (turnsActualizados||[]).reduce((a,t) => a+(t.total_facturado||0)+(t.propina||0), 0);
                await base44.entities.CajaShift.update(cajaShiftId, { total_facturado_turno:nuevoTotal });
                store.setTurnoActivo({ ...store.turnoActivo, totalCache:nuevoTotal });
              } catch(e) { console.warn('Cache caja no actualizado:', e); }
              setShowClose(false);
const afipCfg = getAfipConfig();
if (afipCfg.habilitado) {
  setFacturaDatos({ mesa:table.num, items:table.order||[], total:finalTotal + (propinaAmount||0), descuento:discAmount||0 });
  setShowFactura(true);
} else {
  onClose();
}
              const detalle = [`Mesa ${table.num}`, money(finalTotal), method, discAmount>0?`desc. ${money(discAmount)}${discMotivo?` (${discMotivo})`:''}`:null, propinaAmount>0?`propina ${money(propinaAmount)}`:null].filter(Boolean).join(' · ');
              store.logAccion({ usuario:user?.email||'Sistema', rol:userRole, categoria:'Salón', accion:'Mesa cerrada', detalle, sucursal:store.sucursales.find(s=>s.id===branchId)?.nombre||'' });
              addToast(`Mesa ${table.num} cerrada · ${money(finalTotal)} · ${method}${propinaAmount>0?` + propina ${money(propinaAmount)}`:''}`, 'success');
              if (store.refreshCharts) store.refreshCharts();
            } catch(err) {
              console.error('Error al cerrar la mesa:', err);
              addToast('Error al cerrar la mesa. El pedido sigue activo — intentá de nuevo.', 'error');
            } finally { setCerrando(false); }
          }}
        />
      )}
      {showFactura && facturaDatos && (
        <FacturaModal
          mesa={facturaDatos.mesa}
          items={facturaDatos.items}
          total={facturaDatos.total}
          descuento={facturaDatos.descuento}
          onClose={() => { setShowFactura(false); onClose(); }}
        />
      )}
    </div>
  );
}
