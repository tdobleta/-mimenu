import { useState } from 'react';
import { money } from '@/lib/fmt';
import { useStore } from '@/lib/store';

const METHODS = ['Efectivo','MercadoPago','Débito','Crédito','Transferencia'];
const METHOD_COLOR = {
  'Efectivo': '#1D9E75',
  'MercadoPago': '#3B82F6',
  'Débito': '#F59E0B',
  'Crédito': '#EF4444',
  'Transferencia': '#8B5CF6',
};
const DISC_TYPES = ['%','$'];

function hexToRgba(hex, alpha) {
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function CloseTableModal({ table, total, branchId, onClose, onConfirmWithDiscount }) {
  const store = useStore();
  const [method1, setMethod1] = useState('Efectivo');
  const [method2, setMethod2] = useState(null);
  const [amount1, setAmount1] = useState('');
  const [amount2, setAmount2] = useState('');
  const [mixMode, setMixMode] = useState(false);
  const [disc, setDisc] = useState(false);
  const [discType, setDiscType] = useState('%');
  const [discVal, setDiscVal] = useState('');
  const [discMotivo, setDiscMotivo] = useState('');
  const [discMotivoError, setDiscMotivoError] = useState(false);
  const [propina, setPropina] = useState('');

  const discAmount = (() => {
    if (!disc || !discVal) return 0;
    const v = parseFloat(discVal) || 0;
    return discType === '%' ? Math.round(total * v / 100) : Math.min(v, total);
  })();
  const propinaAmount = parseFloat(propina) || 0;
  const finalTotal = total - discAmount;
  const totalConPropina = finalTotal + propinaAmount;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div style={{ backgroundColor:'white', borderRadius:12, width:440, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', padding:24 }} onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <span style={{ fontSize:16, fontWeight:600, color:'#111827' }}>Cerrar mesa {table.num}</span>
          <button onClick={onClose} style={{ color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ backgroundColor:'#F9FAFB', borderRadius:8, padding:12, marginBottom:14 }}>
          {(table.order||[]).length === 0
            ? <div style={{ fontSize:12, color:'#9CA3AF' }}>Sin ítems</div>
            : (table.order||[]).map(it => (
                <div key={it.itemId} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'3px 0' }}>
                  <span>{it.nombre} × {it.qty}</span>
                  <span style={{ color:'#6B7280' }}>{money(it.precio * it.qty)}</span>
                </div>
              ))
          }
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: disc ? 10 : 14 }}>
          <span style={{ fontSize:13, color:'#374151' }}>Aplicar descuento</span>
          <button onClick={() => setDisc(!disc)}
            style={{ position:'relative', width:40, height:22, borderRadius:99, border:'none', cursor:'pointer', transition:'background .2s', backgroundColor: disc ? '#1D9E75' : '#E5E7EB', padding:2 }}>
            <span style={{ display:'inline-block', width:18, height:18, borderRadius:'50%', backgroundColor:'white', transition:'transform .2s', transform: disc ? 'translateX(18px)' : 'translateX(0)' }} />
          </button>
        </div>
        {disc && (
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ display:'flex', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, overflow:'hidden' }}>
              {DISC_TYPES.map(t => (
                <button key={t} onClick={() => setDiscType(t)}
                  style={{ padding:'6px 14px', fontSize:13, border:'none', cursor:'pointer', transition:'all .1s', backgroundColor: discType===t ? '#1D9E75' : 'white', color: discType===t ? 'white' : '#374151' }}>
                  {t}
                </button>
              ))}
            </div>
            <input type="number" placeholder="0" value={discVal} onChange={e => setDiscVal(e.target.value)}
              style={{ width:90, padding:'6px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} />
            <input
              placeholder="Motivo (obligatorio)"
              value={discMotivo}
              onChange={e => { setDiscMotivo(e.target.value); setDiscMotivoError(false); }}
              style={{ flex:1, minWidth:120, padding:'6px 10px', border:`0.5px solid ${discMotivoError ? '#EF4444' : 'rgba(0,0,0,0.12)'}`, borderRadius:7, fontSize:13 }}
            />
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14, padding:'10px 12px', backgroundColor:'#FFFBEB', border:'0.5px solid rgba(202,138,4,0.2)', borderRadius:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#CA8A04" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <span style={{ fontSize:13, color:'#92400E', fontWeight:500 }}>Propina</span>
          </div>
          <div style={{ position:'relative', width:130 }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#9CA3AF' }}>$</span>
            <input
              type="number"
              placeholder="0"
              value={propina}
              onChange={e => setPropina(e.target.value)}
              style={{ width:'100%', padding:'6px 10px 6px 22px', border:'0.5px solid rgba(202,138,4,0.3)', borderRadius:7, fontSize:13, boxSizing:'border-box', backgroundColor:'white' }}
            />
          </div>
          {propinaAmount > 0 && (
            <span style={{ fontSize:12, color:'#CA8A04', fontWeight:600, whiteSpace:'nowrap' }}>+{money(propinaAmount)}</span>
          )}
        </div>

        <div style={{ fontSize:11, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Método de pago</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
          {METHODS.map(m => {
            const color = METHOD_COLOR[m];
            const isM1 = method1 === m;
            const isM2 = mixMode && method2 === m;
            const active = isM1 || isM2;
            const handleClick = () => {
              if (!mixMode) {
                if (m === method1) return;
                setMixMode(true);
                setMethod2(m);
                setAmount1(String(totalConPropina));
                setAmount2('0');
              } else {
                if (m === method1) return;
                if (m === method2) {
                  setMixMode(false);
                  setMethod2(null);
                  setAmount1('');
                  setAmount2('');
                } else {
                  setMethod2(m);
                  setAmount2(String(Math.max(0, totalConPropina - (Number(amount1)||0))));
                }
              }
            };
            return (
              <button key={m} onClick={handleClick}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', fontSize:12, fontWeight:500, borderRadius:99, cursor:'pointer', transition:'all .1s',
                  border: active ? `1.5px solid ${color}` : '0.5px solid rgba(0,0,0,0.12)',
                  backgroundColor: active ? hexToRgba(color, 0.10) : 'white',
                  color: active ? color : '#374151' }}>
                {m}
                {isM2 && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                )}
              </button>
            );
          })}
        </div>

        {mixMode && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12, padding:12, backgroundColor:'#F9FAFB', borderRadius:8 }}>
            {[
              { m: method1, val: amount1, setVal: (v) => { setAmount1(v); setAmount2(String(Math.max(0, totalConPropina - (Number(v)||0)))); } },
              { m: method2, val: amount2, setVal: (v) => { setAmount2(v); setAmount1(String(Math.max(0, totalConPropina - (Number(v)||0)))); } },
            ].map((row, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ flex:1, fontSize:13, fontWeight:500, color: METHOD_COLOR[row.m] }}>{row.m}</span>
                <div style={{ position:'relative', width:130 }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#6B7280' }}>$</span>
                  <input type="number" value={row.val} onChange={e => row.setVal(e.target.value)}
                    style={{ width:'100%', padding:'7px 10px 7px 22px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
                </div>
              </div>
            ))}
            {(() => {
              const suma = (Number(amount1)||0) + (Number(amount2)||0);
              if (suma === totalConPropina) {
                return <div style={{ backgroundColor:'#E8F7F2', color:'#1D9E75', fontSize:12, padding:8, borderRadius:7, textAlign:'center' }}>✓ El total cuadra</div>;
              }
              return <div style={{ backgroundColor:'#FEE2E2', color:'#EF4444', fontSize:12, padding:8, borderRadius:7, textAlign:'center' }}>Diferencia: {money(Math.abs(suma - totalConPropina))}</div>;
            })()}
          </div>
        )}

        <div style={{ borderTop:'0.5px solid rgba(0,0,0,0.06)', paddingTop:12, marginBottom:16, display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#6B7280' }}>
            <span>Subtotal</span><span>{money(total)}</span>
          </div>
          {disc && discAmount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#EF4444' }}>
              <span>Descuento {discType === '%' ? `${discVal}%` : money(discVal)}{discMotivo ? ` · ${discMotivo}` : ''}</span>
              <span>−{money(discAmount)}</span>
            </div>
          )}
          {propinaAmount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#CA8A04' }}>
              <span>Propina</span>
              <span>+{money(propinaAmount)}</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:700, color:'#111827' }}>
            <span>Total</span><span>{money(totalConPropina)}</span>
          </div>
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose}
            style={{ flex:1, padding:'10px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>
            Cancelar
          </button>
          {(() => {
            const suma = (Number(amount1)||0) + (Number(amount2)||0);
            const disabled = mixMode && suma !== totalConPropina;
            return (
              <button disabled={disabled} onClick={async () => {
                  if (disc && !discMotivo.trim()) { setDiscMotivoError(true); return; }
                  if (disabled) return;
                  const finalMethod = mixMode ? `${method1} + ${method2}` : method1;
                  await onConfirmWithDiscount(finalMethod, finalTotal, disc ? discAmount : 0, discMotivo, propinaAmount);
                  if (store.refreshCharts && branchId) store.refreshCharts(branchId);
                }}
                style={{ flex:1, padding:'10px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor: disabled?'not-allowed':'pointer', opacity: disabled?0.4:1 }}>
                Confirmar cierre
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}


