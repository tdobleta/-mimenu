import { useState } from 'react';
import { emitirFacturaB, emitirFacturaA, abrirPdfFactura, getAfipConfig } from '@/lib/afip';
import { money } from '@/lib/fmt';
import { G, glass, glassLight, fontDisplay } from '@/lib/glass';

// ── FacturaModal ──────────────────────────────────────────────────────────────
// Se muestra después de cerrar una mesa.
// Props:
//   mesa     {number}   - número de mesa
//   items    {array}    - [{ nombre, precio, qty, nota }]
//   total    {number}   - total a facturar
//   descuento {number}  - descuento aplicado
//   onClose  {fn}       - cerrar el modal
export default function FacturaModal({ mesa, items, total, descuento = 0, onClose }) {
  const cfg = getAfipConfig();
  const [tipo, setTipo] = useState('B'); // 'B' | 'A'
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultado, setResultado] = useState(null); // null | { cae, numero, ... }
  const [error, setError] = useState('');

  // Datos para Factura A
  const [cuitCliente, setCuitCliente]         = useState('');
  const [razonCliente, setRazonCliente]       = useState('');
  const [emailCliente, setEmailCliente]       = useState('');
  const [domicilioCliente, setDomicilioCliente] = useState('');

  async function handleEmitir() {
    setEmitiendo(true); setError('');
    try {
      let res;
      if (tipo === 'B') {
        res = await emitirFacturaB({ items, total, descuento, mesa });
      } else {
        if (!cuitCliente || !razonCliente) {
          setError('Para Factura A necesitás ingresar CUIT y razón social del cliente.');
          setEmitiendo(false); return;
        }
        res = await emitirFacturaA({
          items, total, descuento, mesa,
          cliente: { cuit: cuitCliente, razon_social: razonCliente, email: emailCliente, domicilio: domicilioCliente },
        });
      }
      setResultado(res);
    } catch(e) {
      setError(e.message);
    }
    setEmitiendo(false);
  }

  const totalFacturado = total - descuento;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(15,15,35,0.55)', backdropFilter:'blur(5px)' }}
      onClick={!resultado ? onClose : undefined}>
      <div style={{
        background:'rgba(255,255,255,0.92)',
        backdropFilter:'blur(24px) saturate(180%)',
        WebkitBackdropFilter:'blur(24px) saturate(180%)',
        border:'1px solid rgba(255,255,255,0.85)',
        boxShadow:'0 24px 64px rgba(60,60,160,0.18)',
        borderRadius:22,
        width: 460, maxWidth:'95vw', maxHeight:'90vh',
        overflowY:'auto', padding:26,
        fontFamily:"'DM Sans', system-ui, sans-serif",
      }} onClick={e => e.stopPropagation()}>

        {/* ── RESULTADO EXITOSO ── */}
        {resultado && (
          <div style={{ textAlign:'center' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(29,158,117,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={G.teal} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontSize:20, fontWeight:700, color:G.text, fontFamily:fontDisplay, marginBottom:4 }}>
              Factura emitida
            </div>
            <div style={{ fontSize:13, color:G.textFaint, marginBottom:20 }}>
              AFIP procesó el comprobante correctamente
            </div>

            {/* Datos del comprobante */}
            <div style={{ ...glassLight({ padding:'16px 20px', borderRadius:14, marginBottom:20, textAlign:'left' }) }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  { label:'Tipo',      value: resultado.tipo },
                  { label:'Número',    value: resultado.numero },
                  { label:'Fecha',     value: resultado.fecha },
                  { label:'Total',     value: money(resultado.total) },
                  { label:'CAE',       value: resultado.cae },
                  { label:'Vto. CAE', value: resultado.cae_vto },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding:'8px 12px', background:'rgba(255,255,255,0.6)', borderRadius:10 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:G.text, wordBreak:'break-all' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* QR */}
              {resultado.qr && (
                <div style={{ marginTop:14, textAlign:'center' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Código QR ARCA</div>
                  <img src={resultado.qr} alt="QR AFIP" style={{ width:120, height:120, borderRadius:8 }} />
                </div>
              )}
            </div>

            {/* Acciones */}
            <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
              {(resultado.pdf_link || resultado.pdf_base64) && (
                <button onClick={() => abrirPdfFactura(resultado)} style={{
                  padding:'10px 20px', background:G.teal, border:'none', borderRadius:12,
                  fontSize:13, fontWeight:700, color:'white', cursor:'pointer',
                  boxShadow:`0 4px 14px rgba(29,158,117,0.28)`,
                  display:'flex', alignItems:'center', gap:7,
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Ver / Imprimir PDF
                </button>
              )}
              <button onClick={onClose} style={{
                padding:'10px 20px', background:'rgba(0,0,0,0.06)', border:'none', borderRadius:12,
                fontSize:13, fontWeight:600, color:G.textMid, cursor:'pointer',
              }}>
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* ── FORMULARIO ── */}
        {!resultado && (<>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:700, color:G.text, fontFamily:fontDisplay }}>Emitir factura</div>
              <div style={{ fontSize:12, color:G.textFaint, marginTop:2 }}>Mesa {mesa} · {money(totalFacturado)}</div>
            </div>
            <button onClick={onClose} style={{ color:G.textFaint, background:'none', border:'none', cursor:'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Tipo de factura */}
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Tipo de comprobante</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { key:'B', title:'Factura B', sub:'Consumidor Final · Sin CUIT', icon:'👤' },
                { key:'A', title:'Factura A', sub:'Empresa · Requiere CUIT', icon:'🏢' },
              ].map(opt => (
                <div key={opt.key} onClick={() => setTipo(opt.key)} style={{
                  ...glassLight({ padding:'14px 16px', borderRadius:14, cursor:'pointer',
                    border: tipo === opt.key ? `2px solid ${G.teal}` : '1px solid rgba(255,255,255,0.7)',
                    background: tipo === opt.key ? 'rgba(29,158,117,0.08)' : 'rgba(255,255,255,0.65)',
                  })
                }}>
                  <div style={{ fontSize:18, marginBottom:5 }}>{opt.icon}</div>
                  <div style={{ fontSize:13, fontWeight:700, color: tipo === opt.key ? G.teal : G.text }}>{opt.title}</div>
                  <div style={{ fontSize:11, color:G.textFaint, marginTop:2 }}>{opt.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Datos cliente (solo Factura A) */}
          {tipo === 'A' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:18 }}>
              <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.08em' }}>Datos del cliente</div>
              {[
                { label:'CUIT *', val:cuitCliente, set:setCuitCliente, placeholder:'30123456789', hint:'Sin guiones' },
                { label:'Razón social *', val:razonCliente, set:setRazonCliente, placeholder:'Empresa S.A.' },
                { label:'Email (opcional)', val:emailCliente, set:setEmailCliente, placeholder:'contacto@empresa.com' },
                { label:'Domicilio (opcional)', val:domicilioCliente, set:setDomicilioCliente, placeholder:'Av. Corrientes 1234' },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize:11, fontWeight:600, color:G.textMuted, marginBottom:4 }}>{f.label}</div>
                  <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                    style={{ width:'100%', padding:'9px 12px', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(255,255,255,0.65)', borderRadius:10, fontSize:13, color:G.text, outline:'none', boxSizing:'border-box' }} />
                  {f.hint && <div style={{ fontSize:10, color:G.textFaint, marginTop:3 }}>{f.hint}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Resumen ítems */}
          <div style={{ ...glassLight({ padding:'12px 14px', borderRadius:12, marginBottom:16 }) }}>
            <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Detalle</div>
            {items.slice(0, 4).map((it, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:G.textMid, padding:'3px 0' }}>
                <span>{it.qty}x {it.nombre}</span>
                <span>{money(it.precio * it.qty)}</span>
              </div>
            ))}
            {items.length > 4 && <div style={{ fontSize:11, color:G.textFaint, marginTop:4 }}>...y {items.length - 4} ítems más</div>}
            {descuento > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:G.red, padding:'3px 0', borderTop:'0.5px solid rgba(0,0,0,0.06)', marginTop:6, paddingTop:6 }}>
                <span>Descuento</span><span>-{money(descuento)}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700, color:G.text, borderTop:'1px solid rgba(0,0,0,0.08)', marginTop:8, paddingTop:8 }}>
              <span>Total a facturar</span><span style={{ color:G.teal }}>{money(totalFacturado)}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background:'rgba(226,75,74,0.08)', border:'1px solid rgba(226,75,74,0.25)', borderRadius:10, padding:'10px 14px', fontSize:12, color:G.red, marginBottom:14, lineHeight:1.5 }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* No configurado */}
          {!cfg.habilitado && (
            <div style={{ background:'rgba(239,159,39,0.08)', border:'1px solid rgba(239,159,39,0.25)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#92600A', marginBottom:14 }}>
              La facturación no está activada. Activala en <strong>Configuración → Facturación</strong>.
            </div>
          )}

          {/* Botones */}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose} style={{ flex:1, padding:'11px 0', border:'1px solid rgba(0,0,0,0.10)', borderRadius:12, fontSize:13, color:G.textMid, background:'rgba(255,255,255,0.6)', cursor:'pointer' }}>
              Omitir
            </button>
            <button onClick={handleEmitir} disabled={emitiendo || !cfg.habilitado} style={{
              flex:2, padding:'11px 0', border:'none', borderRadius:12, fontSize:13, fontWeight:700,
              color:'white', background: G.teal, cursor: (emitiendo || !cfg.habilitado) ? 'not-allowed' : 'pointer',
              opacity: (emitiendo || !cfg.habilitado) ? 0.5 : 1,
              boxShadow:`0 4px 14px rgba(29,158,117,0.28)`,
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            }}>
              {emitiendo ? (
                <>
                  <div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTop:'2px solid white', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
                  Consultando AFIP...
                </>
              ) : `Emitir Factura ${tipo}`}
            </button>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        </>)}
      </div>
    </div>
  );
}
