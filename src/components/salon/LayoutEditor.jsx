import { useState } from 'react';
import { useStore } from '@/lib/store';

const CANVAS_COLS = 8;
const CANVAS_ROWS = 6;

export default function LayoutEditor({ branchId, onClose, addToast }) {
  const store = useStore();
  const [tables, setTables] = useState(() => JSON.parse(JSON.stringify(store.tables[branchId] || [])));
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addNum, setAddNum] = useState('');
  const [addSillas, setAddSillas] = useState('4');

  const cells = [];
  for (let r = 1; r <= CANVAS_ROWS; r++)
    for (let c = 1; c <= CANVAS_COLS; c++)
      cells.push({ r, c });

  const tableAt = (r, c) => tables.find(t => t.gridRow === r && t.gridCol === c);

  function drop(r, c) {
    if (!dragging) return;
    setTables(prev => prev.map(t => t.id === dragging ? { ...t, gridRow:r, gridCol:c } : t));
    setDragging(null); setDragOver(null);
  }

  function save() {
    const maxCol = Math.max(...tables.map(t => t.gridCol), 1);
    const maxRow = Math.max(...tables.map(t => t.gridRow), 1);
    store.saveLayout(branchId, tables, { cols:maxCol, rows:maxRow });
    addToast('Layout guardado', 'success');
    onClose();
  }

  function addTable() {
    if (!addNum.trim()) return;
    const occupied = new Set(tables.map(t => `${t.gridRow}-${t.gridCol}`));
    let freeCell = null;
    outer: for (let r=1;r<=CANVAS_ROWS;r++) for(let c=1;c<=CANVAS_COLS;c++) {
      if (!occupied.has(`${r}-${c}`)) { freeCell={r,c}; break outer; }
    }
    if (!freeCell) return;
    const id = Math.max(0,...tables.map(t=>t.id))+1;
    setTables(prev => [...prev, { id, num:parseInt(addNum)||0, status:'libre', sillas:parseInt(addSillas)||4, gridCol:freeCell.c, gridRow:freeCell.r, order:[] }]);
    setShowAdd(false); setAddNum(''); setAddSillas('4');
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }}>
      <div style={{ width:'90vw', height:'85vh', backgroundColor:'white', borderRadius:12, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Toolbar */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', borderBottom:'0.5px solid rgba(0,0,0,0.08)', flexShrink:0 }}>
          <span style={{ fontSize:15, fontWeight:600, color:'#111827' }}>Editar layout — {store.sucursales.find(s=>s.id===branchId)?.nombre}</span>
          <div style={{ flex:1 }} />
          <button onClick={() => setShowAdd(v=>!v)}
            style={{ padding:'6px 14px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>
            + Agregar mesa
          </button>
          <button onClick={save}
            style={{ padding:'6px 14px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>
            Guardar layout
          </button>
          <button onClick={onClose} style={{ color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 20px', backgroundColor:'#F0FBF7', flexShrink:0 }}>
            <input value={addNum} onChange={e=>setAddNum(e.target.value)} placeholder="N° mesa"
              style={{ width:80, padding:'5px 8px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, fontSize:13 }} />
            <input type="number" value={addSillas} onChange={e=>setAddSillas(e.target.value)} placeholder="Sillas"
              style={{ width:70, padding:'5px 8px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, fontSize:13 }} />
            <button onClick={addTable} style={{ padding:'5px 12px', backgroundColor:'#1D9E75', color:'white', border:'none', borderRadius:6, fontSize:13, cursor:'pointer' }}>Agregar</button>
            <button onClick={() => setShowAdd(false)} style={{ padding:'5px 12px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, fontSize:13, cursor:'pointer' }}>Cancelar</button>
          </div>
        )}

        {/* Canvas */}
        <div style={{ flex:1, overflow:'auto', padding:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${CANVAS_COLS}, 110px)`, gridTemplateRows:`repeat(${CANVAS_ROWS}, 90px)`, gap:6 }}>
            {cells.map(({r,c}) => {
              const t = tableAt(r,c);
              const isOver = dragOver?.r===r && dragOver?.c===c;
              return (
                <div key={`${r}-${c}`}
                  style={{ border:`1px dashed ${isOver?'#1D9E75':'#E5E7EB'}`, borderRadius:8, backgroundColor:isOver?'#F0FBF7':'transparent', transition:'all .1s', position:'relative' }}
                  onDragOver={e=>{e.preventDefault();setDragOver({r,c});}}
                  onDragLeave={()=>setDragOver(null)}
                  onDrop={()=>drop(r,c)}>
                  {t && (
                    editing?.id === t.id ? (
                      <div style={{ padding:6, display:'flex', flexDirection:'column', gap:4 }} onClick={e=>e.stopPropagation()}>
                        <input value={editing.num} onChange={e=>setEditing(v=>({...v,num:e.target.value}))}
                          style={{ width:'100%', padding:'3px 6px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:5, fontSize:12 }} />
                        <input type="number" value={editing.sillas} onChange={e=>setEditing(v=>({...v,sillas:e.target.value}))}
                          style={{ width:'100%', padding:'3px 6px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:5, fontSize:12 }} />
                        <button onClick={()=>{ setTables(prev=>prev.map(tx=>tx.id===t.id?{...tx,num:parseInt(editing.num)||tx.num,sillas:parseInt(editing.sillas)||tx.sillas}:tx)); setEditing(null); }}
                          style={{ fontSize:11, backgroundColor:'#1D9E75', color:'white', border:'none', borderRadius:4, padding:'2px 0', cursor:'pointer' }}>OK</button>
                      </div>
                    ) : (
                      <div draggable
                        onDragStart={()=>setDragging(t.id)}
                        onDragEnd={()=>{setDragging(null);setDragOver(null);}}
                        onClick={()=>setEditing({id:t.id, num:t.num, sillas:t.sillas})}
                        style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'grab', backgroundColor:'#E8F7F2', border:'1px solid #1D9E75', borderRadius:8, position:'relative' }}>
                        <button onClick={e=>{e.stopPropagation();setTables(prev=>prev.filter(tx=>tx.id!==t.id));}}
                          style={{ position:'absolute', top:4, right:4, width:16, height:16, backgroundColor:'#FEE2E2', color:'#EF4444', border:'none', borderRadius:'50%', fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>✕</button>
                        <span style={{ fontSize:20, fontWeight:700, color:'#1D9E75' }}>{t.num}</span>
                        <span style={{ fontSize:10, color:'#6B7280' }}>{t.sillas} sillas</span>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


