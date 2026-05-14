import { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { money, stockStatus } from '@/lib/fmt';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';
import { G, glass, glassDeep, glassLight, labelStyle, fontDisplay } from '@/lib/glass';
import MenuTab from '../components/config/MenuTab';
import {
  fetchRecetas, saveReceta,
  fetchPrecios, savePrecio,
  fetchEgresos, addEgreso as dbAddEgreso,
} from '@/lib/stockApi';

// ── Colores food cost ─────────────────────────────────────────────────────────
function foodCostColor(pct) {
  if (pct === null) return G.textFaint;
  if (pct < 25) return G.teal;
  if (pct < 35) return G.amber;
  return G.red;
}

const TABS = ['Menú', 'Ingredientes', 'Recetas', 'Food Cost', 'Movimientos'];

const ST_BADGE = {
  ok:          { bg:'rgba(29,158,117,0.10)', c:G.teal,  label:'OK'        },
  bajo:        { bg:'rgba(239,159,39,0.10)', c:G.amber, label:'Bajo stock' },
  'sin stock': { bg:'rgba(226,75,74,0.10)', c:G.red,   label:'Sin stock'  },
};

const UNIDADES = ['kg','g','litro','ml','unidad','docena','caja','porción'];

function Input({ value, onChange, placeholder, type='text', style={} }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ padding:'8px 11px', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(255,255,255,0.65)', borderRadius:9, fontSize:13, color:G.text, outline:'none', width:'100%', boxSizing:'border-box', ...style }} />
  );
}

export default function Stock() {
  const store = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const [tab, setTab] = useState('Menú');
  const [loadingData, setLoadingData] = useState(true);

  // Ingredientes
  const [editId, setEditId]     = useState(null);
  const [editVals, setEditVals] = useState({});
  const [showAdd, setShowAdd]   = useState(false);
  const [newItem, setNewItem]   = useState({ nombre:'', unidad:'kg', actual:'', minimo:'', costo:'', proveedor:'' });
  const [delConfirm, setDelConfirm] = useState(null);
  const [precios, setPrecios]   = useState({});

  // Egresos
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresoForm, setEgresoForm] = useState({ ingredienteId:'', cantidad:'', motivo:'Consumo interno', motivoCustom:'' });
  const [egresoUnidad, setEgresoUnidad] = useState('');
  const [egresoSaving, setEgresoSaving] = useState(false);
  const [egresos, setEgresos] = useState([]);

  // Recetas
  const [recetas, setRecetas]         = useState({});
  const [editRecetaId, setEditRecetaId] = useState(null);
  const [recetaItems, setRecetaItems] = useState([]);
  const [savingReceta, setSavingReceta] = useState(false);

  const stock     = store.getStock();
  const charts    = store.getCharts();
  const menuItems = store.getMenuItems(store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id);
  const activeBranch = store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id;

  // ── Cargar datos desde Supabase al montar ─────────────────────
  useEffect(() => {
    if (!activeBranch) return;
    setLoadingData(true);
    Promise.all([
      fetchRecetas(activeBranch),
      fetchPrecios(activeBranch),
      fetchEgresos(activeBranch, 100),
    ]).then(([rec, prec, egr]) => {
      setRecetas(rec);
      setPrecios(prec);
      setEgresos(egr);
    }).catch(e => {
      console.error('Error cargando datos de stock:', e);
    }).finally(() => {
      setLoadingData(false);
    });
  }, [activeBranch]);

  function startEdit(it) {
    const p = precios[it.id] || {};
    setEditId(it.id);
    setEditVals({ actual:it.actual, minimo:it.minimo, costo: p.costo||'', proveedor: p.proveedor||'' });
  }

  async function saveEdit(it) {
    try {
      await base44.entities.StockItem.update(it.id, { actual:Number(editVals.actual), minimo:Number(editVals.minimo) });
      store.updateStockItem(it.sucursalId||activeBranch, it.id, { actual:Number(editVals.actual), minimo:Number(editVals.minimo) });
      const np = { ...precios, [it.id]: { costo: Number(editVals.costo)||0, proveedor: editVals.proveedor||'' } };
      await savePrecio(it.id, activeBranch, { costo: Number(editVals.costo)||0, proveedor: editVals.proveedor||'' });
      setPrecios(np);
      setEditId(null);
      addToast('Stock actualizado', 'success');
    } catch { addToast('Error al actualizar stock', 'error'); }
  }

  async function addItem() {
    if (!newItem.nombre.trim()) return;
    try {
      const created = await base44.entities.StockItem.create({
        branch_id: activeBranch,
        nombre: newItem.nombre.trim(),
        unidad: newItem.unidad,
        actual: Number(newItem.actual)||0,
        minimo: Number(newItem.minimo)||0,
      });
      store.addStockItem(activeBranch, { id:created.id, nombre:created.nombre, unidad:created.unidad, actual:created.actual??0, minimo:created.minimo??0 });
      if (newItem.costo || newItem.proveedor) {
        await savePrecio(created.id, activeBranch, { costo:Number(newItem.costo)||0, proveedor:newItem.proveedor||'' });
        setPrecios(prev => ({ ...prev, [created.id]: { costo:Number(newItem.costo)||0, proveedor:newItem.proveedor||'' } }));
      }
      setNewItem({ nombre:'', unidad:'kg', actual:'', minimo:'', costo:'', proveedor:'' });
      setShowAdd(false);
      addToast('Ingrediente agregado', 'success');
    } catch { addToast('Error al agregar ingrediente', 'error'); }
  }

  async function doDelete(it) {
    try {
      await base44.entities.StockItem.delete(it.id);
      store.deleteStockItem(it.sucursalId||activeBranch, it.id);
      setDelConfirm(null);
      addToast('Ingrediente eliminado', 'info');
    } catch { addToast('Error al eliminar ingrediente', 'error'); }
  }

  // ── Recetas ───────────────────────────────────────────────────────────────
  function openReceta(menuItem) {
    setEditRecetaId(menuItem.id);
    setRecetaItems(recetas[menuItem.id] ? [...recetas[menuItem.id]] : []);
  }

  function addIngredienteReceta() {
    setRecetaItems(prev => [...prev, { ingredienteId:'', cantidad:'' }]);
  }

  function updateIngredienteReceta(idx, field, val) {
    setRecetaItems(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  function removeIngredienteReceta(idx) {
    setRecetaItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function doSaveReceta() {
    setSavingReceta(true);
    try {
      const valid = recetaItems.filter(r => r.ingredienteId && Number(r.cantidad) > 0);
      await saveReceta(editRecetaId, activeBranch, valid);
      setRecetas(prev => ({ ...prev, [editRecetaId]: valid }));
      setEditRecetaId(null);
      addToast('Receta guardada', 'success');
    } catch {
      addToast('Error al guardar receta', 'error');
    } finally {
      setSavingReceta(false);
    }
  }

  // ── Food Cost calculation ─────────────────────────────────────────────────
  const foodCostData = useMemo(() => {
    return menuItems.map(item => {
      const rec = recetas[item.id];
      if (!rec || rec.length === 0) return { ...item, costo:null, pct:null, margen:null };
      let costo = 0;
      rec.forEach(r => {
        const ing = stock.find(s => s.id === r.ingredienteId);
        const p   = precios[r.ingredienteId];
        if (ing && p?.costo) costo += p.costo * Number(r.cantidad);
      });
      const pct    = item.precio > 0 ? (costo / item.precio * 100) : null;
      const margen = item.precio - costo;
      return { ...item, costo, pct, margen };
    }).sort((a, b) => {
      if (a.pct === null && b.pct === null) return 0;
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      return a.pct - b.pct;
    });
  }, [menuItems, recetas, precios, stock]);

  // ── Egresos ───────────────────────────────────────────────────────────────
  const egresosOrdenados = [...egresos].sort((a,b) => b.ts - a.ts).slice(0, 50);
  const sobrepasa = (() => {
    const it = stock.find(s => s.id === egresoForm.ingredienteId);
    return it && egresoForm.cantidad && Number(egresoForm.cantidad) > Number(it.actual);
  })();

  function fmtTs(ts) {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  async function confirmarEgreso() {
    if (egresoSaving) return;
    setEgresoSaving(true);
    const it = stock.find(s => s.id === egresoForm.ingredienteId);
    if (!it || !egresoForm.cantidad || Number(egresoForm.cantidad) <= 0) { setEgresoSaving(false); return; }
    const cantidad    = Number(egresoForm.cantidad);
    const nuevoStock  = Math.max(0, Number(it.actual) - cantidad);
    const bid         = it.sucursalId || activeBranch;
    const motivoFinal = egresoForm.motivo === 'Otro' ? egresoForm.motivoCustom : egresoForm.motivo;
    try {
      await base44.entities.StockItem.update(it.id, { actual: nuevoStock });
      store.updateStockItem(bid, it.id, { actual: nuevoStock });
      const nuevoEgreso = await dbAddEgreso(bid, {
        ingredienteId: it.id,
        ingredienteNombre: it.nombre,
        cantidad,
        unidad: egresoUnidad,
        motivo: motivoFinal,
        origen: 'manual',
      });
      setEgresos(prev => [nuevoEgreso, ...prev]);
      store.logAccion({ usuario:user?.email||'Sistema', rol:userRole, categoria:'Stock', accion:'Egreso registrado', detalle:`-${cantidad} ${egresoUnidad} de ${it.nombre} · ${motivoFinal}`, sucursal:store.sucursales.find(s=>s.id===bid)?.nombre||'' });
      addToast(`Egreso: -${cantidad} ${egresoUnidad} de ${it.nombre}`, 'success');
      setShowEgresoModal(false);
      setEgresoForm({ ingredienteId:'', cantidad:'', motivo:'Consumo interno', motivoCustom:'' });
    } catch { addToast('Error al registrar egreso', 'error'); }
    setEgresoSaving(false);
  }

  const thStyle = { textAlign:'left', padding:'10px 14px', fontSize:11, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.3)' };
  const tdStyle = { padding:'10px 14px', fontSize:13, color:G.textMid, borderBottom:'1px solid rgba(255,255,255,0.3)' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:G.text, margin:0, fontFamily:fontDisplay, letterSpacing:'-0.02em' }}>Stock y Costos</h1>
        <div style={{ display:'flex', gap:8 }}>
          {tab === 'Ingredientes' && (
            <button onClick={() => setShowAdd(true)} style={{ padding:'8px 18px', background:G.teal, border:'none', borderRadius:11, fontSize:13, fontWeight:700, color:'white', cursor:'pointer', boxShadow:`0 4px 12px rgba(29,158,117,0.25)` }}>
              + Ingrediente
            </button>
          )}
          {tab === 'Movimientos' && (
            <button onClick={() => setShowEgresoModal(true)} style={{ padding:'8px 18px', background:'rgba(226,75,74,0.10)', border:`1px solid rgba(226,75,74,0.3)`, borderRadius:11, fontSize:13, fontWeight:700, color:G.red, cursor:'pointer' }}>
              Registrar egreso
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:12 }}>
        {[
          { label:'Total ingredientes', value: stock.length, color:G.teal },
          { label:'Sin stock',    value: stock.filter(s => stockStatus(s) === 'sin stock').length, color:G.red },
          { label:'Bajo stock',   value: stock.filter(s => stockStatus(s) === 'bajo').length,      color:G.amber },
          { label:'Con receta',   value: menuItems.filter(m => recetas[m.id]?.length > 0).length,  color:G.violet },
        ].map(k => (
          <div key={k.label} style={{ ...glass({ padding:'16px 18px' }) }}>
            <div style={{ ...labelStyle }}>{k.label}</div>
            <div style={{ fontSize:28, fontWeight:700, color:k.color, fontFamily:fontDisplay }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'7px 16px', fontSize:13, fontWeight: tab===t ? 700 : 500, cursor:'pointer', borderRadius:12, border:'none', transition:'all .15s',
            background: tab===t ? 'rgba(255,255,255,0.75)' : 'transparent',
            color: tab===t ? G.teal : G.textFaint,
            boxShadow: tab===t ? '0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)' : 'none',
          }}>{t}</button>
        ))}
      </div>

      {/* ── MENÚ ── */}
      {tab === 'Menú' && <MenuTab />}

      {/* ── INGREDIENTES ── */}
      {tab === 'Ingredientes' && (
        <div style={{ ...glassDeep({ overflow:'hidden', padding:0 }) }}>
          {stock.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 20px', color:G.textFaint, fontSize:13 }}>
              No hay ingredientes cargados. Agregá el primero con el botón de arriba.
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
                <thead>
                  <tr>{['Ingrediente','Unidad','Stock actual','Stock mínimo','Costo unitario','Proveedor','Estado',''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {stock.map(it => {
                    const st  = stockStatus(it);
                    const bdg = ST_BADGE[st] || ST_BADGE.ok;
                    const p   = precios[it.id] || {};
                    return (
                      <tr key={it.id} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{ ...tdStyle, fontWeight:600, color:G.text }}>{it.nombre}</td>
                        <td style={tdStyle}>{it.unidad}</td>
                        {editId === it.id ? (<>
                          <td style={tdStyle}><input type="number" value={editVals.actual} onChange={e=>setEditVals(v=>({...v,actual:e.target.value}))} style={{ width:70, padding:'4px 8px', border:'1px solid rgba(255,255,255,0.6)', background:'rgba(255,255,255,0.7)', borderRadius:7, fontSize:12 }}/></td>
                          <td style={tdStyle}><input type="number" value={editVals.minimo} onChange={e=>setEditVals(v=>({...v,minimo:e.target.value}))} style={{ width:70, padding:'4px 8px', border:'1px solid rgba(255,255,255,0.6)', background:'rgba(255,255,255,0.7)', borderRadius:7, fontSize:12 }}/></td>
                          <td style={tdStyle}><input type="number" value={editVals.costo} onChange={e=>setEditVals(v=>({...v,costo:e.target.value}))} placeholder="0" style={{ width:90, padding:'4px 8px', border:'1px solid rgba(255,255,255,0.6)', background:'rgba(255,255,255,0.7)', borderRadius:7, fontSize:12 }}/></td>
                          <td style={tdStyle}><input value={editVals.proveedor} onChange={e=>setEditVals(v=>({...v,proveedor:e.target.value}))} placeholder="Proveedor" style={{ width:110, padding:'4px 8px', border:'1px solid rgba(255,255,255,0.6)', background:'rgba(255,255,255,0.7)', borderRadius:7, fontSize:12 }}/></td>
                          <td style={tdStyle}></td>
                          <td style={tdStyle}>
                            <div style={{ display:'flex', gap:6 }}>
                              <button onClick={()=>saveEdit(it)} style={{ padding:'4px 12px', background:G.teal, border:'none', borderRadius:7, fontSize:12, color:'white', cursor:'pointer', fontWeight:600 }}>Guardar</button>
                              <button onClick={()=>setEditId(null)} style={{ padding:'4px 10px', background:'rgba(0,0,0,0.06)', border:'none', borderRadius:7, fontSize:12, color:G.textMid, cursor:'pointer' }}>✕</button>
                            </div>
                          </td>
                        </>) : (<>
                          <td style={{ ...tdStyle, fontWeight:600, color: st!=='ok' ? ST_BADGE[st]?.c : G.text }}>{it.actual}</td>
                          <td style={tdStyle}>{it.minimo}</td>
                          <td style={{ ...tdStyle, fontWeight:600, color: p.costo ? G.text : G.textFaint }}>{p.costo ? money(p.costo) : '—'}</td>
                          <td style={tdStyle}>{p.proveedor || '—'}</td>
                          <td style={tdStyle}><span style={{ background:bdg.bg, color:bdg.c, padding:'2px 9px', borderRadius:99, fontSize:11, fontWeight:700 }}>{bdg.label}</span></td>
                          <td style={tdStyle}>
                            <div style={{ display:'flex', gap:6 }}>
                              <button onClick={()=>startEdit(it)} style={{ ...glassLight({ padding:'4px 10px', borderRadius:7, fontSize:12, color:G.textMid, cursor:'pointer', border:'1px solid rgba(255,255,255,0.7)' }) }}>Editar</button>
                              <button onClick={()=>setDelConfirm(it)} style={{ padding:'4px 10px', background:'rgba(226,75,74,0.08)', border:`1px solid rgba(226,75,74,0.2)`, borderRadius:7, fontSize:12, color:G.red, cursor:'pointer' }}>Eliminar</button>
                            </div>
                          </td>
                        </>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RECETAS ── */}
      {tab === 'Recetas' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {editRecetaId ? (() => {
            const menuItem = menuItems.find(m => m.id === editRecetaId);
            return (
              <div style={{ ...glassDeep({ padding:'22px 24px' }) }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
                  <div>
                    <div style={{ fontSize:16, fontWeight:700, color:G.text, fontFamily:fontDisplay }}>{menuItem?.nombre}</div>
                    <div style={{ fontSize:12, color:G.textFaint, marginTop:2 }}>Precio de venta: {money(menuItem?.precio)}</div>
                  </div>
                  <button onClick={() => setEditRecetaId(null)} style={{ color:G.textFaint, background:'none', border:'none', cursor:'pointer', fontSize:20 }}>✕</button>
                </div>

                {recetaItems.map((r, idx) => (
                  <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, marginBottom:10, alignItems:'center' }}>
                    <select value={r.ingredienteId} onChange={e => updateIngredienteReceta(idx, 'ingredienteId', e.target.value)}
                      style={{ padding:'8px 11px', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(255,255,255,0.65)', borderRadius:9, fontSize:13, color:G.text, outline:'none' }}>
                      <option value="">Seleccioná ingrediente...</option>
                      {stock.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.unidad})</option>)}
                    </select>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <input type="number" value={r.cantidad} onChange={e => updateIngredienteReceta(idx, 'cantidad', e.target.value)} placeholder="Cant."
                        style={{ width:90, padding:'8px 11px', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(255,255,255,0.65)', borderRadius:9, fontSize:13, color:G.text, outline:'none' }} />
                      <span style={{ fontSize:12, color:G.textFaint }}>{stock.find(s=>s.id===r.ingredienteId)?.unidad||''}</span>
                    </div>
                    <button onClick={() => removeIngredienteReceta(idx)} style={{ color:G.red, background:'none', border:'none', cursor:'pointer', fontSize:18 }}>✕</button>
                  </div>
                ))}

                <button onClick={addIngredienteReceta} style={{ width:'100%', padding:'9px', border:'1.5px dashed rgba(0,0,0,0.14)', borderRadius:10, background:'transparent', cursor:'pointer', color:G.textFaint, fontSize:13, marginBottom:16 }}>
                  + Agregar ingrediente
                </button>

                {/* Costo calculado */}
                {recetaItems.length > 0 && (() => {
                  let costo = 0;
                  recetaItems.forEach(r => {
                    const p = precios[r.ingredienteId];
                    if (p?.costo && r.cantidad) costo += p.costo * Number(r.cantidad);
                  });
                  const pct = menuItem?.precio > 0 ? (costo / menuItem.precio * 100) : null;
                  return (
                    <div style={{ ...glassLight({ padding:'12px 16px', borderRadius:12, marginBottom:16 }) }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:13, color:G.textMid }}>Costo estimado:</span>
                        <span style={{ fontSize:16, fontWeight:700, color:G.text }}>{money(costo)}</span>
                      </div>
                      {pct !== null && (
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
                          <span style={{ fontSize:13, color:G.textMid }}>Food cost %:</span>
                          <span style={{ fontSize:16, fontWeight:700, color:foodCostColor(pct) }}>{pct.toFixed(1)}%</span>
                        </div>
                      )}
                      {pct === null && costo > 0 && (
                        <div style={{ fontSize:11, color:G.textFaint, marginTop:4 }}>Cargá el precio mayorista de cada ingrediente para ver el food cost %</div>
                      )}
                    </div>
                  );
                })()}

                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => setEditRecetaId(null)} style={{ flex:1, padding:'10px', background:'rgba(0,0,0,0.06)', border:'none', borderRadius:11, fontSize:13, color:G.textMid, cursor:'pointer' }}>Cancelar</button>
                  <button onClick={doSaveReceta} disabled={savingReceta} style={{ flex:2, padding:'10px', background:G.teal, border:'none', borderRadius:11, fontSize:13, fontWeight:700, color:'white', cursor:'pointer', boxShadow:`0 4px 12px rgba(29,158,117,0.25)` }}>
                    Guardar receta
                  </button>
                </div>
              </div>
            );
          })() : (
            <div style={{ ...glassDeep({ overflow:'hidden', padding:0 }) }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>{['Plato','Categoría','Precio venta','Ingredientes','Food Cost %',''].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {menuItems.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(item => {
                    const rec = recetas[item.id] || [];
                    return (
                      <tr key={item.id} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{ ...tdStyle, fontWeight:600, color:G.text }}>{item.nombre}</td>
                        <td style={tdStyle}>{item.categoria}</td>
                        <td style={{ ...tdStyle, fontWeight:600, color:G.teal }}>{money(item.precio)}</td>
                        <td style={tdStyle}>
                          {rec.length === 0 ? <span style={{ color:G.textFaint, fontSize:12 }}>Sin receta</span> : <span style={{ color:G.teal, fontWeight:600 }}>{rec.length} ingrediente{rec.length!==1?'s':''}</span>}
                        </td>
                        <td style={tdStyle}>
                          {(() => {
                            if (rec.length === 0) return <span style={{ color:G.textFaint }}>—</span>;
                            let costo = 0;
                            rec.forEach(r => { const p = precios[r.ingredienteId]; if (p?.costo) costo += p.costo * Number(r.cantidad); });
                            if (costo === 0) return <span style={{ color:G.textFaint, fontSize:12 }}>Sin precios</span>;
                            const pct = item.precio > 0 ? costo/item.precio*100 : null;
                            return pct !== null ? <span style={{ fontWeight:700, color:foodCostColor(pct) }}>{pct.toFixed(1)}%</span> : '—';
                          })()}
                        </td>
                        <td style={tdStyle}>
                          <button onClick={() => openReceta(item)} style={{ ...glassLight({ padding:'5px 14px', borderRadius:9, fontSize:12, fontWeight:600, color:G.teal, cursor:'pointer', border:`1px solid rgba(29,158,117,0.25)` }) }}>
                            {recetas[item.id]?.length > 0 ? 'Editar receta' : 'Crear receta'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── FOOD COST ── */}
      {tab === 'Food Cost' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ ...glassLight({ padding:'12px 18px', borderRadius:14, fontSize:12, color:'#92600A', background:'rgba(239,159,39,0.08)', border:'1px solid rgba(239,159,39,0.2)' }) }}>
            Food cost saludable para gastronomía: <strong>20–35%</strong>. Por encima de 35% el plato pierde margen. Configurá los precios mayoristas en la pestaña Ingredientes.
          </div>

          <div style={{ ...glassDeep({ overflow:'hidden', padding:0 }) }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>{['Plato','Precio venta','Costo ingred.','Margen','Food Cost %','Análisis'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {foodCostData.map(item => (
                  <tr key={item.id} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ ...tdStyle, fontWeight:600, color:G.text }}>{item.nombre}</td>
                    <td style={{ ...tdStyle, fontWeight:600, color:G.teal }}>{money(item.precio)}</td>
                    <td style={tdStyle}>{item.costo !== null ? money(item.costo) : <span style={{ color:G.textFaint }}>—</span>}</td>
                    <td style={{ ...tdStyle, fontWeight:600, color: item.margen !== null ? (item.margen >= 0 ? G.teal : G.red) : G.textFaint }}>
                      {item.margen !== null ? money(item.margen) : '—'}
                    </td>
                    <td style={tdStyle}>
                      {item.pct !== null ? (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, height:6, background:'rgba(0,0,0,0.07)', borderRadius:99, overflow:'hidden', minWidth:60 }}>
                            <div style={{ height:'100%', width:`${Math.min(item.pct, 100)}%`, background:foodCostColor(item.pct), borderRadius:99 }} />
                          </div>
                          <span style={{ fontWeight:700, color:foodCostColor(item.pct), minWidth:40 }}>{item.pct.toFixed(1)}%</span>
                        </div>
                      ) : <span style={{ color:G.textFaint, fontSize:12 }}>Sin datos</span>}
                    </td>
                    <td style={tdStyle}>
                      {item.pct === null ? <span style={{ fontSize:11, color:G.textFaint }}>Crear receta</span>
                        : item.pct < 20 ? <span style={{ fontSize:11, color:G.teal }}>⭐ Muy rentable</span>
                        : item.pct < 30 ? <span style={{ fontSize:11, color:G.teal }}>✓ Saludable</span>
                        : item.pct < 35 ? <span style={{ fontSize:11, color:G.amber }}>⚠ Límite</span>
                        : <span style={{ fontSize:11, color:G.red }}>✗ Alto costo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MOVIMIENTOS ── */}
      {tab === 'Movimientos' && (
        <div style={{ ...glassDeep({ overflow:'hidden', padding:0 }) }}>
          {egresosOrdenados.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 20px', color:G.textFaint, fontSize:13 }}>Sin movimientos registrados</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['Fecha/Hora','Ingrediente','Cantidad','Unidad','Motivo'].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {egresosOrdenados.map(eg => (
                  <tr key={eg.id} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.3)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ ...tdStyle, color:G.textFaint, whiteSpace:'nowrap' }}>{fmtTs(eg.ts)}</td>
                    <td style={{ ...tdStyle, fontWeight:600, color:G.text }}>{eg.ingredienteNombre}</td>
                    <td style={{ ...tdStyle, fontWeight:700, color:G.red }}>−{eg.cantidad}</td>
                    <td style={tdStyle}>{eg.unidad}</td>
                    <td style={tdStyle}>{eg.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── MODAL AGREGAR INGREDIENTE ── */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(15,15,35,0.5)', backdropFilter:'blur(4px)' }} onClick={() => setShowAdd(false)}>
          <div style={{ background:'rgba(255,255,255,0.92)', backdropFilter:'blur(24px)', border:'1px solid rgba(255,255,255,0.85)', boxShadow:'0 24px 64px rgba(60,60,160,0.16)', borderRadius:20, width:440, maxWidth:'95vw', padding:24, fontFamily:"'DM Sans', system-ui, sans-serif" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, color:G.text, fontFamily:fontDisplay, marginBottom:18 }}>Nuevo ingrediente</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <div style={{ ...labelStyle }}>Nombre</div>
                <Input value={newItem.nombre} onChange={v=>setNewItem(n=>({...n,nombre:v}))} placeholder="Ej: Carne vacuna" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <div style={{ ...labelStyle }}>Unidad</div>
                  <select value={newItem.unidad} onChange={e=>setNewItem(n=>({...n,unidad:e.target.value}))}
                    style={{ width:'100%', padding:'8px 11px', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(255,255,255,0.65)', borderRadius:9, fontSize:13, color:G.text, outline:'none' }}>
                    {UNIDADES.map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ ...labelStyle }}>Costo por unidad ($)</div>
                  <Input type="number" value={newItem.costo} onChange={v=>setNewItem(n=>({...n,costo:v}))} placeholder="0" />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <div style={{ ...labelStyle }}>Stock actual</div>
                  <Input type="number" value={newItem.actual} onChange={v=>setNewItem(n=>({...n,actual:v}))} placeholder="0" />
                </div>
                <div>
                  <div style={{ ...labelStyle }}>Stock mínimo</div>
                  <Input type="number" value={newItem.minimo} onChange={v=>setNewItem(n=>({...n,minimo:v}))} placeholder="0" />
                </div>
              </div>
              <div>
                <div style={{ ...labelStyle }}>Proveedor (opcional)</div>
                <Input value={newItem.proveedor} onChange={v=>setNewItem(n=>({...n,proveedor:v}))} placeholder="Carnicería López" />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1, padding:'10px', border:'1px solid rgba(0,0,0,0.10)', borderRadius:12, fontSize:13, color:G.textMid, background:'transparent', cursor:'pointer' }}>Cancelar</button>
              <button onClick={addItem} disabled={!newItem.nombre.trim()} style={{ flex:2, padding:'10px', background:G.teal, border:'none', borderRadius:12, fontSize:13, fontWeight:700, color:'white', cursor:'pointer', boxShadow:`0 4px 12px rgba(29,158,117,0.25)`, opacity: !newItem.nombre.trim()?0.5:1 }}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EGRESO ── */}
      {showEgresoModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(15,15,35,0.5)', backdropFilter:'blur(4px)' }} onClick={()=>setShowEgresoModal(false)}>
          <div style={{ background:'rgba(255,255,255,0.92)', backdropFilter:'blur(24px)', border:'1px solid rgba(255,255,255,0.85)', boxShadow:'0 24px 64px rgba(60,60,160,0.16)', borderRadius:20, width:400, maxWidth:'95vw', padding:24, fontFamily:"'DM Sans', system-ui, sans-serif" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, color:G.text, fontFamily:fontDisplay, marginBottom:18 }}>Registrar egreso</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <div style={{ ...labelStyle }}>Ingrediente</div>
                <select value={egresoForm.ingredienteId} onChange={e=>{const it=stock.find(s=>s.id===e.target.value);setEgresoForm(f=>({...f,ingredienteId:e.target.value}));setEgresoUnidad(it?.unidad||'');}}
                  style={{ width:'100%', padding:'8px 11px', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(255,255,255,0.65)', borderRadius:9, fontSize:13, color:G.text, outline:'none' }}>
                  <option value="">Seleccioná...</option>
                  {stock.map(it=><option key={it.id} value={it.id}>{it.nombre} (stock: {it.actual} {it.unidad})</option>)}
                </select>
              </div>
              <div>
                <div style={{ ...labelStyle }}>Cantidad {egresoUnidad && `(${egresoUnidad})`}</div>
                <Input type="number" value={egresoForm.cantidad} onChange={v=>setEgresoForm(f=>({...f,cantidad:v}))} placeholder="0" />
                {sobrepasa && <div style={{ fontSize:11, color:G.amber, marginTop:4 }}>Supera el stock disponible. Quedará en 0.</div>}
              </div>
              <div>
                <div style={{ ...labelStyle }}>Motivo</div>
                <select value={egresoForm.motivo} onChange={e=>setEgresoForm(f=>({...f,motivo:e.target.value}))}
                  style={{ width:'100%', padding:'8px 11px', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(255,255,255,0.65)', borderRadius:9, fontSize:13, color:G.text, outline:'none' }}>
                  {['Consumo interno','Merma / Desperdicio','Rotura / Daño','Vencimiento','Otro'].map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              {egresoForm.motivo === 'Otro' && (
                <Input value={egresoForm.motivoCustom} onChange={v=>setEgresoForm(f=>({...f,motivoCustom:v}))} placeholder="Especificá el motivo" />
              )}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={()=>setShowEgresoModal(false)} style={{ flex:1, padding:'10px', border:'1px solid rgba(0,0,0,0.10)', borderRadius:12, fontSize:13, color:G.textMid, background:'transparent', cursor:'pointer' }}>Cancelar</button>
              <button onClick={confirmarEgreso} disabled={egresoSaving || !egresoForm.ingredienteId || !egresoForm.cantidad}
                style={{ flex:1, padding:'10px', background:G.red, border:'none', borderRadius:12, fontSize:13, fontWeight:700, color:'white', cursor:'pointer', opacity: (!egresoForm.ingredienteId||!egresoForm.cantidad||egresoSaving)?0.5:1 }}>
                {egresoSaving ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminación */}
      {delConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(15,15,35,0.5)', backdropFilter:'blur(4px)' }} onClick={()=>setDelConfirm(null)}>
          <div style={{ background:'rgba(255,255,255,0.92)', backdropFilter:'blur(24px)', border:'1px solid rgba(255,255,255,0.85)', borderRadius:18, padding:24, width:320, fontFamily:"'DM Sans', system-ui, sans-serif" }} onClick={e=>e.stopPropagation()}>
            <p style={{ fontSize:14, color:G.text, marginBottom:4, fontWeight:600 }}>¿Eliminar <strong>{delConfirm.nombre}</strong>?</p>
            <p style={{ fontSize:12, color:G.textFaint, marginBottom:18 }}>Esta acción no se puede deshacer.</p>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setDelConfirm(null)} style={{ flex:1, padding:'9px', border:'1px solid rgba(0,0,0,0.10)', borderRadius:10, fontSize:13, cursor:'pointer', background:'transparent', color:G.textMid }}>Cancelar</button>
              <button onClick={()=>doDelete(delConfirm)} style={{ flex:1, padding:'9px', border:'none', borderRadius:10, fontSize:13, color:'white', background:G.red, cursor:'pointer', fontWeight:700 }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
