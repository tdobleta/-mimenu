import { useState } from 'react';
import { money } from '@/lib/fmt';
import { useStore } from '@/lib/store';
import { getPrinterConfig, printReceipt } from '@/lib/printer';

const METHODS = ['Efectivo','Tarjeta','MercadoPago','Transferencia'];
const METHOD_COLOR = { 'Efectivo':'#1D9E75','Tarjeta':'#7F77DD','MercadoPago':'#EF9F27','Transferencia':'#378ADD' };
const DISC_TYPES = ['%','$'];

function hexToRgba(hex, alpha) {
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
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
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  const discAmount = (() => {
    if (!disc || !discVal) return 0;
    const v = parseFloat(discVal) || 0;
    return discType === '%' ? Math.round(total * v / 100) : Math.min(v, total);
  })();
  const propinaAmount = parseFloat(propina) || 0;
  const finalTotal = total - discAmount;
  const totalConPropina = finalTotal + propinaAmount;

  const suma = (Number(amount1)||0) + (Number(amount2)||0);
  const montosCuadran = !mixMode || suma === totalConPropina;
  const finalMethod = mixMode
    ? `Mixto (${method1} $${Math.round(Number(amount1)||0).toLocaleString('es-AR')} + ${method2} $${Math.round(Number(amount2)||0).toLocaleString('es-AR')})`
    : method1;

  // Pagos para el printer service (desglose para Reportes)
  const pagos = mixMode
    ? [{ metodo:method1, monto:Number(amount1)||0 }, { metodo:method2, monto:Number(amount2)||0 }]
    : [{ metodo:method1, monto:totalConPropina }];

  async function handleConfirm() {
    if (disc && !discMotivo.trim()) { setDiscMotivoError(true); return; }
    if (!montosCuadran) return;

    // Guardar primero, luego imprimir
    await onConfirmWithDiscount(finalMethod, finalTotal, disc ? discAmount : 0, discMotivo, propinaAmount, pagos);

    // Imprimir ticket si está configurado
    const cfg = getPrinterConfig();
    if (cfg.autoPrintRecibo) {
      setPrinting(true);
      setPrintError('');
      try {
        await printReceipt({
          mesa: table.num,
          mozo: table.mozo || '',
          items: (table.order || []).map(it => ({ nombre:it.nombre, precio:it.precio, qty:it.qty, nota:it.nota || '' })),
          subtotal: total,
          descuento: disc ? discAmount : 0,
          propina: propinaAmount,
          total: totalConPropina,
          metodo: finalMethod,
        }, cfg);
      } catch(e) {
        setPrintError('Mesa cerrada pero no se pudo imprimir: ' + e.message);
      }
      setPrinting(false);
    }

    if (store.refreshCharts && branchId) store.refreshCharts(branchId);
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(15,15,35,0.5)', backdropFilter:'blur(4px)' }}
      onClick={onClose}>
      <div style={{
        background:'rgba(255,255,255,0.88)',
        backdropFilter:'blur(24px) saturate(180%)',
        WebkitBackdropFilter:'blur(24px) saturate(180%)',
        border:'1px solid rgba(255,255,255,0.8)',
        boxShadow:'0 24px 64px rgba(60,60,160,0.16)',
        borderRadius:20,
        width:440, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', padding:24,
        fontFamily:"'DM Sans', system-ui, sans-serif",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <span style={{ fontSize:17, fontWeight:700, color:'#1a1a2e', fontFamily:"'Playfair Display', Georgia, serif" }}>
            Cerrar mesa {table.num}
          </span>
          <button onClick={onClose} style={{ color:'#9BA3B8', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Resumen de ítems */}
        <div style={{ background:'rgba(0,0,0,0.04)', borderRadius:12, padding:12, marginBottom:14 }}>
          {(table.order||[]).length === 0
            ? <div style={{ fontSize:12, color:'#9BA3B8' }}>Sin ítems</div>
            : (table.order||[]).map(it => (
                <div key={it.itemId} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'3px 0', color:'#374151' }}>
                  <span>{it.nombre} × {it.qty}</span>
                  <span style={{ color:'#6B7280' }}>{money(it.precio * it.qty)}</span>
                </div>
              ))
          }
        </div>

        {/* Descuento toggle */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: disc ? 10 : 14 }}>
          <span style={{ fontSize:13, color:'#374151' }}>Aplicar descuento</span>
          <button onClick={() => setDisc(!disc)}
            style={{ position:'relative', width:40, height:22, borderRadius:99, border:'none', cursor:'pointer', transition:'background .2s', background: disc ? '#1D9E75' : '#E5E7EB', padding:2 }}>
            <span style={{ display:'inline-block', width:18, height:18, borderRadius:'50%', background:'white', transition:'transform .2s', transform: disc ? 'translateX(18px)' : 'translateX(0)' }} />
          </button>
        </div>
        {disc && (
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ display:'flex', border:'1px solid rgba(0,0,0,0.10)', borderRadius:9, overflow:'hidden' }}>
              {DISC_TYPES.map(t => (
                <button key={t} onClick={() => setDiscType(t)}
                  style={{ padding:'6px 14px', fontSize:13, border:'none', cursor:'pointer', transition:'all .1s', background: discType===t ? '#1D9E75' : 'white', color: discType===t ? 'white' : '#374151' }}>
                  {t}
                </button>
              ))}
            </div>
            <input type="number" placeholder="0" value={discVal} onChange={e => setDiscVal(e.target.value)}
              style={{ width:90, padding:'6px 10px', border:'1px solid rgba(0,0,0,0.10)', borderRadius:9, fontSize:13, outline:'none' }} />
            <input placeholder="Motivo (obligatorio)" value={discMotivo}
              onChange={e => { setDiscMotivo(e.target.value); setDiscMotivoError(false); }}
              style={{ flex:1, minWidth:120, padding:'6px 10px', border:`1px solid ${discMotivoError ? '#EF4444' : 'rgba(0,0,0,0.10)'}`, borderRadius:9, fontSize:13, outline:'none' }} />
          </div>
        )}

        {/* Propina */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14, padding:'10px 12px', background:'rgba(239,159,39,0.08)', border:'1px solid rgba(239,159,39,0.25)', borderRadius:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF9F27" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <span style={{ fontSize:13, color:'#92600A', fontWeight:500 }}>Propina</span>
          </div>
          <div style={{ position:'relative', width:130 }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#9CA3AF' }}>$</span>
            <input type="number" placeholder="0" value={propina} onChange={e => setPropina(e.target.value)}
              style={{ width:'100%', padding:'6px 10px 6px 22px', border:'1px solid rgba(239,159,39,0.3)', borderRadius:9, fontSize:13, boxSizing:'border-box', background:'white', outline:'none' }} />
          </div>
          {propinaAmount > 0 && <span style={{ fontSize:12, color:'#EF9F27', fontWeight:700, whiteSpace:'nowrap' }}>+{money(propinaAmount)}</span>}
        </div>

        {/* Métodos de pago */}
        <div style={{ fontSize:10, fontWeight:700, color:'#9BA3B8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Método de pago</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
          {METHODS.map(m => {
            const color = METHOD_COLOR[m];
            const isM1 = method1 === m;
            const isM2 = mixMode && method2 === m;
            const active = isM1 || isM2;
            const handleClick = () => {
              if (!mixMode) {
                if (m === method1) return; // ya seleccionado
                // Primer click en otro método: preguntar si quiere mix o cambiar
                // Simple: cambiar método primario. Para mix, usar el botón de pago mixto.
                setMethod1(m);
              } else {
                if (m === method2) { setMixMode(false); setMethod2(null); setAmount1(''); setAmount2(''); }
                else if (m !== method1) { setMethod2(m); }
              }
            };
            return (
              <button key={m} onClick={handleClick} style={{
                display:'flex', alignItems:'center', gap:5, padding:'7px 16px', fontSize:12, fontWeight:600,
                borderRadius:99, cursor:'pointer', transition:'all .12s',
                border: active ? `1.5px solid ${color}` : '1px solid rgba(0,0,0,0.10)',
                background: active ? hexToRgba(color, 0.10) : 'rgba(255,255,255,0.7)',
                color: active ? color : '#374151',
              }}>
                {m}
                {isM2 && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
              </button>
            );
          })}
        </div>

        {/* Toggle pago mixto */}
        <button onClick={() => {
          if (mixMode) { setMixMode(false); setMethod2(null); setAmount1(''); setAmount2(''); }
          else { setMixMode(true); setMethod2(METHODS.find(m => m !== method1) || 'Tarjeta'); setAmount1(String(totalConPropina)); setAmount2('0'); }
        }} style={{ fontSize:11, color: mixMode ? '#E24B4A' : '#9BA3B8', background:'none', border:'none', cursor:'pointer', marginBottom:10, padding:0, display:'flex', alignItems:'center', gap:4 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          {mixMode ? 'Cancelar pago mixto' : 'Pago mixto (2 métodos)'}
        </button>

        {/* Pago mixto */}
        {mixMode && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12, padding:12, background:'rgba(0,0,0,0.04)', borderRadius:10 }}>
            {[
              { m:method1, val:amount1, setVal:(v)=>{ setAmount1(v); setAmount2(String(Math.max(0, totalConPropina-(Number(v)||0)))); } },
              { m:method2, val:amount2, setVal:(v)=>{ setAmount2(v); setAmount1(String(Math.max(0, totalConPropina-(Number(v)||0)))); } },
            ].map((row, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ flex:1, fontSize:13, fontWeight:600, color:METHOD_COLOR[row.m] }}>{row.m}</span>
                <div style={{ position:'relative', width:130 }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#9CA3AF' }}>$</span>
                  <input type="number" value={row.val} onChange={e => row.setVal(e.target.value)}
                    style={{ width:'100%', padding:'7px 10px 7px 22px', border:'1px solid rgba(0,0,0,0.10)', borderRadius:9, fontSize:13, boxSizing:'border-box', outline:'none' }} />
                </div>
              </div>
            ))}
            <div style={{ borderRadius:8, padding:'8px 12px', textAlign:'center', fontSize:12, fontWeight:600,
              background: montosCuadran ? 'rgba(29,158,117,0.10)' : 'rgba(226,75,74,0.10)',
              color: montosCuadran ? '#1D9E75' : '#E24B4A',
            }}>
              {montosCuadran ? '✓ El total cuadra' : `Diferencia: ${money(Math.abs(suma - totalConPropina))}`}
            </div>
          </div>
        )}

        {/* Resumen final */}
        <div style={{ borderTop:'1px solid rgba(0,0,0,0.08)', paddingTop:12, marginBottom:16, display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#6B7280' }}>
            <span>Subtotal</span><span>{money(total)}</span>
          </div>
          {disc && discAmount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#E24B4A' }}>
              <span>Descuento {discType==='%'?`${discVal}%`:money(discVal)}{discMotivo?` · ${discMotivo}`:''}</span>
              <span>−{money(discAmount)}</span>
            </div>
          )}
          {propinaAmount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#EF9F27' }}>
              <span>Propina</span><span>+{money(propinaAmount)}</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:17, fontWeight:800, color:'#1a1a2e', marginTop:4 }}>
            <span>Total</span><span>{money(totalConPropina)}</span>
          </div>
        </div>

        {/* Error de impresión */}
        {printError && (
          <div style={{ background:'rgba(226,75,74,0.08)', border:'1px solid rgba(226,75,74,0.25)', borderRadius:10, padding:'8px 12px', fontSize:12, color:'#E24B4A', marginBottom:12 }}>
            {printError}
          </div>
        )}

        {/* Botones */}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px 0', border:'1px solid rgba(0,0,0,0.10)', borderRadius:12, fontSize:13, color:'#374151', background:'rgba(255,255,255,0.7)', cursor:'pointer' }}>
            Cancelar
          </button>
          <button disabled={!montosCuadran || printing} onClick={handleConfirm}
            style={{ flex:2, padding:'11px 0', border:'none', borderRadius:12, fontSize:13, fontWeight:700, color:'white', background:'#1D9E75', cursor: (!montosCuadran || printing) ? 'not-allowed' : 'pointer', opacity: (!montosCuadran || printing) ? 0.5 : 1, boxShadow:'0 4px 14px rgba(29,158,117,0.28)' }}>
            {printing ? 'Imprimiendo...' : 'Confirmar y cerrar mesa'}
          </button>
        </div>

      </div>
    </div>
  );
}
