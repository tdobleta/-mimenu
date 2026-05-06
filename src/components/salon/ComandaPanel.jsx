import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { money, elapsedMin, fmtTableTime, tableTotal } from '@/lib/fmt';
import CloseTableModal from './CloseTableModal';
import { dbAddTurnItem, dbUpdateTurnItem } from '@/lib/posApi';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';

const CATS = ['Entradas','Principales','Postres','Bebidas'];
const BADGE = { ocupada:['#E8F7F2','#1D9E75'], demorada:['#FEE2E2','#EF4444'], reservada:['#DBEAFE','#3B82F6'] };

export default function ComandaPanel({ table, branchId, onClose, addToast }) {
  const store = useStore();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [cat, setCat] = useState('Principales');
  const [showClose, setShowClose] = useState(false);
  const [freeMode, setFreeMode] = useState(false);
  const [freeForm, setFreeForm] = useState({ nombre:'', precio:'', qty:1 });
  const [showPreCuenta, setShowPreCuenta] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [enviandoCocina, setEnviandoCocina] = useState(false);
  const [yaEnviado, setYaEnviado] = useState(false);

  useEffect(() => { setYaEnviado(false); }, [table.turnId]);

  // Polling de 15s para detectar cambios de otro usuario en la misma mesa
  useEffect(() => {
    if (!table.turnId) return;
    const interval = setInterval(async () => {
      try {
        // Verificar comanda_lista en el Turn
        const turns = await base44.entities.Turn.filter({ id: table.turnId }).catch(() => []);
        const turn = turns?.[0];
        if (turn?.comanda_lista !== undefined) {
          store.setTableComandaLista(branchId, table.id, !!turn.comanda_lista);
        }

        // Sincronizar ítems
        const items = await base44.entities.TurnItem.filter({ turn_id: table.turnId });
        if (!items || items.length === 0) return;
        const serverOrder = items.map(it => ({
          itemId: it.menu_item_id || null,
          nombre: it.menu_item_name,
          precio: it.precio,
          qty: it.cantidad,
          turnItemId: it.id,
          libre: !it.menu_item_id,
        }));
        const localIds = (table.order || []).map(i => i.turnItemId).sort().join(',');
        const serverIds = serverOrder.map(i => i.turnItemId).sort().join(',');
        const localQtys = (table.order || []).map(i => `${i.turnItemId}:${i.qty}`).sort().join(',');
        const serverQtys = serverOrder.map(i => `${i.turnItemId}:${i.qty}`).sort().join(',');
        if (localIds !== serverIds || localQtys !== serverQtys) {
          store.updateTableOrder(branchId, table.id, serverOrder);
        }
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
    } catch(err) {
      console.error(err);
      addToast('Error al enviar a cocina — revisá tu conexión', 'error');
    } finally {
      setEnviandoCocina(false);
    }
  }
  const menuItems = store.getMenuItems(branchId).filter(i => i.categoria === cat && i.disponible);
  const order = table.order || [];
  const total = tableTotal(order);
  const elapsed = table.openedAt ? elapsedMin(table.openedAt) : 0;
  const [bg,col] = BADGE[table.status] || ['#F3F4F6','#6B7280'];

  function addItem(item) {
    // Buscar por turnItemId si existe (más preciso), sino por itemId
    const ex = order.find(i => i.itemId === item.id && !i.libre);
    const next = ex
      ? order.map(i => (i.itemId === item.id && !i.libre) ? { ...i, qty:i.qty+1 } : i)
      : [...order, { itemId:item.id, nombre:item.nombre, precio:item.precio, qty:1 }];
    store.updateTableOrder(branchId, table.id, next);
    const onDbError = () => addToast('El ítem se agregó al pedido pero no se guardó en el servidor. Revisá tu conexión.', 'warning');
    if (table.turnId) {
      try {
        if (ex) {
          const updated = next.find(i => i.itemId === item.id && !i.libre);
          if (ex.turnItemId) dbUpdateTurnItem(ex.turnItemId, updated.qty).catch(onDbError);
        } else {
          dbAddTurnItem({ turnId: table.turnId, branchId, menuItemId: item.id, nombre: item.nombre, precio: item.precio, qty: 1 })
            .then(ti => store.setOrderItemTurnItemId(branchId, table.id, item.id, ti.id))
            .catch(onDbError);
        }
      } catch(e) {
        onDbError();
      }
    }
  }
  function changeQty(itemId, d, turnItemId) {
    const orderItem = turnItemId
      ? order.find(i => i.turnItemId === turnItemId)
      : order.find(i => i.itemId === itemId);
    if (!orderItem) return;
    const next = order.map(i =>
      (turnItemId ? i.turnItemId === turnItemId : i.itemId === itemId && i.turnItemId === orderItem.turnItemId)
        ? { ...i, qty:i.qty+d }
        : i
    ).filter(i => i.qty > 0);
    store.updateTableOrder(branchId, table.id, next);
    if (orderItem?.turnItemId) dbUpdateTurnItem(orderItem.turnItemId, orderItem.qty + d).catch(()=>{});
  }

  if (showPreCuenta) {
    const now = new Date();
    const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaStr = `${dias[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]} · ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    return (
      <div style={{ width:340, flexShrink:0, display:'flex', flexDirection:'column', backgroundColor:'white', borderLeft:'0.5px solid rgba(0,0,0,0.08)', overflow:'hidden', height:'100%' }}>
        {/* Header */}
        <div style={{ padding:'10px 14px', borderBottom:'0.5px solid rgba(0,0,0,0.08)', flexShrink:0 }}>
          <button onClick={() => setShowPreCuenta(false)} style={{ fontSize:12, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:6 }}>← Volver</button>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#111827' }}>Pre-cuenta</div>
            <div style={{ fontSize:13, color:'#9CA3AF', marginTop:2 }}>Mesa {table.num}</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', marginBottom:12 }}>{fechaStr}</div>
          <div style={{ height:'0.5px', backgroundColor:'rgba(0,0,0,0.08)', marginBottom:12 }} />
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {order.map(item => (
              <div key={item.itemId} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', minWidth:0 }}>
                  <span style={{ fontSize:13, color:'#374151' }}>{item.nombre} × {item.qty}</span>
                  {item.libre && <span style={{ backgroundColor:'#FFEDD5', color:'#F97316', padding:'1px 6px', borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:'0.3px' }}>LIBRE</span>}
                </div>
                <span style={{ fontSize:13, fontWeight:700, color:'#111827', whiteSpace:'nowrap' }}>{money(item.precio * item.qty)}</span>
              </div>
            ))}
          </div>
          <div style={{ height:'1px', backgroundColor:'rgba(0,0,0,0.12)', margin:'14px 0' }} />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', letterSpacing:'0.8px' }}>TOTAL</span>
            <span style={{ fontSize:24, fontWeight:700, color:'#1D9E75' }}>{money(total)}</span>
          </div>
          <div style={{ fontSize:11, color:'#9CA3AF', textAlign:'center', marginTop:10 }}>Vista previa · No es comprobante fiscal</div>
        </div>

        {/* Footer */}
        <div style={{ padding:12, borderTop:'0.5px solid rgba(0,0,0,0.08)', display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={() => setShowPreCuenta(false)}
            style={{ flex:1, padding:'8px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>
            Volver al pedido
          </button>
          <button onClick={() => { setShowPreCuenta(false); setShowClose(true); }}
            style={{ flex:1, padding:'8px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>
            Cobrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width:340, flexShrink:0, display:'flex', flexDirection:'column', backgroundColor:'white', borderLeft:'0.5px solid rgba(0,0,0,0.08)', overflow:'hidden', height:'100%' }}>
      {/* Header */}
      <div style={{ padding:'10px 14px', borderBottom:'0.5px solid rgba(0,0,0,0.08)', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <button onClick={onClose} style={{ color:'#6B7280', background:'none', border:'none', cursor:'pointer', padding:0, display:'flex' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ fontSize:15, fontWeight:600, color:'#111827' }}>Mesa {table.num}</span>
        <span style={{ backgroundColor:bg, color:col, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>{table.status}</span>
        <div style={{ flex:1 }} />
        <button style={{ fontSize:12, color:'#F97316', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Transferir</button>
      </div>
      {(table.mozo || table.openedAt) && (
        <div style={{ padding:'6px 14px', borderBottom:'0.5px solid rgba(0,0,0,0.08)', display:'flex', gap:12, flexShrink:0 }}>
          {table.mozo    && <span style={{ fontSize:12, color:'#6B7280' }}>Mozo: <strong>{table.mozo}</strong></span>}
          {table.openedAt && <span style={{ fontSize:12, color:'#6B7280' }}>hace <strong>{fmtTableTime(elapsed)}</strong></span>}
        </div>
      )}

      {!freeMode && (
        <>
          {/* Category tabs */}
          <div style={{ display:'flex', borderBottom:'0.5px solid rgba(0,0,0,0.08)', flexShrink:0 }}>
            {CATS.map(c => (
              <button key={c} onClick={() => setCat(c)}
                style={{ flex:1, padding:'8px 0', fontSize:11, fontWeight:500, cursor:'pointer', background:'none', border:'none', borderBottom: cat===c ? '2px solid #1D9E75' : '2px solid transparent', color: cat===c ? '#1D9E75' : '#9CA3AF', transition:'all .15s' }}>
                {c}
              </button>
            ))}
          </div>

          {/* Menu browser */}
          <div style={{ padding:10, maxHeight:230, overflowY:'auto', flexShrink:0 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {menuItems.map(item => (
                <button key={item.id} onClick={() => addItem(item)}
                  style={{ padding:10, border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:8, textAlign:'left', cursor:'pointer', backgroundColor:'white', transition:'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor='#F0FBF7'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor='white'}>
                  <div style={{ fontSize:12, fontWeight:500, color:'#111827', lineHeight:'14px', marginBottom:3 }}>{item.nombre}</div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#1D9E75' }}>{money(item.precio)}</div>
                </button>
              ))}
              {menuItems.length === 0 && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'16px 0', fontSize:12, color:'#9CA3AF' }}>Sin ítems en esta categoría</div>}
            </div>
            <div style={{ height:'0.5px', backgroundColor:'rgba(0,0,0,0.06)', margin:'10px 0' }} />
            <button onClick={() => { setFreeMode(true); setFreeForm({ nombre:'', precio:'', qty:1 }); }}
              style={{ width:'100%', padding:10, border:'1.5px dashed rgba(0,0,0,0.15)', borderRadius:8, backgroundColor:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, color:'#9CA3AF', fontSize:13 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              + Ítem libre
            </button>
          </div>
        </>
      )}

      {freeMode && (
        <div style={{ padding:14, borderBottom:'0.5px solid rgba(0,0,0,0.08)', flexShrink:0, display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Ítem libre</div>
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>Para productos fuera de carta</div>
          </div>
          <div>
            <div style={{ fontSize:11, color:'#6B7280', marginBottom:3 }}>Descripción</div>
            <input value={freeForm.nombre} onChange={e=>setFreeForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Porción especial del chef"
              style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div>
              <div style={{ fontSize:11, color:'#6B7280', marginBottom:3 }}>Precio</div>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#6B7280' }}>$</span>
                <input type="number" value={freeForm.precio} onChange={e=>setFreeForm(f=>({...f,precio:e.target.value}))} placeholder="0"
                  style={{ width:'100%', padding:'7px 10px 7px 22px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:'#6B7280', marginBottom:3 }}>Cantidad</div>
              <div style={{ display:'flex', alignItems:'center', gap:4, border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, padding:'2px 4px' }}>
                <button onClick={()=>setFreeForm(f=>({...f,qty:Math.max(1,(f.qty||1)-1)}))} style={{ width:24, height:24, border:'none', background:'none', cursor:'pointer', fontSize:15, color:'#6B7280' }}>−</button>
                <input type="number" value={freeForm.qty} onChange={e=>setFreeForm(f=>({...f,qty:Math.max(1,Number(e.target.value)||1)}))}
                  style={{ flex:1, minWidth:0, textAlign:'center', border:'none', outline:'none', fontSize:13, fontWeight:600, padding:'5px 0' }} />
                <button onClick={()=>setFreeForm(f=>({...f,qty:(f.qty||1)+1}))} style={{ width:24, height:24, border:'none', background:'none', cursor:'pointer', fontSize:15, color:'#6B7280' }}>+</button>
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, marginTop:2 }}>
            <button onClick={()=>setFreeMode(false)}
              style={{ flex:1, padding:'7px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:12, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>Cancelar</button>
            <button
              onClick={() => {
                const nombre = freeForm.nombre.trim();
                const precio = Number(freeForm.precio) || 0;
                const qty = Math.max(1, Number(freeForm.qty) || 1);
                if (!nombre || precio <= 0) return;
                const itemId = 'libre_' + Date.now();
                const next = [...(order||[]), { itemId, nombre, precio, qty, libre:true }];
                store.updateTableOrder(branchId, table.id, next);
                if (table.turnId) {
                  dbAddTurnItem({ turnId: table.turnId, branchId, menuItemId: null, nombre, precio, qty })
                    .then(ti => store.setOrderItemTurnItemId(branchId, table.id, itemId, ti.id))
                    .catch(()=>{});
                }
                addToast('Ítem agregado al pedido', 'success');
                setFreeMode(false);
              }}
              style={{ flex:1, padding:'7px 0', border:'none', borderRadius:7, fontSize:12, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>Agregar al pedido</button>
          </div>
        </div>
      )}

      {/* Order */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 12px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', letterSpacing:'0.8px', margin:'8px 0', textTransform:'uppercase' }}>Pedido actual</div>
        {order.length === 0
          ? <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'20px 0' }}>Agregá ítems desde el menú</div>
          : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {order.map(item => (
                <div key={item.turnItemId || item.itemId} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:500, color:'#111827', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span>{item.nombre}</span>
                      {item.libre && <span style={{ backgroundColor:'#FFEDD5', color:'#F97316', padding:'1px 6px', borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:'0.3px' }}>LIBRE</span>}
                    </div>
                    <div style={{ fontSize:11, color:'#9CA3AF' }}>{money(item.precio)} c/u</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:2, border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:99, padding:'2px 2px' }}>
                    <button onClick={() => changeQty(item.itemId, -1, item.turnItemId)} style={{ width:22, height:22, border:'none', background:'none', cursor:'pointer', fontSize:15, color:'#6B7280', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                    <span style={{ fontSize:12, fontWeight:600, minWidth:18, textAlign:'center' }}>{item.qty}</span>
                    <button onClick={() => changeQty(item.itemId, 1, item.turnItemId)} style={{ width:22, height:22, border:'none', background:'none', cursor:'pointer', fontSize:15, color:'#6B7280', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#111827', minWidth:60, textAlign:'right' }}>{money(item.precio*item.qty)}</div>
                </div>
              ))}
            </div>
        }
      </div>

      {/* Footer */}
      <div style={{ padding:12, borderTop:'0.5px solid rgba(0,0,0,0.08)', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Total</span>
          <span style={{ fontSize:20, fontWeight:700, color:'#1D9E75' }}>{money(total)}</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={enviarCocina} disabled={enviandoCocina}
            style={{ flex:1, padding:'8px 0', border: yaEnviado ? '0.5px solid #1D9E75' : '0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color: enviandoCocina ? '#9CA3AF' : '#1D9E75', backgroundColor: yaEnviado ? '#F0FBF7' : 'white', cursor: enviandoCocina?'not-allowed':'pointer', fontWeight:500, opacity: enviandoCocina?0.6:1, transition:'all .15s' }}>
            {enviandoCocina ? 'Enviando...' : (yaEnviado ? '✓ En cocina' : '→ Enviar a cocina')}
          </button>
          {order.length > 0 && (
            <button onClick={() => setShowPreCuenta(true)} disabled={cerrando}
              style={{ flex:1, padding:'8px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor: cerrando?'not-allowed':'pointer', opacity: cerrando?0.6:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Pre-cuenta
            </button>
          )}
          <button onClick={() => setShowClose(true)} disabled={cerrando}
            style={{ flex:1, padding:'8px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor: cerrando?'not-allowed':'pointer', opacity: cerrando?0.6:1, transition:'all .15s' }}>
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

            // Guardia 1: caja abierta obligatoria
            if (!store.turnoActivo) {
              addToast('No hay turno de caja abierto. Abrí la caja antes de cerrar mesas.', 'error');
              setCerrando(false);
              return;
            }

            // Guardia 2: anti-doble-ejecución
            if (table.turnId) {
              const currentTurn = await base44.entities.Turn.filter({ id: table.turnId }).catch(() => []);
              if (currentTurn && currentTurn[0]?.status === 'cerrada') {
                addToast('Esta mesa ya fue cerrada.', 'warning');
                store.closeTable(branchId, table.id);
                setShowClose(false);
                onClose();
                setCerrando(false);
                return;
              }
            }

            const cajaShiftId = store.turnoActivo.id;

            try {
              if (table.turnId) {
                await base44.entities.Turn.update(table.turnId, {
                  status: 'cerrada',
                  closed_at: Date.now(),
                  total_facturado: finalTotal,
                  descuento: discAmount || 0,
                  propina: propinaAmount || 0,
                  metodo_pago: method,
                  mozo: table.mozo || '',
                  ...(cajaShiftId ? { caja_shift_id: cajaShiftId } : {}),
                });
              } else {
                const turn = await base44.entities.Turn.create({
                  branch_id: branchId,
                  mesa_num: table.num,
                  status: 'cerrada',
                  opened_at: table.openedAt || Date.now(),
                  closed_at: Date.now(),
                  total_facturado: finalTotal,
                  descuento: discAmount || 0,
                  propina: propinaAmount || 0,
                  metodo_pago: method,
                  mozo: table.mozo || '',
                  ...(cajaShiftId ? { caja_shift_id: cajaShiftId } : {}),
                });
                const items = table.order || [];
                await Promise.all(items.map(item =>
                  base44.entities.TurnItem.create({
                    turn_id: turn.id,
                    branch_id: branchId,
                    menu_item_name: item.nombre,
                    menu_item_id: item.itemId,
                    cantidad: item.qty,
                    precio: item.precio,
                  })
                ));
              }

              store.closeTable(branchId, table.id);

              // Actualizar cache de caja con el nuevo total — la verdad sigue siendo SUM(Turn)
              // pero el cache permite mostrar el total en tiempo real sin query extra
              try {
                // Recalcular desde DB para evitar race condition con múltiples usuarios
                const turnsActualizados = await base44.entities.Turn.filter({
                  caja_shift_id: cajaShiftId,
                  status: 'cerrada',
                }).catch(() => []);
                const nuevoTotal = (turnsActualizados || []).reduce((a, t) => a + (t.total_facturado || 0) + (t.propina || 0), 0);
                await base44.entities.CajaShift.update(cajaShiftId, {
                  total_facturado_turno: nuevoTotal,
                });
                store.setTurnoActivo({ ...store.turnoActivo, totalCache: nuevoTotal });
              } catch(e) {
                // Si falla el cache no es crítico — el cierre de turno recalcula desde Turns reales
                console.warn('Cache caja no actualizado:', e);
              }

              setShowClose(false);
              onClose();

              const detalle = [
                `Mesa ${table.num}`,
                money(finalTotal),
                method,
                discAmount > 0 ? `desc. ${money(discAmount)}${discMotivo ? ` (${discMotivo})` : ''}` : null,
                propinaAmount > 0 ? `propina ${money(propinaAmount)}` : null,
              ].filter(Boolean).join(' · ');

              store.logAccion({
                usuario: user?.email || 'Sistema',
                rol: userRole,
                categoria: 'Salón',
                accion: 'Mesa cerrada',
                detalle,
                sucursal: store.sucursales.find(s => s.id === branchId)?.nombre || '',
              });

              addToast(
                `Mesa ${table.num} cerrada · ${money(finalTotal)} · ${method}${propinaAmount > 0 ? ` + propina ${money(propinaAmount)}` : ''}`,
                'success'
              );

              if (store.refreshCharts) store.refreshCharts();
            } catch(err) {
              console.error('Error al cerrar la mesa:', err);
              addToast('Error al cerrar la mesa. El pedido sigue activo — intentá de nuevo.', 'error');
            } finally {
              setCerrando(false);
            }
          }}
        />
      )}
    </div>
  );
}


