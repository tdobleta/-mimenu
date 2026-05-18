import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { supabase } from '@/api/supabaseClient';
import { useToast } from '@/lib/toast';
import { getPrinterConfig, printReceipt, printComanda } from '@/lib/printer';
import { getAfipConfig } from '@/lib/afip';
import FacturaModal from '../components/facturacion/FacturaModal';
import { G } from '@/lib/glass';
import { getCategoryColor } from '@/lib/menuCategories';
import { enqueue } from '@/lib/offlineQueue';
import { useBidirectionalSync } from '@/lib/useBidirectionalSync';

function cc(cat) { return getCategoryColor(cat); }
function fmt(n) { return '$'+Number(n||0).toLocaleString('es-AR',{maximumFractionDigits:0}); }
function fmtTime(ts) {
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const m = Math.floor((Date.now()-ms)/60000);
  if (m < 60) return m+'m';
  return Math.floor(m/60)+'h '+m%60+'m';
}

function ModModal({ item, onConfirm, onClose }) {
  const [sel, setSel] = useState({});
  const [nota, setNota] = useState('');
  const mods = item.modificadores || [];
  function toggle(gi, op, tipo) {
    setSel(prev => {
      const cur = prev[gi] || [];
      if (tipo==='unico') return {...prev,[gi]:[op]};
      const ex = cur.find(o=>o.label===op.label);
      return {...prev,[gi]: ex ? cur.filter(o=>o.label!==op.label) : [...cur,op]};
    });
  }
  const extra = Object.values(sel).flat().reduce((s,o)=>s+(o.precio||0),0);
  const SUGERIDAS = ['Sin sal','Sin cebolla','Bien cocido','Jugoso','Sin gluten'];
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(8px)'}}>
      <div style={{background:'rgba(255,255,255,0.95)',backdropFilter:'blur(20px)',borderRadius:20,width:460,maxHeight:'85vh',display:'flex',flexDirection:'column',border:'1px solid rgba(255,255,255,0.8)',boxShadow:'0 32px 64px rgba(0,0,0,0.3)'}}>
        <div style={{padding:'20px 24px 14px',borderBottom:'1px solid rgba(0,0,0,0.08)',display:'flex',justifyContent:'space-between',alignItems:'start'}}>
          <div>
            <div style={{fontSize:17,fontWeight:700,color:G.text}}>{item.nombre}</div>
            <div style={{fontSize:13,color:G.teal,marginTop:2}}>{fmt(item.precio)}</div>
          </div>
          <button onClick={onClose} style={{background:'rgba(0,0,0,0.06)',border:'none',borderRadius:8,color:G.textMuted,width:32,height:32,cursor:'pointer',fontSize:18}}>x</button>
        </div>
        <div style={{flex:1,overflow:'auto',padding:'16px 24px'}}>
          {mods.length===0
            ? <div style={{color:G.textFaint,fontSize:13,textAlign:'center',padding:'16px 0'}}>Sin modificadores configurados</div>
            : mods.map((g,gi)=>(
              <div key={gi} style={{marginBottom:18}}>
                <div style={{fontSize:13,fontWeight:600,color:G.text,marginBottom:8}}>{g.nombre}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
                  {(g.opciones||[]).map((op,oi)=>{
                    const obj = typeof op==='string'?{label:op,precio:0}:op;
                    const active = (sel[gi]||[]).find(o=>o.label===obj.label);
                    return (
                      <button key={oi} onClick={()=>toggle(gi,obj,g.tipo)} style={{padding:'7px 13px',borderRadius:9,cursor:'pointer',background:active?cc(item.categoria)+'22':'rgba(0,0,0,0.04)',border:active?'1.5px solid '+cc(item.categoria):'1px solid rgba(0,0,0,0.1)',color:active?cc(item.categoria):G.textMid,fontSize:13,fontWeight:active?700:400}}>
                        {obj.label}{obj.precio>0&&<span style={{marginLeft:5,fontSize:11}}>+{fmt(obj.precio)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          }
          <div style={{marginTop:4}}>
            <div style={{fontSize:13,fontWeight:600,color:G.text,marginBottom:8}}>Nota para cocina</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
              {SUGERIDAS.map(s=>(
                <button key={s} onClick={()=>setNota(p=>p?p+', '+s:s)} style={{padding:'5px 10px',borderRadius:8,fontSize:11,background:'rgba(0,0,0,0.05)',border:'1px solid rgba(0,0,0,0.1)',color:G.textMuted,cursor:'pointer'}}>{s}</button>
              ))}
            </div>
            <textarea value={nota} onChange={e=>setNota(e.target.value)} placeholder="Instruccion personalizada..." rows={2} style={{width:'100%',padding:'9px 12px',background:'rgba(0,0,0,0.05)',border:'1px solid rgba(0,0,0,0.1)',borderRadius:10,color:G.text,fontSize:13,resize:'none',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
          </div>
        </div>
        <div style={{padding:'14px 24px',borderTop:'1px solid rgba(0,0,0,0.08)'}}>
          {extra>0&&<div style={{fontSize:12,color:G.teal,marginBottom:8,textAlign:'right'}}>Extras: +{fmt(extra)}</div>}
          <button onClick={()=>onConfirm({sel,nota,extra})} style={{width:'100%',padding:'13px',background:G.teal,border:'none',borderRadius:12,color:'white',fontSize:15,fontWeight:700,cursor:'pointer'}}>
            Agregar -- {fmt(item.precio+extra)}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotaModal({ item, onConfirm, onClose }) {
  const [nota, setNota] = useState(item.nota||'');
  const S = ['Sin sal','Sin cebolla','Bien cocido','Jugoso','Sin gluten','Sin lactosa'];
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(8px)'}}>
      <div style={{background:'rgba(255,255,255,0.95)',backdropFilter:'blur(20px)',borderRadius:18,width:380,border:'1px solid rgba(255,255,255,0.8)',padding:22,boxShadow:'0 24px 48px rgba(0,0,0,0.2)'}}>
        <div style={{fontSize:15,fontWeight:700,color:G.text,marginBottom:3}}>{item.nombre}</div>
        <div style={{fontSize:11,color:G.textFaint,marginBottom:14}}>Nota para cocina</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>
          {S.map(s=><button key={s} onClick={()=>setNota(p=>p?p+', '+s:s)} style={{padding:'5px 9px',borderRadius:7,fontSize:11,background:'rgba(0,0,0,0.05)',border:'1px solid rgba(0,0,0,0.1)',color:G.textMuted,cursor:'pointer'}}>{s}</button>)}
        </div>
        <textarea value={nota} onChange={e=>setNota(e.target.value)} rows={2} style={{width:'100%',padding:'9px 11px',background:'rgba(0,0,0,0.05)',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,color:G.text,fontSize:13,resize:'none',outline:'none',boxSizing:'border-box',fontFamily:'inherit',marginBottom:14}}/>
        <div style={{display:'flex',gap:9}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',background:'rgba(0,0,0,0.05)',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,color:G.textMid,cursor:'pointer',fontSize:13}}>Cancelar</button>
          <button onClick={()=>onConfirm(nota)} style={{flex:2,padding:'10px',background:G.teal,border:'none',borderRadius:9,color:'white',fontWeight:700,cursor:'pointer',fontSize:13}}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function CobroModal({ total, onConfirm, onClose }) {
  const [pagos, setPagos] = useState([{metodo:null,monto:''}]);
  const [propinaPct, setPropinaPct] = useState(0);
  const [propinaCustom, setPropinaCustom] = useState('');
  const [divPartes, setDivPartes] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  const propinaAmt = propinaCustom ? Number(propinaCustom) : Math.round(total*propinaPct/100);
  const totalFinal = total + propinaAmt;
  const totalPagado = pagos.reduce((s,p)=>s+(Number(p.monto)||0),0);
  const restante = Math.max(0, totalFinal - totalPagado);
  const puedeConfirmar = restante<=0 && pagos.every(p=>p.metodo) && pagos.some(p=>Number(p.monto)>0);

  function setM(i,m){setPagos(p=>p.map((x,j)=>j===i?{...x,metodo:m}:x));}
  function setV(i,v){setPagos(p=>p.map((x,j)=>j===i?{...x,monto:v}:x));}
  function addPago(){setPagos(p=>[...p,{metodo:null,monto:''}]);setActiveIdx(pagos.length);}
  function remPago(i){if(pagos.length===1)return;setPagos(p=>p.filter((_,j)=>j!==i));setActiveIdx(Math.max(0,activeIdx-1));}

  const NUMPAD=['7','8','9','4','5','6','1','2','3','REST','0','X'];
  function numClick(n){
    const cur=pagos[activeIdx]?.monto||'';
    if(n==='X'){setV(activeIdx,cur.slice(0,-1));return;}
    if(n==='REST'){setV(activeIdx,String(Math.max(0,Math.round(restante+(Number(cur)||0)))));return;}
    setV(activeIdx,(cur+n).replace(/^0+(\d)/,'$1'));
  }

  const METODOS=[{id:'Efectivo',icon:'$'},{id:'Tarjeta',icon:'[]'},{id:'MercadoPago',icon:'MP'},{id:'Transferencia',icon:'TF'}];
  const TIPS=[0,10,15,20];

  async function confirmar(){
    if(!puedeConfirmar||saving)return;
    setSaving(true);
    const pagosF=pagos.map(p=>({metodo:p.metodo,monto:Number(p.monto)}));
    await onConfirm({pagos:pagosF,metodo:pagos.length===1?pagos[0].metodo:'Mixto',total:totalFinal,propina:propinaAmt});
    setSaving(false);
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,15,35,0.7)',zIndex:150,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(10px)'}}>
      <div style={{background:'rgba(255,255,255,0.93)',backdropFilter:'blur(24px)',border:'1px solid rgba(255,255,255,0.85)',borderRadius:22,width:820,maxHeight:'92vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 32px 80px rgba(60,60,160,0.18)',fontFamily:"'DM Sans',system-ui,sans-serif"}}>
        <div style={{padding:'20px 26px 16px',borderBottom:'1px solid rgba(0,0,0,0.07)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:11,color:G.textFaint,letterSpacing:2,textTransform:'uppercase',marginBottom:3}}>Total a cobrar</div>
            <div style={{fontSize:38,fontWeight:800,color:G.text,letterSpacing:-1,fontFamily:"'Playfair Display',Georgia,serif"}}>{fmt(totalFinal)}</div>
            {propinaAmt>0&&<div style={{fontSize:12,color:G.teal,marginTop:3}}>Incluye propina {fmt(propinaAmt)}</div>}
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div>
              <div style={{fontSize:10,color:G.textFaint,marginBottom:5,textAlign:'center'}}>PROPINA</div>
              <div style={{display:'flex',gap:4}}>
                {TIPS.map(p=>(
                  <button key={p} onClick={()=>{setPropinaPct(p);setPropinaCustom('');}} style={{padding:'6px 10px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',background:propinaPct===p&&!propinaCustom?G.teal:'rgba(0,0,0,0.05)',border:'none',color:propinaPct===p&&!propinaCustom?'white':G.textMid}}>
                    {p===0?'Sin':p+'%'}
                  </button>
                ))}
                <input value={propinaCustom} onChange={e=>{setPropinaCustom(e.target.value);setPropinaPct(0);}} placeholder="$" style={{width:52,padding:'6px 8px',background:'rgba(0,0,0,0.06)',border:'1px solid rgba(0,0,0,0.08)',borderRadius:7,color:G.text,fontSize:12,outline:'none',textAlign:'center'}}/>
              </div>
            </div>
            <button onClick={onClose} style={{background:'rgba(0,0,0,0.06)',border:'none',borderRadius:9,color:G.textMuted,width:36,height:36,fontSize:19,cursor:'pointer',marginLeft:6}}>x</button>
          </div>
        </div>

        <div style={{display:'flex',flex:1,overflow:'hidden'}}>
          <div style={{width:280,borderRight:'1px solid rgba(0,0,0,0.07)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{display:'flex',gap:5,padding:'12px 14px',flexWrap:'wrap'}}>
              {pagos.map((p,i)=>(
                <button key={i} onClick={()=>setActiveIdx(i)} style={{padding:'5px 10px',borderRadius:7,fontSize:11,fontWeight:600,cursor:'pointer',background:activeIdx===i?'rgba(29,158,117,0.12)':'rgba(0,0,0,0.04)',border:activeIdx===i?'1px solid '+G.teal:'1px solid rgba(0,0,0,0.1)',color:activeIdx===i?G.teal:G.textMuted,display:'flex',alignItems:'center',gap:4}}>
                  {p.metodo?p.metodo.slice(0,4):'#'+(i+1)}
                  {p.monto&&<span style={{color:G.textFaint,fontWeight:400}}> {fmt(p.monto)}</span>}
                  {pagos.length>1&&<span onClick={e=>{e.stopPropagation();remPago(i);}} style={{color:G.red,fontSize:13,marginLeft:2}}>x</span>}
                </button>
              ))}
              <button onClick={addPago} style={{padding:'5px 9px',borderRadius:7,fontSize:11,background:'rgba(0,0,0,0.04)',border:'1px dashed rgba(0,0,0,0.2)',color:G.textMuted,cursor:'pointer'}}>+ Pago</button>
            </div>
            <div style={{padding:'0 14px',display:'flex',flexDirection:'column',gap:6}}>
              <div style={{fontSize:9,color:G.textFaint,textTransform:'uppercase',letterSpacing:2,marginBottom:3}}>Metodo</div>
              {METODOS.map(m=>(
                <button key={m.id} onClick={()=>setM(activeIdx,m.id)} style={{padding:'10px 12px',borderRadius:10,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:9,background:pagos[activeIdx]?.metodo===m.id?G.teal:'rgba(255,255,255,0.7)',border:pagos[activeIdx]?.metodo===m.id?'none':'1px solid rgba(0,0,0,0.09)',transition:'all 0.1s'}}>
                  <span style={{fontSize:13,fontWeight:700,width:28,color:pagos[activeIdx]?.metodo===m.id?'rgba(255,255,255,0.7)':'#9CA3AF'}}>{m.icon}</span>
                  <span style={{fontSize:13,fontWeight:600,color:pagos[activeIdx]?.metodo===m.id?'white':G.textMid}}>{m.id}</span>
                </button>
              ))}
            </div>
            <div style={{padding:'12px 14px',marginTop:'auto',borderTop:'1px solid rgba(0,0,0,0.07)'}}>
              <div style={{fontSize:9,color:G.textFaint,textTransform:'uppercase',letterSpacing:2,marginBottom:7}}>Division por persona</div>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <button onClick={()=>setDivPartes(p=>p===null?2:Math.max(2,p-1))} style={{width:28,height:28,borderRadius:7,background:'rgba(0,0,0,0.06)',border:'none',color:G.text,cursor:'pointer',fontSize:15}}>-</button>
                <span style={{flex:1,textAlign:'center',color:G.text,fontSize:13,fontWeight:600}}>{divPartes?divPartes+' personas':'Off'}</span>
                <button onClick={()=>setDivPartes(p=>p===null?2:p+1)} style={{width:28,height:28,borderRadius:7,background:'rgba(0,0,0,0.06)',border:'none',color:G.text,cursor:'pointer',fontSize:15}}>+</button>
                {divPartes&&<div style={{fontSize:14,color:G.teal,fontWeight:700,minWidth:60,textAlign:'right'}}>{fmt(totalFinal/divPartes)}</div>}
              </div>
            </div>
          </div>

          <div style={{flex:1,display:'flex',flexDirection:'column',padding:'14px 18px',gap:10}}>
            <div style={{background:'rgba(0,0,0,0.04)',borderRadius:13,padding:'13px 16px',border:'1px solid rgba(0,0,0,0.08)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:10,color:G.textFaint,marginBottom:2}}>{pagos[activeIdx]?.metodo||'Selecciona metodo'}</div>
                <div style={{fontSize:30,fontWeight:700,color:pagos[activeIdx]?.monto?G.text:G.textFaint,fontFamily:"'Playfair Display',Georgia,serif"}}>{pagos[activeIdx]?.monto?fmt(pagos[activeIdx].monto):fmt(0)}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:10,color:G.textFaint,marginBottom:2}}>Restante</div>
                <div style={{fontSize:20,fontWeight:700,color:restante===0?G.teal:G.red}}>{restante===0?'OK':fmt(restante)}</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:7,flex:1}}>
              {NUMPAD.map(n=>(
                <button key={n} onClick={()=>numClick(n)} style={{background:n==='REST'?'rgba(29,158,117,0.10)':'rgba(255,255,255,0.8)',border:'1px solid '+(n==='REST'?'rgba(29,158,117,0.25)':'rgba(0,0,0,0.09)'),borderRadius:12,fontSize:n==='REST'?12:22,fontWeight:600,cursor:'pointer',minHeight:52,color:n==='REST'?G.teal:G.text,boxShadow:'0 1px 4px rgba(0,0,0,0.05)'}}>
                  {n==='REST'?'Resto':n}
                </button>
              ))}
            </div>
            {pagos.length>1&&(
              <div style={{borderTop:'1px solid rgba(0,0,0,0.07)',paddingTop:10}}>
                {pagos.map((p,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:G.textMid,padding:'2px 0'}}>
                    <span>{p.metodo||'Pago '+(i+1)}</span><span style={{fontWeight:600}}>{fmt(p.monto)}</span>
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:700,color:G.teal,borderTop:'1px solid rgba(0,0,0,0.07)',paddingTop:6,marginTop:4}}>
                  <span>Total pagado</span><span>{fmt(totalPagado)}</span>
                </div>
              </div>
            )}
            <button onClick={confirmar} disabled={!puedeConfirmar||saving} style={{padding:'15px',borderRadius:14,border:'none',fontSize:15,fontWeight:800,cursor:puedeConfirmar?'pointer':'not-allowed',background:puedeConfirmar?'linear-gradient(135deg,'+G.teal+',#0F6E56)':'rgba(0,0,0,0.06)',color:puedeConfirmar?'white':G.textFaint,boxShadow:puedeConfirmar?'0 8px 24px rgba(29,158,117,0.28)':'none',transition:'all 0.2s'}}>
              {saving?'Procesando...':'Confirmar '+fmt(totalFinal)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MesaSelector({ branchId, onSelect, onDirecta, restaurante }) {
  const navigate = useNavigate();
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data } = await supabase.from('turns').select('*').eq('branch_id',branchId).eq('status','abierta').order('opened_at',{ascending:true});
        setTurns(data||[]);
      } catch(e){}
      setLoading(false);
    }
    if(branchId) load();
    const iv = setInterval(()=>{ if(branchId) load(); },30000);
    return ()=>clearInterval(iv);
  },[branchId]);

  const bgStyle = {position:'fixed',inset:0,background:'linear-gradient(140deg,#eef2ff 0%,#f8fffc 35%,#fdf4ff 70%,#fff8f0 100%)',display:'flex',flexDirection:'column',fontFamily:"'DM Sans',system-ui,sans-serif"};

  return (
    <div style={bgStyle}>
      <div style={{position:'fixed',top:-120,right:-80,width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(127,119,221,0.12) 0%,transparent 70%)',pointerEvents:'none'}}/>
      <div style={{position:'fixed',bottom:-100,left:-60,width:480,height:480,borderRadius:'50%',background:'radial-gradient(circle,rgba(29,158,117,0.10) 0%,transparent 70%)',pointerEvents:'none'}}/>
      <div style={{background:'rgba(255,255,255,0.55)',backdropFilter:'blur(20px)',borderBottom:'1px solid rgba(255,255,255,0.65)',padding:'16px 28px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,position:'relative',zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <button onClick={()=>navigate('/caja')} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',background:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.85)',borderRadius:10,fontSize:13,color:G.textMid,cursor:'pointer',fontWeight:500}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Volver
          </button>
          <div>
            <div style={{fontSize:22,fontWeight:700,color:G.text,fontFamily:"'Playfair Display',Georgia,serif",letterSpacing:'-0.02em'}}>mi<span style={{color:G.teal}}>menu</span> POS</div>
            <div style={{fontSize:12,color:G.textFaint,marginTop:2}}>{restaurante} - Selecciona una mesa para cobrar</div>
          </div>
        </div>
        <button onClick={onDirecta} style={{padding:'10px 20px',background:G.teal,border:'none',borderRadius:12,fontSize:13,fontWeight:700,color:'white',cursor:'pointer',boxShadow:'0 4px 14px rgba(29,158,117,0.28)'}}>
          + Venta directa
        </button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'24px 28px',position:'relative',zIndex:1}}>
        {loading ? (
          <div style={{textAlign:'center',padding:60,color:G.textFaint,fontSize:14}}>Cargando mesas...</div>
        ) : turns.length===0 ? (
          <div style={{textAlign:'center',padding:60}}>
            <div style={{fontSize:48,marginBottom:16}}>restaurante</div>
            <div style={{fontSize:18,fontWeight:700,color:G.text,marginBottom:8}}>No hay mesas abiertas</div>
            <div style={{fontSize:13,color:G.textFaint,marginBottom:24}}>Las mesas se abren desde el Salon</div>
            <button onClick={onDirecta} style={{padding:'10px 24px',background:G.teal,border:'none',borderRadius:12,fontSize:13,fontWeight:700,color:'white',cursor:'pointer'}}>Hacer venta directa</button>
          </div>
        ) : (
          <>
            <div style={{fontSize:13,fontWeight:700,color:G.textFaint,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:16}}>
              {turns.length} mesa{turns.length!==1?'s':''} abierta{turns.length!==1?'s':''}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
              {turns.map(turn=>(
                <button key={turn.id} onClick={()=>onSelect(turn)}
                  style={{background:'rgba(255,255,255,0.6)',backdropFilter:'blur(16px)',border:'1.5px solid '+G.teal+'44',borderRadius:18,padding:'24px 18px',cursor:'pointer',textAlign:'center',transition:'all 0.15s',boxShadow:'0 4px 20px rgba(29,158,117,0.10)',display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                  <div style={{fontSize:38,fontWeight:800,color:G.teal,fontFamily:"'Playfair Display',Georgia,serif",lineHeight:1}}>Mesa {turn.mesa_num}</div>
                  <span style={{fontSize:11,color:G.textFaint,background:'rgba(0,0,0,0.05)',padding:'3px 10px',borderRadius:99}}>{fmtTime(turn.opened_at)}</span>
                  <span style={{fontSize:13,fontWeight:700,color:'white',background:G.teal,padding:'6px 20px',borderRadius:8,marginTop:4}}>Cobrar</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function POSView() {
  const navigate = useNavigate();
  const store = useStore();
  const { addToast } = useToast();
  const branchId = store.branchId!=='todas'?store.branchId:store.sucursales[0]?.id;

  const [selectedTurn, setSelectedTurn] = useState(null);
  const [order, setOrder] = useState([]);

  // ── Sincronización bidireccional al reconectar ────────────
  const handleServerSync = useCallback((turnsWithItems) => {
    // Si hay una mesa seleccionada, actualizar sus ítems con los del servidor
    setSelectedTurn(prev => {
      if (!prev) return prev;
      const serverTurn = turnsWithItems.find(t => t.id === prev.id);
      if (!serverTurn) return prev; // Mesa cerrada por otro, mantener local
      return { ...prev, ...serverTurn };
    });
    setOrder(prev => {
      if (!selectedTurn) return prev;
      const serverTurn = turnsWithItems.find(t => t.id === selectedTurn?.id);
      if (!serverTurn?.items?.length) return prev;
      // Merge: items del servidor + items locales no sincronizados aún
      const serverItemIds = new Set(serverTurn.items.map(i => i.id));
      const localOnlyItems = prev.filter(i => i.turnItemId && !serverItemIds.has(i.turnItemId));
      return [
        ...serverTurn.items.map(i => ({
          uid: i.id, id: i.menu_item_id || i.id,
          nombre: i.menu_item_name, precio: i.precio,
          qty: i.cantidad, nota: i.notas || '',
          sel: {}, extra: 0, turnItemId: i.id,
          categoria: '',
        })),
        ...localOnlyItems,
      ];
    });
  }, [selectedTurn]);

  useBidirectionalSync(branchId, handleServerSync);


  const [loadingOrder, setLoadingOrder] = useState(false);
  const [cat, setCat] = useState('Todo');
  const [q, setQ] = useState('');
  const [showCobro, setShowCobro] = useState(false);
  const [showMod, setShowMod] = useState(null);
  const [showNota, setShowNota] = useState(null);
  const [showFree, setShowFree] = useState(false);
  const [freeN, setFreeN] = useState('');
  const [freeP, setFreeP] = useState('');
  const [showFactura, setShowFactura] = useState(false);
  const [facturaDatos, setFacturaDatos] = useState(null);
  const rtRef = useRef(null);

  const items = store.getMenuItems?store.getMenuItems(branchId):[];
  const cats = ['Todo',...new Set(items.map(i=>i.categoria).filter(Boolean))];
  const filtered = items.filter(i=>{
    const mc=cat==='Todo'||i.categoria===cat;
    const mq=!q||i.nombre.toLowerCase().includes(q.toLowerCase());
    return mc&&mq&&i.disponible!==false&&i.activo!==false;
  }).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const total = order.reduce((s,i)=>s+(i.precio+(i.extra||0))*i.qty,0);

  async function handleSelectTurn(turn) {
    setSelectedTurn(turn);
    setLoadingOrder(true);
    try {
      const {data:its}=await supabase.from('turn_items').select('*').eq('turn_id',turn.id);
      if(its?.length>0){
        setOrder(its.map(it=>({uid:it.id,id:it.menu_item_id||null,nombre:it.menu_item_name,precio:it.precio,extra:0,qty:it.cantidad,nota:it.notas||'',sel:{},turnItemId:it.id,categoria:''})));
      } else { setOrder([]); }

      // Canal por SUCURSAL en lugar de por turno — evita 50 conexiones simultáneas
      if(rtRef.current) supabase.removeChannel(rtRef.current);
      const ch = supabase.channel('pos_branch_'+branchId)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'turn_items',filter:'branch_id=eq.'+branchId},payload=>{
          const it = payload.new;
          // Solo procesar ítems del turno actualmente seleccionado
          if(it.turn_id !== turn.id) return;
          setOrder(prev=>{
            if(prev.find(x=>x.turnItemId===it.id)) return prev;
            return [...prev,{uid:it.id,id:it.menu_item_id||null,nombre:it.menu_item_name,precio:it.precio,extra:0,qty:it.cantidad,nota:it.notas||'',sel:{},turnItemId:it.id,categoria:''}];
          });
        }).subscribe();
      rtRef.current=ch;
    } catch(e){}
    setLoadingOrder(false);
  }

  function handleDirecta(){setSelectedTurn({id:null,mesa_num:null,mozo:'',opened_at:Date.now()});setOrder([]);}

  function handleBack(){
    if(rtRef.current)supabase.removeChannel(rtRef.current);
    setSelectedTurn(null);setOrder([]);setCat('Todo');setQ('');
  }

  useEffect(()=>()=>{if(rtRef.current)supabase.removeChannel(rtRef.current);},[]);

  function handleAdd(item){
    if(item.modificadores?.length>0)setShowMod(item);
    else addToOrder(item,{},'',0);
  }

  async function addToOrder(item,sel,nota,extra){
    const uid=item.id+'_'+Date.now();
    const newItem={uid,id:item.id,nombre:item.nombre,precio:item.precio,extra,qty:1,nota,sel,categoria:item.categoria||''};
    // Optimistic update — UI inmediata
    setOrder(prev=>{
      const noMods=Object.keys(sel).length===0&&!nota;
      if(noMods){const ex=prev.find(i=>i.id===item.id&&!i.nota&&Object.keys(i.sel||{}).length===0);if(ex)return prev.map(i=>i.uid===ex.uid?{...i,qty:i.qty+1}:i);}
      return[...prev,newItem];
    });
    if(selectedTurn?.id){
      const modStr=Object.values(sel).flat().map(o=>o.label||o).join(', ');
      const notaF=[modStr,nota].filter(Boolean).join(' | ');
      const payload={
        turn_id:selectedTurn.id,
        branch_id:branchId,
        menu_item_id:item.id||null,
        menu_item_name:item.nombre,
        cantidad:1,
        precio:item.precio+extra,
        notas:notaF||null,
      };
      if(navigator.onLine){
        try{
          const{data}=await supabase.from('turn_items').insert(payload).select().single();
          if(data)setOrder(prev=>prev.map(i=>i.uid===uid?{...i,turnItemId:data.id}:i));
        }catch(e){
          // Si falla con conexión, encolar para reintento
          await enqueue({ type:'INSERT_TURN_ITEM', ...payload }).catch(()=>{});
        }
      } else {
        // Sin conexión — encolar para cuando vuelva internet
        await enqueue({ type:'INSERT_TURN_ITEM', ...payload }).catch(()=>{});
      }
    }
  }

  function chQty(uid,d){setOrder(p=>p.map(i=>i.uid===uid?{...i,qty:i.qty+d}:i).filter(i=>i.qty>0));}
  function setNotaFn(uid,nota){setOrder(p=>p.map(i=>i.uid===uid?{...i,nota}:i));}

  async function enviarCocina(){
    if(!selectedTurn?.id)return;
    try{
      await supabase.from('turns').update({enviado_cocina:true}).eq('id',selectedTurn.id);
      addToast('Enviado a cocina','success');
      const cfg=getPrinterConfig();
      if(cfg.autoPrintComanda){
        try{await printComanda({mesa:selectedTurn.mesa_num,mozo:selectedTurn.mozo||'',items:order.map(it=>({nombre:it.nombre,qty:it.qty,nota:it.nota||''}))},cfg);}
        catch(e){addToast('No se pudo imprimir comanda: '+e.message,'warning');}
      }
    }catch(e){addToast('Error al enviar a cocina','error');}
  }

  async function handleCobro({pagos,metodo,total:tot,propina}){
    try{
      const cajaId=store.turnoActivo?.id||null;
      let tid=selectedTurn?.id;
      if(!tid){
        const{data,error}=await supabase.from('turns').insert({branch_id:branchId,mesa_num:0,mozo:'',status:'abierta',opened_at:new Date().toISOString(),total_facturado:0,caja_shift_id:cajaId||null}).select().single();
        if(error)throw error;
        tid=data.id;
        for(const item of order){
          const modStr=Object.values(item.sel||{}).flat().map(o=>o.label||o).join(', ');
          const notaF=[modStr,item.nota].filter(Boolean).join(' | ');
          await supabase.from('turn_items').insert({turn_id:tid,branch_id:branchId,menu_item_id:item.id||null,menu_item_name:item.nombre,cantidad:item.qty,precio:item.precio+(item.extra||0),notas:notaF||null});
        }
      }
      // Cierre atómico: lock + update turn + update caja en 1 transacción SQL
      const { data: resultado, error: rpcError } = await supabase.rpc('cerrar_mesa_atomico', {
        p_turn_id: tid,
        p_total: tot,
        p_propina: propina || 0,
        p_metodo: metodo,
        p_mozo: selectedTurn?.mozo || '',
        p_caja_shift_id: cajaId || null,
      });
      if (rpcError) throw rpcError;
      if (!resultado?.ok) {
        if (resultado?.error === 'turno_ya_cerrado') {
          addToast('Esta mesa ya fue cerrada por otro dispositivo.', 'warning');
          setShowCobro(false);
          return;
        }
        throw new Error(resultado?.error || 'Error al cerrar mesa');
      }
      // Actualizar cache de caja desde DB (ya actualizado por la transacción)
      if (cajaId) {
        try {
          const { data: cajaData } = await supabase.from('caja_shifts').select('total_facturado_turno').eq('id', cajaId).single();
          if (cajaData) store.setTurnoActivo({ ...store.turnoActivo, totalCache: cajaData.total_facturado_turno });
        } catch(e) {}
      }
      if(selectedTurn?.id){const tables=store.getTables(branchId);const table=tables.find(t=>t.turnId===selectedTurn.id);if(table)store.closeTable(branchId,table.id);}
      store.refreshCharts&&store.refreshCharts();
      addToast('Cobrado '+fmt(tot),'success');
      setShowCobro(false);
      const pCfg=getPrinterConfig();
      if(pCfg.autoPrintRecibo){
        try{await printReceipt({mesa:selectedTurn?.mesa_num||'Directa',mozo:selectedTurn?.mozo||'',items:order.map(it=>({nombre:it.nombre,precio:it.precio+(it.extra||0),qty:it.qty,nota:it.nota||''})),subtotal:tot-propina,descuento:0,propina,total:tot,metodo},pCfg);}
        catch(e){addToast('No se pudo imprimir: '+e.message,'warning');}
      }
      const aCfg=getAfipConfig();
      if(aCfg.habilitado){
        setFacturaDatos({mesa:selectedTurn?.mesa_num||'Directa',items:order.map(it=>({nombre:it.nombre,precio:it.precio+(it.extra||0),qty:it.qty})),total:tot,descuento:0});
        setShowFactura(true);
      } else { handleBack(); }
    }catch(err){console.error(err);addToast('Error al cobrar','error');}
  }

  if(!selectedTurn){
    return <MesaSelector branchId={branchId} onSelect={handleSelectTurn} onDirecta={handleDirecta} restaurante={store.restaurante?.nombre||'mimenu'}/>;
  }

  return(
    <div style={{position:'fixed',inset:0,background:'linear-gradient(140deg,#eef2ff 0%,#f8fffc 35%,#fdf4ff 70%,#fff8f0 100%)',display:'flex',flexDirection:'column',fontFamily:"'DM Sans','Inter',sans-serif",userSelect:'none'}}>
      <div style={{position:'fixed',top:-120,right:-80,width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(127,119,221,0.10) 0%,transparent 70%)',pointerEvents:'none'}}/>
      <div style={{height:54,background:'rgba(255,255,255,0.55)',backdropFilter:'blur(20px)',borderBottom:'1px solid rgba(255,255,255,0.65)',display:'flex',alignItems:'center',padding:'0 14px',gap:10,flexShrink:0,zIndex:10,position:'relative'}}>
        <button onClick={handleBack} style={{background:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.8)',borderRadius:10,padding:'6px 13px',color:G.textMid,fontSize:13,cursor:'pointer',fontWeight:500}}>Mesas</button>
        {selectedTurn.mesa_num?(
          <div style={{background:'rgba(29,158,117,0.12)',border:'1px solid rgba(29,158,117,0.25)',borderRadius:10,padding:'5px 13px',color:G.teal,fontSize:13,fontWeight:700}}>
            Mesa {selectedTurn.mesa_num}
            {selectedTurn.mozo&&<span style={{fontWeight:400,opacity:0.8,marginLeft:6}}>- {selectedTurn.mozo}</span>}
            <span style={{fontWeight:400,opacity:0.7,marginLeft:6}}>- {fmtTime(selectedTurn.opened_at)}</span>
          </div>
        ):(
          <div style={{background:'rgba(127,119,221,0.10)',border:'1px solid rgba(127,119,221,0.25)',borderRadius:10,padding:'5px 13px',color:G.violet,fontSize:13,fontWeight:700}}>Venta directa</div>
        )}
        <div style={{position:'relative',flex:1,maxWidth:280}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar producto..." style={{width:'100%',padding:'7px 10px',background:'rgba(255,255,255,0.65)',border:'1px solid rgba(255,255,255,0.8)',borderRadius:10,color:G.text,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
        </div>
        <button onClick={()=>setShowFree(true)} style={{background:'rgba(255,255,255,0.65)',border:'1px solid rgba(255,255,255,0.8)',borderRadius:10,padding:'6px 13px',color:G.textMid,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',fontWeight:500}}>+ Item libre</button>
        <div style={{marginLeft:'auto',fontSize:11,color:G.textFaint}}>{store.restaurante?.nombre||'mimenu'}</div>
      </div>

      <div style={{flex:1,display:'flex',overflow:'hidden',position:'relative',zIndex:1}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{display:'flex',gap:6,padding:'10px 12px',overflowX:'auto',flexShrink:0,scrollbarWidth:'none'}}>
            {cats.map(c=>(
              <button key={c} onClick={()=>{setCat(c);setQ('');}} style={{padding:'6px 14px',borderRadius:10,border:'none',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0,background:cat===c?cc(c):cc(c)+'22',color:cat===c?'white':cc(c),fontWeight:cat===c?700:600,fontSize:13,boxShadow:cat===c?'0 4px 10px '+cc(c)+'40':'none',transition:'all 0.12s'}}>
                {c}
              </button>
            ))}
          </div>
          <div style={{flex:1,overflow:'auto',padding:'4px 12px 12px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gridAutoRows:'min-content',gap:9,alignContent:'start',scrollbarWidth:'thin',scrollbarColor:'rgba(0,0,0,0.12) transparent'}}>
            {filtered.length===0&&<div style={{gridColumn:'1/-1',textAlign:'center',padding:36,color:G.textFaint,fontSize:13}}>Sin productos</div>}
            {filtered.map(item=>{
              const c=cc(item.categoria);
              const qty=order.filter(i=>i.id===item.id).reduce((s,i)=>s+i.qty,0);
              const hasImg = !!item.imagen_url;
              return(
                <button key={item.id} onClick={()=>handleAdd(item)} style={{
                  background: hasImg ? 'transparent' : qty>0?c+'18':'rgba(255,255,255,0.65)',
                  backdropFilter: hasImg ? 'none' : 'blur(12px)',
                  border: qty>0 ? '2px solid '+c : '1.5px solid '+c+'44',
                  borderRadius:16, padding:0, cursor:'pointer', textAlign:'left',
                  position:'relative', aspectRatio:'1/1', display:'flex',
                  flexDirection:'column', justifyContent:'flex-end',
                  overflow:'hidden', transition:'all 0.12s',
                  boxShadow: qty>0 ? '0 6px 20px '+c+'30' : '0 2px 10px rgba(0,0,0,0.07)',
                }}>
                  {hasImg && (
                    <img src={item.imagen_url} alt={item.nombre} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', borderRadius:14 }} />
                  )}
                  {hasImg && (
                    <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)', borderRadius:14 }} />
                  )}
                  {qty>0 && (
                    <div style={{ position:'absolute', top:8, right:8, background:c, borderRadius:'50%', width:23, height:23, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'white', zIndex:2 }}>{qty}</div>
                  )}
                  {!hasImg && (
                    <div style={{ padding:'13px 11px', display:'flex', alignItems:'flex-start' }}>
                      <div style={{ display:'inline-block', background:c+'22', borderRadius:6, padding:'2px 7px', fontSize:10, color:c, fontWeight:700, textTransform:'uppercase', letterSpacing:0.4 }}>{item.categoria}</div>
                    </div>
                  )}
                  <div style={{ padding: hasImg ? '0 10px 11px' : '0 11px 13px', position:'relative', zIndex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color: hasImg ? 'white' : G.text, lineHeight:1.3, marginBottom:2, textShadow: hasImg ? '0 1px 4px rgba(0,0,0,0.5)' : 'none' }}>{item.nombre}</div>
                    <div style={{ fontSize:15, fontWeight:800, color: hasImg ? 'white' : c, textShadow: hasImg ? '0 1px 4px rgba(0,0,0,0.5)' : 'none' }}>{fmt(item.precio)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{width:300,background:'rgba(255,255,255,0.55)',backdropFilter:'blur(20px)',borderLeft:'1px solid rgba(255,255,255,0.65)',display:'flex',flexDirection:'column',flexShrink:0}}>
          <div style={{padding:'12px 14px',borderBottom:'1px solid rgba(255,255,255,0.5)'}}>
            <div style={{fontSize:10,color:G.textFaint,textTransform:'uppercase',letterSpacing:2}}>Ticket</div>
            <div style={{fontSize:11,color:G.textFaint,marginTop:1}}>{order.length===0?'Sin items':order.reduce((s,i)=>s+i.qty,0)+' items'}</div>
          </div>
          {loadingOrder?(
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:G.textFaint,fontSize:13}}>Cargando pedido...</div>
          ):(
            <div style={{flex:1,overflow:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(0,0,0,0.12) transparent'}}>
              {order.length===0
                ?<div style={{textAlign:'center',padding:'32px 14px',color:G.textFaint,fontSize:12}}>Toca un producto para agregarlo</div>
                :order.map(item=>{
                  const c=cc(item.categoria);
                  const modL=Object.values(item.sel||{}).flat().map(o=>o.label||o).join(', ');
                  return(
                    <div key={item.uid} style={{padding:'8px 13px',borderBottom:'1px solid rgba(255,255,255,0.4)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                          <button onClick={()=>chQty(item.uid,-1)} style={{width:22,height:22,borderRadius:6,background:'rgba(226,75,74,0.10)',border:'none',color:G.red,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>-</button>
                          <span style={{fontSize:13,fontWeight:700,color:G.text,minWidth:16,textAlign:'center'}}>{item.qty}</span>
                          <button onClick={()=>chQty(item.uid,1)} style={{width:22,height:22,borderRadius:6,background:'rgba(29,158,117,0.10)',border:'none',color:G.teal,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:G.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.nombre}</div>
                          {modL&&<div style={{fontSize:10,color:G.textFaint,marginTop:1}}>{modL}</div>}
                          {item.nota&&<div style={{fontSize:10,color:G.amber,marginTop:1}}>{item.nota}</div>}
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:c}}>{fmt((item.precio+(item.extra||0))*item.qty)}</div>
                          <button onClick={()=>setShowNota(item)} style={{fontSize:10,color:G.textFaint,background:'none',border:'none',cursor:'pointer',padding:'1px 0'}}>{item.nota?'editar nota':'+ nota'}</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}
          <div style={{padding:'10px 13px',borderTop:'1px solid rgba(255,255,255,0.5)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:9}}>
              <span style={{fontSize:13,color:G.textMuted}}>Total</span>
              <span style={{fontSize:24,fontWeight:800,color:G.text,letterSpacing:-0.5,fontFamily:"'Playfair Display',Georgia,serif"}}>{fmt(total)}</span>
            </div>
            <div style={{display:'flex',gap:6,marginBottom:7}}>
              <button onClick={()=>setOrder([])} disabled={order.length===0} style={{flex:1,padding:'8px',background:'rgba(226,75,74,0.07)',border:'1px solid rgba(226,75,74,0.16)',borderRadius:9,color:order.length===0?G.textFaint:G.red,fontSize:11,fontWeight:600,cursor:'pointer'}}>Limpiar</button>
              {selectedTurn?.id&&<button onClick={enviarCocina} style={{flex:1,padding:'8px',background:'rgba(234,179,8,0.08)',border:'1px solid rgba(234,179,8,0.2)',borderRadius:9,color:'#EAB308',fontSize:11,fontWeight:600,cursor:'pointer'}}>Cocina</button>}
            </div>
            {!store.turnoActivo && order.length > 0 && (
              <div style={{background:'rgba(239,159,39,0.10)',border:'1px solid rgba(239,159,39,0.3)',borderRadius:10,padding:'8px 12px',marginBottom:8,fontSize:11,color:'#92600A',fontWeight:600,textAlign:'center'}}>
                ⚠ Abrí el turno de caja antes de cobrar
              </div>
            )}
            <button onClick={()=>setShowCobro(true)} disabled={order.length===0||!store.turnoActivo} style={{width:'100%',padding:'14px',background:order.length===0||!store.turnoActivo?'rgba(0,0,0,0.05)':'linear-gradient(135deg,'+G.teal+',#0F6E56)',border:'none',borderRadius:12,color:order.length===0||!store.turnoActivo?G.textFaint:'white',fontSize:14,fontWeight:800,cursor:order.length===0||!store.turnoActivo?'not-allowed':'pointer',boxShadow:order.length>0&&store.turnoActivo?'0 7px 18px rgba(29,158,117,0.26)':'none',transition:'all 0.2s'}}>
              {order.length===0?'Sin items':!store.turnoActivo?'Turno de caja cerrado':'Cobrar '+fmt(total)}
            </button>
          </div>
        </div>
      </div>

      {showCobro&&<CobroModal total={total} onConfirm={handleCobro} onClose={()=>setShowCobro(false)}/>}
      {showMod&&<ModModal item={showMod} onConfirm={({sel,nota,extra})=>{addToOrder(showMod,sel,nota,extra);setShowMod(null);}} onClose={()=>setShowMod(null)}/>}
      {showNota&&<NotaModal item={showNota} onConfirm={nota=>{setNotaFn(showNota.uid,nota);setShowNota(null);}} onClose={()=>setShowNota(null)}/>}
      {showFactura&&facturaDatos&&(
        <FacturaModal mesa={facturaDatos.mesa} items={facturaDatos.items} total={facturaDatos.total} descuento={facturaDatos.descuento} onClose={()=>{setShowFactura(false);handleBack();}}/>
      )}
      {showFree&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(8px)'}}>
          <div style={{background:'rgba(255,255,255,0.95)',backdropFilter:'blur(20px)',borderRadius:18,padding:22,width:330,border:'1px solid rgba(255,255,255,0.85)',boxShadow:'0 24px 48px rgba(0,0,0,0.2)'}}>
            <div style={{fontSize:15,fontWeight:700,color:G.text,marginBottom:15}}>Item libre</div>
            <input value={freeN} onChange={e=>setFreeN(e.target.value)} placeholder="Nombre" style={{width:'100%',padding:'9px 11px',background:'rgba(0,0,0,0.05)',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,color:G.text,fontSize:13,marginBottom:9,boxSizing:'border-box',outline:'none'}}/>
            <input value={freeP} onChange={e=>setFreeP(e.target.value)} placeholder="Precio" type="number" style={{width:'100%',padding:'9px 11px',background:'rgba(0,0,0,0.05)',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,color:G.text,fontSize:13,marginBottom:15,boxSizing:'border-box',outline:'none'}}/>
            <div style={{display:'flex',gap:9}}>
              <button onClick={()=>{setShowFree(false);setFreeN('');setFreeP('');}} style={{flex:1,padding:'9px',background:'rgba(0,0,0,0.05)',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,color:G.textMid,cursor:'pointer'}}>Cancelar</button>
              <button onClick={()=>{if(!freeN.trim()||!freeP)return;const uid='libre_'+Date.now();setOrder(p=>[...p,{uid,id:null,nombre:freeN,precio:Number(freeP),extra:0,qty:1,nota:'',sel:{},libre:true,categoria:''}]);setFreeN('');setFreeP('');setShowFree(false);}} style={{flex:1,padding:'9px',background:G.teal,border:'none',borderRadius:9,color:'white',fontWeight:700,cursor:'pointer'}}>Agregar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
