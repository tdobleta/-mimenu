import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { money, stockStatus } from '@/lib/fmt';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';

const ST_BADGE = {
  ok:         { bg:'#E8F7F2', c:'#1D9E75',  label:'OK'         },
  bajo:       { bg:'#FEF9C3', c:'#CA8A04',  label:'Bajo stock'  },
  'sin stock':{ bg:'#FEE2E2', c:'#EF4444',  label:'Sin stock'   },
};

export default function Stock() {
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [editId, setEditId]   = useState(null);
  const [editVals, setEditVals] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ nombre:'', unidad:'kg', actual:'', minimo:'' });
  const [delConfirm, setDelConfirm] = useState(null);
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresoForm, setEgresoForm] = useState({ ingredienteId:'', ingredienteNombre:'', cantidad:'', motivo:'Consumo interno', motivoCustom:'' });
  const [egresoUnidad, setEgresoUnidad] = useState('');
  const [egresoSaving, setEgresoSaving] = useState(false);

  const stock = store.getStock();
  const charts = store.getCharts();
  const activeBranch = store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id;
  const showSucursalCol = store.branchId === 'todas';

  function startEdit(it) { setEditId(it.id); setEditVals({ actual:it.actual, minimo:it.minimo }); }
  async function saveEdit(it) {
    const bid = it.sucursalId || activeBranch;
    try {
      await base44.entities.StockItem.update(it.id, {
        actual: Number(editVals.actual),
        minimo: Number(editVals.minimo),
      });
      store.updateStockItem(bid, it.id, { actual: Number(editVals.actual), minimo: Number(editVals.minimo) });
      setEditId(null);
      addToast('Stock actualizado', 'success');
    } catch(err) {
      console.error(err);
      addToast('Error al actualizar stock', 'error');
    }
  }
  async function addItem() {
    if (!newItem.nombre.trim()) return;
    try {
      const created = await base44.entities.StockItem.create({
        branch_id: activeBranch,
        nombre: newItem.nombre.trim(),
        unidad: newItem.unidad,
        actual: Number(newItem.actual) || 0,
        minimo: Number(newItem.minimo) || 0,
      });
      store.addStockItem(activeBranch, {
        id: created.id,
        nombre: created.nombre,
        unidad: created.unidad,
        actual: created.actual ?? 0,
        minimo: created.minimo ?? 0,
      });
      setNewItem({ nombre: '', unidad: 'kg', actual: '', minimo: '' });
      setShowAdd(false);
      addToast('Ingrediente agregado', 'success');
    } catch(err) {
      console.error(err);
      addToast('Error al agregar ingrediente', 'error');
    }
  }
  async function doDelete(it) {
    try {
      await base44.entities.StockItem.delete(it.id);
      store.deleteStockItem(it.sucursalId || activeBranch, it.id);
      setDelConfirm(null);
      addToast('Ingrediente eliminado', 'info');
    } catch(err) {
      console.error(err);
      addToast('Error al eliminar ingrediente', 'error');
    }
  }

  function openEgresoModal() {
    setEgresoForm({ ingredienteId:'', ingredienteNombre:'', cantidad:'', motivo:'Consumo interno', motivoCustom:'' });
    setEgresoUnidad('');
    setShowEgresoModal(true);
  }

  function onSelectIngrediente(id) {
    const it = stock.find(s => s.id === id);
    setEgresoForm(f => ({ ...f, ingredienteId: id, ingredienteNombre: it?.nombre || '' }));
    setEgresoUnidad(it?.unidad || '');
  }

  async function confirmarEgreso() {
    if (egresoSaving) return;
    setEgresoSaving(true);
    const it = stock.find(s => s.id === egresoForm.ingredienteId);
    if (!it || !egresoForm.cantidad || Number(egresoForm.cantidad) <= 0) { setEgresoSaving(false); return; }
    if (egresoForm.motivo === 'Otro' && !egresoForm.motivoCustom.trim()) { setEgresoSaving(false); return; }
    const cantidad = Number(egresoForm.cantidad);
    const nuevoStock = Math.max(0, Number(it.actual) - cantidad);
    const bid = it.sucursalId || activeBranch;
    const motivoFinal = egresoForm.motivo === 'Otro' ? egresoForm.motivoCustom : egresoForm.motivo;
    try {
      await base44.entities.StockItem.update(it.id, { actual: nuevoStock });
      store.updateStockItem(bid, it.id, { actual: nuevoStock });
      store.addEgreso(bid, {
        id: 'eg_' + Date.now(),
        ingredienteId: it.id,
        ingredienteNombre: it.nombre,
        cantidad,
        unidad: egresoUnidad,
        motivo: motivoFinal,
        ts: Date.now(),
      });
      store.logAccion({
        usuario: user?.email || 'Sistema',
        rol: userRole,
        categoria: 'Stock',
        accion: 'Egreso registrado',
        detalle: '-' + cantidad + ' ' + egresoUnidad + ' de ' + it.nombre + ' · ' + motivoFinal,
        sucursal: store.sucursales.find(s => s.id === bid)?.nombre || '',
      });
      addToast(`Egreso registrado: -${cantidad} ${egresoUnidad} de ${it.nombre}`, 'success');
      setShowEgresoModal(false);
      setEgresoForm({ ingredienteId:'', cantidad:'', motivo:'Merma', motivoCustom:'' });
      setEgresoSaving(false);
    } catch(err) {
      console.error(err);
      addToast('Error al registrar el egreso', 'error');
      setEgresoSaving(false);
    }
  }

  const egresosBranch = (store.egresos && store.egresos[activeBranch]) || [];
  const egresosOrdenados = [...egresosBranch].sort((a,b) => b.ts - a.ts).slice(0, 15);
  function fmtEgresoTs(ts) {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  const sobrepasa = (() => {
    const it = stock.find(s => s.id === egresoForm.ingredienteId);
    if (!it) return false;
    return Number(egresoForm.cantidad) > Number(it.actual);
  })();

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:20, fontWeight:600, color:'#111827', margin:0 }}>Stock y ventas</h1>
        <button onClick={()=>setShowAdd(v=>!v)} style={{ padding:'7px 14px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>
          + Agregar ingrediente
        </button>
      </div>

      {showAdd && (
        <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:16, display:'flex', flexWrap:'wrap', gap:12, alignItems:'flex-end' }}>
          {[['Nombre','nombre','text',160],['Stock actual','actual','number',100],['Stock mínimo','minimo','number',100]].map(([l,k,t,w])=>(
            <div key={k}>
              <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>{l}</div>
              <input type={t} value={newItem[k]} onChange={e=>setNewItem(n=>({...n,[k]:e.target.value}))} style={{ width:w, padding:'6px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Unidad</div>
            <select value={newItem.unidad} onChange={e=>setNewItem(n=>({...n,unidad:e.target.value}))} style={{ padding:'6px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, backgroundColor:'white' }}>
              {['kg','L','u','g','ml','bot'].map(u=><option key={u}>{u}</option>)}
            </select>
          </div>
          <button onClick={addItem}  style={{ padding:'7px 14px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>Guardar</button>
          <button onClick={()=>setShowAdd(false)} style={{ padding:'7px 14px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>Cancelar</button>
        </div>
      )}

      <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden' }}>
        <div style={{ maxHeight:400, overflowY:'auto', overflowX:'auto' }}>
          <table style={{ width:'100%', tableLayout:'fixed', borderCollapse:'collapse', fontSize:13, minWidth:600 }}>
          <colgroup>
              <col style={{ width:'35%' }} />
              <col style={{ width:'8%' }} />
              <col style={{ width:'12%' }} />
              <col style={{ width:'12%' }} />
              {showSucursalCol && <col style={{ width:130 }} />}
              <col style={{ width:'12%' }} />
              <col style={{ width:'21%' }} />
            </colgroup>
            <thead style={{ position:'sticky', top:0, backgroundColor:'#F9FAFB', zIndex:1 }}>
              <tr>
                {['Ingrediente','Unidad','Stock actual','Stock mínimo',...(showSucursalCol?['Sucursal']:[]),'Estado','Acciones'].map(h=>(
                  <th key={h} style={{ textAlign:'left', padding:'10px 14px', fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'0.5px solid rgba(0,0,0,0.08)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stock.map(it => {
                const st = ST_BADGE[stockStatus(it)];
                return (
                  <tr key={it.id} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding:'10px 14px', fontWeight:500, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.nombre}</td>
                    <td style={{ padding:'10px 14px', color:'#6B7280' }}>{it.unidad}</td>
                    {editId === it.id ? (
                      <>
                        <td style={{ padding:'6px 14px' }}><input type="number" value={editVals.actual} onChange={e=>setEditVals(v=>({...v,actual:e.target.value}))} style={{ width:'100%', padding:'5px 8px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, fontSize:13 }} /></td>
                        <td style={{ padding:'6px 14px' }}><input type="number" value={editVals.minimo} onChange={e=>setEditVals(v=>({...v,minimo:e.target.value}))} style={{ width:'100%', padding:'5px 8px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, fontSize:13 }} /></td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding:'10px 14px', color:'#374151' }}>{it.actual}</td>
                        <td style={{ padding:'10px 14px', color:'#374151' }}>{it.minimo}</td>
                      </>
                    )}
                    {showSucursalCol && <td style={{ padding:'10px 14px', fontSize:12, color:'#6B7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.sucursalNombre}</td>}
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ backgroundColor:st.bg, color:st.c, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>{st.label}</span>
                    </td>
                    <td style={{ padding:'8px 14px' }}>
                      {editId === it.id ? (
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={()=>saveEdit(it)} style={{ padding:'3px 10px', backgroundColor:'#1D9E75', color:'white', border:'none', borderRadius:6, fontSize:12, cursor:'pointer' }}>Guardar</button>
                          <button onClick={()=>setEditId(null)} style={{ padding:'3px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, fontSize:12, cursor:'pointer' }}>Cancelar</button>
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={()=>startEdit(it)} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, fontSize:12, cursor:'pointer', color:'#374151', backgroundColor:'white' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Editar
                          </button>
                          <button onClick={()=>setDelConfirm(it)} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:6, fontSize:12, cursor:'pointer', color:'#EF4444', backgroundColor:'white' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                            Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movimientos de stock */}
      <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, gap:10, flexWrap:'wrap' }}>
          <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Movimientos de stock</div>
          <button onClick={openEgresoModal}
            style={{ padding:'7px 14px', backgroundColor:'#FEF2F2', color:'#EF4444', border:'0.5px solid #FECACA', borderRadius:7, fontSize:13, cursor:'pointer', fontWeight:500 }}>
            Registrar egreso
          </button>
        </div>
        {egresosOrdenados.length === 0 ? (
          <div style={{ textAlign:'center', fontSize:13, color:'#9CA3AF', padding:'24px 0' }}>Sin movimientos registrados</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:520 }}>
              <thead style={{ backgroundColor:'#F9FAFB' }}>
                <tr>
                  {['Fecha / Hora','Ingrediente','Cantidad','Unidad','Motivo'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'9px 12px', fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'0.5px solid rgba(0,0,0,0.08)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {egresosOrdenados.map(eg => (
                  <tr key={eg.id} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding:'9px 12px', color:'#6B7280', whiteSpace:'nowrap' }}>{fmtEgresoTs(eg.ts)}</td>
                    <td style={{ padding:'9px 12px', color:'#111827', fontWeight:500 }}>{eg.ingredienteNombre}</td>
                    <td style={{ padding:'9px 12px', color:'#EF4444', fontWeight:600 }}>−{eg.cantidad}</td>
                    <td style={{ padding:'9px 12px', color:'#6B7280' }}>{eg.unidad}</td>
                    <td style={{ padding:'9px 12px', color:'#374151' }}>{eg.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Egreso modal */}
      {showEgresoModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={()=>setShowEgresoModal(false)}>
          <div style={{ backgroundColor:'white', borderRadius:12, width:400, maxWidth:'95vw', padding:24 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:600, color:'#111827', marginBottom:14 }}>Registrar egreso de stock</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Ingrediente</div>
                <select value={egresoForm.ingredienteId} onChange={e=>onSelectIngrediente(e.target.value)}
                  style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, backgroundColor:'white', boxSizing:'border-box' }}>
                  <option value="">Seleccionar...</option>
                  {stock.map(it => <option key={it.id} value={it.id}>{it.nombre}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Cantidad</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="number" value={egresoForm.cantidad} onChange={e=>setEgresoForm(f=>({...f,cantidad:e.target.value}))} placeholder="0"
                    style={{ flex:1, padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
                  {egresoUnidad && <span style={{ fontSize:13, color:'#9CA3AF', minWidth:30 }}>{egresoUnidad}</span>}
                </div>
                {sobrepasa && (
                  <div style={{ fontSize:12, color:'#F97316', marginTop:6 }}>El egreso supera el stock disponible. El stock quedará en 0.</div>
                )}
              </div>
              <div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Motivo</div>
                <select value={egresoForm.motivo} onChange={e=>setEgresoForm(f=>({...f,motivo:e.target.value}))}
                  style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, backgroundColor:'white', boxSizing:'border-box' }}>
                  <option>Consumo interno</option>
                  <option>Merma / Desperdicio</option>
                  <option>Rotura / Daño</option>
                  <option>Vencimiento</option>
                  <option>Otro</option>
                </select>
              </div>
              {egresoForm.motivo === 'Otro' && (
                <div>
                  <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Descripción</div>
                  <input value={egresoForm.motivoCustom} onChange={e=>setEgresoForm(f=>({...f,motivoCustom:e.target.value}))} placeholder="Especifique el motivo"
                    style={{ width:'100%', padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:18 }}>
              <button onClick={()=>setShowEgresoModal(false)} style={{ flex:1, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, cursor:'pointer', backgroundColor:'white' }}>Cancelar</button>
              <button onClick={confirmarEgreso} disabled={egresoSaving}
                style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#EF4444', cursor: egresoSaving ? 'not-allowed' : 'pointer', opacity: egresoSaving ? 0.6 : 1 }}>
                {egresoSaving ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top products */}
      <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:20 }}>
        <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginBottom:14 }}>Productos más vendidos</div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {charts.topProducts.map(p => (
            <div key={p.nombre} style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:13, color:'#374151', minWidth:180 }}>{p.nombre}</span>
              <div style={{ flex:1, height:6, backgroundColor:'#F3F4F6', borderRadius:99, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${(p.unidades/charts.topProducts[0].unidades)*100}%`, backgroundColor:'#1D9E75', borderRadius:99 }} />
              </div>
              <span style={{ fontSize:12, color:'#9CA3AF', minWidth:100, textAlign:'right' }}>{p.unidades} uds · {money(p.monto)}</span>
            </div>
          ))}
        </div>
      </div>

      {delConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={()=>setDelConfirm(null)}>
          <div style={{ backgroundColor:'white', borderRadius:10, padding:24, width:320 }} onClick={e=>e.stopPropagation()}>
            <p style={{ fontSize:14, color:'#111827', marginBottom:4 }}>¿Eliminar <strong>{delConfirm.nombre}</strong>?</p>
            <p style={{ fontSize:12, color:'#9CA3AF', marginBottom:16 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setDelConfirm(null)} style={{ flex:1, padding:'9px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, cursor:'pointer' }}>Cancelar</button>
              <button onClick={()=>doDelete(delConfirm)} style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#EF4444', cursor:'pointer' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


