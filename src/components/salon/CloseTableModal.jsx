import { useState, useRef, useEffect } from 'react';
import { money } from '@/lib/fmt';
import { useStore } from '@/lib/store';
import { getPrinterConfig, printReceipt } from '@/lib/printer';
import { supabase } from '@/api/supabaseClient';
import { searchCustomers, addCustomerVisit } from '@/lib/crmApi';

const LAST_EMAIL_KEY = 'mimenu_last_client_email';

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
  const [clientEmail, setClientEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) || '');
  const [sendingEmail, setSendingEmail] = useState(false);

  // CRM — identificación de cliente y puntos
  const [clienteQ, setClienteQ] = useState('');
  const [clienteResults, setClienteResults] = useState([]);
  const [cliente, setCliente] = useState(null);       // cliente seleccionado
  const [puntosARedimir, setPuntosARedimir] = useState(0);
  const [crmSearching, setCrmSearching] = useState(false);
  const crmTimerRef = useRef(null);

  const discAmount = (() => {
    if (!disc || !discVal) return 0;
    const v = parseFloat(discVal) || 0;
    return discType === '%' ? Math.round(total * v / 100) : Math.min(v, total);
  })();
  const propinaAmount = parseFloat(propina) || 0;
  // Points discount: 1 punto = $1 de descuento
  const descuentoPuntos = puntosARedimir;
  const finalTotal = Math.max(0, total - discAmount - descuentoPuntos);
  const totalConPropina = finalTotal + propinaAmount;

  // Búsqueda de cliente con debounce
  useEffect(() => {
    clearTimeout(crmTimerRef.current);
    if (!clienteQ.trim() || clienteQ.trim().length < 2) {
      setClienteResults([]);
      return;
    }
    setCrmSearching(true);
    crmTimerRef.current = setTimeout(async () => {
      try {
        const restaurantId = store.restaurantId;
        if (restaurantId) {
          const results = await searchCustomers(restaurantId, clienteQ);
          setClienteResults(results);
        }
      } catch { /* ignore */ }
      finally { setCrmSearching(false); }
    }, 350);
    return () => clearTimeout(crmTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteQ]);

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

    // Enviar recibo por email (fire-and-forget — no bloquea el cierre)
    if (clientEmail && clientEmail.includes('@')) {
      localStorage.setItem(LAST_EMAIL_KEY, clientEmail);
      setSendingEmail(true);
      supabase.functions.invoke('send-receipt', {
        body: {
          email: clientEmail,
          turn: {
            mesa_num: table.num,
            mozo: table.mozo || '',
            metodo_pago: finalMethod,
            total_facturado: totalConPropina,
            propina: propinaAmount,
            descuento: disc ? discAmount : 0,
            closed_at: new Date().toISOString(),
          },
          items: (table.order || []).map(it => ({
            menu_item_name: it.nombre,
            cantidad: it.qty || it.cantidad || 1,
            precio: it.precio,
            notas: it.nota || it.notas || '',
          })),
          restaurantName: store.restaurante?.nombre || 'Restaurante',
          restaurantPhone: store.restaurante?.telefono || '',
        },
      }).catch(() => {}).finally(() => setSendingEmail(false));
    }

    // Registrar visita de cliente (fire-and-forget — no bloquea el cierre)
    if (cliente && store.restaurantId) {
      addCustomerVisit(store.restaurantId, cliente.id, table.turnId || null, finalTotal, puntosARedimir)
        .catch(() => {}); // non-blocking
    }

    if (store.refreshCharts && branchId) store.refreshCharts(branchId);
  }

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:9999, display:'flex', alignItems:'flex-start', justifyContent:'center', background:'rgba(15,15,35,0.45)', padding:'8px 8px', overflow:'hidden' }}
      onClick={onClose}>
      <div style={{
        background:'#FFFFFF',
        border:'1px solid #E2E8F0',
        boxShadow:'0 24px 64px rgba(60,60,160,0.16)',
        borderRadius:20,
        width:440, maxWidth:'92vw', maxHeight:'100%', overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'14px 16px',
        fontFamily:"'DM Sans', system-ui, sans-serif",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontSize:15, fontWeight:700, color:'#0F172A', fontFamily:"'DM Sans', system-ui, sans-serif" }}>
            Cerrar mesa {table.num}
          </span>
          <button onClick={onClose} style={{ color:'#9BA3B8', background:'none', border:'none', cursor:'pointer', display:'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Resumen de ítems */}
        <div style={{ background:'#F8FAFC', borderRadius:10, padding:10, marginBottom:10 }}>
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
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: disc ? 6 : 10 }}>
          <span style={{ fontSize:13, color:'#374151' }}>Aplicar descuento</span>
          <button onClick={() => setDisc(!disc)}
            style={{ position:'relative', width:40, height:22, borderRadius:99, border:'none', cursor:'pointer', transition:'background .2s', background: disc ? '#1D9E75' : '#E5E7EB', padding:2 }}>
            <span style={{ display:'inline-block', width:18, height:18, borderRadius:'50%', background:'white', transition:'transform .2s', transform: disc ? 'translateX(18px)' : 'translateX(0)' }} />
          </button>
        </div>
        {disc && (
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ display:'flex', border:'1px solid #E2E8F0', borderRadius:9, overflow:'hidden' }}>
              {DISC_TYPES.map(t => (
                <button key={t} onClick={() => setDiscType(t)}
                  style={{ padding:'6px 14px', fontSize:13, border:'none', cursor:'pointer', transition:'all .1s', background: discType===t ? '#1D9E75' : 'white', color: discType===t ? 'white' : '#374151' }}>
                  {t}
                </button>
              ))}
            </div>
            <input type="number" placeholder="0" value={discVal} onChange={e => setDiscVal(e.target.value)}
              style={{ width:90, padding:'6px 10px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, outline:'none' }} />
            <input placeholder="Motivo (obligatorio)" value={discMotivo}
              onChange={e => { setDiscMotivo(e.target.value); setDiscMotivoError(false); }}
              style={{ flex:1, minWidth:120, padding:'6px 10px', border:`1px solid ${discMotivoError ? '#EF4444' : '#E2E8F0'}`, borderRadius:9, fontSize:13, outline:'none' }} />
          </div>
        )}

        {/* Propina */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, padding:'8px 10px', background:'rgba(239,159,39,0.08)', border:'1px solid rgba(239,159,39,0.25)', borderRadius:10 }}>
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
        <div style={{ fontSize:10, fontWeight:700, color:'#9BA3B8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Método de pago</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
          {METHODS.map(m => {
            const color = METHOD_COLOR[m];
            const isM1 = method1 === m;
            const isM2 = mixMode && method2 === m;
            const active = isM1 || isM2;
            const handleClick = () => {
              if (!mixMode) {
                if (m === method1) return;
                setMixMode(true); setMethod2(m);
                setAmount1(String(totalConPropina)); setAmount2('0');
              } else {
                if (m === method1) return;
                if (m === method2) { setMixMode(false); setMethod2(null); setAmount1(''); setAmount2(''); }
                else { setMethod2(m); setAmount2(String(Math.max(0, totalConPropina - (Number(amount1)||0)))); }
              }
            };
            return (
              <button key={m} onClick={handleClick} style={{
                display:'flex', alignItems:'center', gap:5, padding:'7px 16px', fontSize:12, fontWeight:600,
                borderRadius:99, cursor:'pointer', transition:'all .12s',
                border: active ? `1.5px solid ${color}` : '1px solid #E2E8F0',
                background: active ? hexToRgba(color, 0.10) : '#FFFFFF',
                color: active ? color : '#374151',
              }}>
                {m}
                {isM2 && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
              </button>
            );
          })}
        </div>

        {/* Pago mixto */}
        {mixMode && (
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:8, padding:10, background:'#F8FAFC', borderRadius:10 }}>
            {[
              { m:method1, val:amount1, setVal:(v)=>{ setAmount1(v); setAmount2(String(Math.max(0, totalConPropina-(Number(v)||0)))); } },
              { m:method2, val:amount2, setVal:(v)=>{ setAmount2(v); setAmount1(String(Math.max(0, totalConPropina-(Number(v)||0)))); } },
            ].map((row, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ flex:1, fontSize:13, fontWeight:600, color:METHOD_COLOR[row.m] }}>{row.m}</span>
                <div style={{ position:'relative', width:130 }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#9CA3AF' }}>$</span>
                  <input type="number" value={row.val} onChange={e => row.setVal(e.target.value)}
                    style={{ width:'100%', padding:'7px 10px 7px 22px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:13, boxSizing:'border-box', outline:'none' }} />
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
        <div style={{ borderTop:'1px solid #E2E8F0', paddingTop:8, marginBottom:10, display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#6B7280' }}>
            <span>Subtotal</span><span>{money(total)}</span>
          </div>
          {disc && discAmount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#E24B4A' }}>
              <span>Descuento {discType==='%'?`${discVal}%`:money(discVal)}{discMotivo?` · ${discMotivo}`:''}</span>
              <span>−{money(discAmount)}</span>
            </div>
          )}
          {descuentoPuntos > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#1D9E75' }}>
              <span>Descuento puntos ({puntosARedimir} pts)</span>
              <span>−{money(descuentoPuntos)}</span>
            </div>
          )}
          {propinaAmount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#EF9F27' }}>
              <span>Propina</span><span>+{money(propinaAmount)}</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:17, fontWeight:800, color:'#0F172A', marginTop:4 }}>
            <span>Total</span><span>{money(totalConPropina)}</span>
          </div>
        </div>

        {/* Error de impresión */}
        {printError && (
          <div style={{ background:'rgba(226,75,74,0.08)', border:'1px solid rgba(226,75,74,0.25)', borderRadius:10, padding:'8px 12px', fontSize:12, color:'#E24B4A', marginBottom:12 }}>
            {printError}
          </div>
        )}

        {/* CRM — identificación de cliente */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>
            ¿El cliente tiene cuenta? <span style={{ fontWeight:400, color:'#9CA3AF' }}>(opcional)</span>
          </div>

          {cliente ? (
            // Cliente seleccionado
            <div style={{ background:'rgba(29,158,117,0.07)', border:'1px solid rgba(29,158,117,0.25)', borderRadius:9, padding:'8px 12px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                <div>
                  <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{cliente.nombre}</span>
                  {cliente.telefono && <span style={{ fontSize:11, color:'#6B7280', marginLeft:8 }}>{cliente.telefono}</span>}
                  <div style={{ fontSize:11, color:'#1D9E75', fontWeight:600, marginTop:2 }}>
                    {cliente.puntos > 0
                      ? `★ ${cliente.puntos} puntos disponibles`
                      : 'Sin puntos acumulados aún'}
                  </div>
                </div>
                <button onClick={() => { setCliente(null); setPuntosARedimir(0); setClienteQ(''); }}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', padding:4 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* Canje de puntos — solo si tiene puntos suficientes */}
              {cliente.puntos >= 100 && (
                <div style={{ marginTop:8, borderTop:'1px solid rgba(29,158,117,0.15)', paddingTop:8 }}>
                  <div style={{ fontSize:11, color:'#374151', marginBottom:5 }}>
                    Canjear puntos (100 pts = $100 de descuento):
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {[0, 100, 200, 500].filter(v => v <= cliente.puntos).map(v => (
                      <button key={v} onClick={() => setPuntosARedimir(v)}
                        style={{
                          padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', transition:'all .12s',
                          background: puntosARedimir === v ? '#1D9E75' : '#F1F5F9',
                          color: puntosARedimir === v ? '#FFF' : '#374151',
                          border: puntosARedimir === v ? 'none' : '1px solid #E2E8F0',
                        }}>
                        {v === 0 ? 'Sin canje' : `${v} pts (-${money(v)})`}
                      </button>
                    ))}
                    {/* Canje personalizado si tiene más de 500 */}
                    {cliente.puntos > 500 && puntosARedimir > 500 && (
                      <span style={{ fontSize:11, color:'#1D9E75', fontWeight:600, alignSelf:'center' }}>
                        {puntosARedimir} pts (-{money(puntosARedimir)})
                      </span>
                    )}
                  </div>
                  {puntosARedimir > 0 && (
                    <div style={{ marginTop:5, fontSize:11, color:'#1D9E75', fontWeight:600 }}>
                      ✓ Descuento aplicado: -{money(puntosARedimir)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Búsqueda de cliente
            <div style={{ position:'relative' }}>
              <input
                value={clienteQ}
                onChange={e => setClienteQ(e.target.value)}
                placeholder="Buscar por nombre o teléfono..."
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }}
              />
              {crmSearching && (
                <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', width:14, height:14, border:'2px solid #E2E8F0', borderTopColor:'#1D9E75', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
              )}
              {clienteResults.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:10, background:'#FFF', border:'1px solid #E2E8F0', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,0.10)', marginTop:2, overflow:'hidden' }}>
                  {clienteResults.map(c => (
                    <button key={c.id}
                      onClick={() => { setCliente(c); setClienteQ(''); setClienteResults([]); }}
                      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'9px 12px', background:'none', border:'none', cursor:'pointer', textAlign:'left', borderBottom:'1px solid #F1F5F9' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{c.nombre}</div>
                        <div style={{ fontSize:11, color:'#6B7280' }}>{c.telefono || c.email || ''}</div>
                      </div>
                      {c.puntos > 0 && (
                        <span style={{ fontSize:10, fontWeight:700, background:'rgba(29,158,117,0.10)', color:'#1D9E75', padding:'2px 7px', borderRadius:99, flexShrink:0 }}>
                          {c.puntos} pts
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Email de recibo — opcional */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>
            Enviar recibo por email <span style={{ fontWeight:400, color:'#9CA3AF' }}>(opcional)</span>
          </div>
          <div style={{ position:'relative' }}>
            <input
              type="email"
              value={clientEmail}
              onChange={e => setClientEmail(e.target.value)}
              placeholder="cliente@email.com"
              style={{ width:'100%', padding:'8px 34px 8px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, color:'#111827', background:'#FFFFFF', outline:'none', boxSizing:'border-box' }}
            />
            {clientEmail && clientEmail.includes('@') && (
              <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:14 }}>
                {sendingEmail ? '⏳' : '✉️'}
              </span>
            )}
          </div>
          {clientEmail && !clientEmail.includes('@') && (
            <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>Email inválido</div>
          )}
        </div>

        {/* Botones */}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:'9px 0', border:'1px solid #E2E8F0', borderRadius:12, fontSize:13, color:'#374151', background:'#FFFFFF', cursor:'pointer' }}>
            Cancelar
          </button>
          <button disabled={!montosCuadran || printing} onClick={handleConfirm}
            style={{ flex:2, padding:'9px 0', border:'none', borderRadius:12, fontSize:13, fontWeight:700, color:'white', background:'#1D9E75', cursor: (!montosCuadran || printing) ? 'not-allowed' : 'pointer', opacity: (!montosCuadran || printing) ? 0.5 : 1, boxShadow:'0 4px 14px rgba(29,158,117,0.28)' }}>
            {printing ? 'Imprimiendo...' : 'Confirmar y cerrar mesa'}
          </button>
        </div>

      </div>
    </div>
  );
}

