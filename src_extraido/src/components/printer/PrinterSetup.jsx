import { useState, useEffect } from 'react';
import { getPrinterConfig, savePrinterConfig, DEFAULT_CONFIG, connectEpson, disconnectEpson, getEpsonStatus, onEpsonStatusChange, printReceipt, printComanda } from '@/lib/printer';
import { useStore } from '@/lib/store';
import { G, glass, glassDeep, glassLight, labelStyle, fontDisplay } from '@/lib/glass';

const STATUS_LABEL = { disconnected:'Sin conectar', connecting:'Conectando...', connected:'Conectada', error:'Error de conexión' };
const STATUS_COLOR = { disconnected:G.textFaint, connecting:G.amber, connected:G.teal, error:G.red };

function Field({ label, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type='text', style={} }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ padding:'9px 12px', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(255,255,255,0.65)', borderRadius:10, fontSize:13, color:G.text, outline:'none', width:'100%', boxSizing:'border-box', ...style }} />
  );
}

function Toggle({ value, onChange, label }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
      <div onClick={() => onChange(!value)} style={{
        width:40, height:22, borderRadius:99, background: value ? G.teal : 'rgba(0,0,0,0.15)',
        position:'relative', transition:'background 0.2s', cursor:'pointer', flexShrink:0,
      }}>
        <div style={{ position:'absolute', top:2, left: value ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'white', transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
      </div>
      <span style={{ fontSize:13, color:G.textMid }}>{label}</span>
    </label>
  );
}

export default function PrinterSetup() {
  const store = useStore();
  const [cfg, setCfg] = useState(getPrinterConfig());
  const [epsonStatus, setEpsonStatus] = useState(getEpsonStatus());
  const [testingPrint, setTestingPrint] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    return onEpsonStatusChange(setEpsonStatus);
  }, []);

  function set(key, val) { setCfg(prev => ({ ...prev, [key]: val })); setSaved(false); }

  function handleSave() {
    savePrinterConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleConnect() {
    try { await connectEpson(cfg.epsonIp, cfg.epsonPort); }
    catch(e) { alert(e.message); }
  }

  async function handleTestReceipt() {
    setTestingPrint(true);
    try {
      await printReceipt({
        mesa: 5,
        mozo: 'Valentina',
        items: [
          { nombre: 'Lomo Wellington', precio: 21000, qty: 2, nota: '' },
          { nombre: 'Agua mineral', precio: 1500, qty: 1, nota: '' },
          { nombre: 'Tiramisú', precio: 8500, qty: 1, nota: 'sin café' },
        ],
        subtotal: 52000,
        descuento: 0,
        propina: 5200,
        total: 57200,
        metodo: 'Tarjeta',
      }, cfg);
    } catch(e) { alert('Error al imprimir: ' + e.message); }
    setTestingPrint(false);
  }

  async function handleTestComanda() {
    setTestingPrint(true);
    try {
      await printComanda({
        mesa: 5,
        mozo: 'Valentina',
        items: [
          { nombre: 'Lomo Wellington', qty: 2, nota: 'término medio' },
          { nombre: 'Tiramisú', qty: 1, nota: 'sin café' },
        ],
      }, cfg);
    } catch(e) { alert('Error al imprimir: ' + e.message); }
    setTestingPrint(false);
  }

  const sectionTitle = (title) => (
    <div style={{ fontSize:13, fontWeight:700, color:G.text, fontFamily:fontDisplay, marginBottom:12, paddingBottom:8, borderBottom:'1px solid rgba(255,255,255,0.5)' }}>{title}</div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18, maxWidth:640 }}>

      {/* Método de impresión */}
      <div style={{ ...glassDeep({ padding:'20px 24px' }) }}>
        {sectionTitle('Método de impresión')}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[
            { key:'browser', title:'Cualquier impresora', sub:'Abre diálogo del navegador. Funciona con USB, red, cualquier marca.' },
            { key:'epson',   title:'Epson por red (ePOS)', sub:'Sin diálogo, instantáneo. Requiere impresora Epson con WiFi/Ethernet.' },
          ].map(opt => (
            <div key={opt.key} onClick={() => set('method', opt.key)} style={{
              ...glassLight({ padding:'14px 16px', borderRadius:14, cursor:'pointer',
                border: cfg.method === opt.key ? `2px solid ${G.teal}` : '1px solid rgba(255,255,255,0.7)',
                background: cfg.method === opt.key ? 'rgba(29,158,117,0.08)' : 'rgba(255,255,255,0.6)',
              })
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${cfg.method === opt.key ? G.teal : '#D1D5DB'}`, background: cfg.method === opt.key ? G.teal : 'transparent', flexShrink:0 }} />
                <span style={{ fontSize:13, fontWeight:700, color:G.text }}>{opt.title}</span>
              </div>
              <p style={{ fontSize:11, color:G.textFaint, lineHeight:1.4, margin:0 }}>{opt.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Config Epson */}
      {cfg.method === 'epson' && (
        <div style={{ ...glass({ padding:'20px 24px' }) }}>
          {sectionTitle('Configuración Epson')}

          {/* Alerta SDK */}
          <div style={{ background:'rgba(239,159,39,0.10)', border:'1px solid rgba(239,159,39,0.3)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#92600A' }}>
            <strong>Paso previo:</strong> Descargá el SDK de Epson desde <em>download.epson-biz.com</em>, copiá <code>epos-2.27.0.js</code> a la carpeta <code>/public/</code> de tu proyecto y agregá en <code>index.html</code>:<br/>
            <code style={{ display:'block', marginTop:4 }}>{`<script src="/epos-2.27.0.js"></script>`}</code>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, marginBottom:12 }}>
            <Field label="IP de la impresora">
              <Input value={cfg.epsonIp} onChange={v => set('epsonIp', v)} placeholder="192.168.1.100" />
            </Field>
            <Field label="Puerto">
              <Input value={cfg.epsonPort} onChange={v => set('epsonPort', Number(v))} type="number" style={{ width:90 }} />
            </Field>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:STATUS_COLOR[epsonStatus] }} />
              <span style={{ fontSize:12, color:STATUS_COLOR[epsonStatus], fontWeight:600 }}>{STATUS_LABEL[epsonStatus]}</span>
            </div>
            <div style={{ flex:1 }} />
            {epsonStatus === 'connected'
              ? <button onClick={disconnectEpson} style={{ ...glassLight({ padding:'6px 14px', borderRadius:10, fontSize:12, color:G.red, cursor:'pointer', border:`1px solid rgba(226,75,74,0.3)` }) }}>Desconectar</button>
              : <button onClick={handleConnect} disabled={!cfg.epsonIp || epsonStatus === 'connecting'} style={{ padding:'6px 16px', background:G.teal, border:'none', borderRadius:10, fontSize:12, color:'white', cursor:'pointer', fontWeight:600, opacity: !cfg.epsonIp || epsonStatus === 'connecting' ? 0.5 : 1 }}>
                  {epsonStatus === 'connecting' ? 'Conectando...' : 'Conectar'}
                </button>
            }
          </div>
        </div>
      )}

      {/* Papel */}
      <div style={{ ...glass({ padding:'20px 24px' }) }}>
        {sectionTitle('Tamaño de papel')}
        <div style={{ display:'flex', gap:10 }}>
          {[58, 80].map(mm => (
            <div key={mm} onClick={() => set('paperWidth', mm)} style={{
              ...glassLight({ padding:'12px 20px', borderRadius:12, cursor:'pointer',
                border: cfg.paperWidth === mm ? `2px solid ${G.teal}` : '1px solid rgba(255,255,255,0.7)',
                background: cfg.paperWidth === mm ? 'rgba(29,158,117,0.08)' : 'rgba(255,255,255,0.6)',
              })
            }}>
              <div style={{ fontSize:18, fontWeight:800, color: cfg.paperWidth === mm ? G.teal : G.textMid }}>{mm}mm</div>
              <div style={{ fontSize:11, color:G.textFaint }}>{mm === 58 ? 'Rollo chico' : 'Rollo estándar'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Datos del local */}
      <div style={{ ...glass({ padding:'20px 24px' }) }}>
        {sectionTitle('Datos del local (encabezado del ticket)')}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Nombre del local">
            <Input value={cfg.nombreLocal} onChange={v => set('nombreLocal', v)} placeholder="Mi Restaurante" />
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Dirección">
              <Input value={cfg.direccion} onChange={v => set('direccion', v)} placeholder="Av. Corrientes 1234, CABA" />
            </Field>
            <Field label="Teléfono">
              <Input value={cfg.telefono} onChange={v => set('telefono', v)} placeholder="(011) 4444-5555" />
            </Field>
          </div>
          <Field label="CUIT">
            <Input value={cfg.cuit} onChange={v => set('cuit', v)} placeholder="30-12345678-9" style={{ maxWidth:200 }} />
          </Field>
          <Field label="Mensaje al pie del ticket">
            <Input value={cfg.mensajePie} onChange={v => set('mensajePie', v)} placeholder="Gracias por su visita" />
          </Field>
        </div>
      </div>

      {/* Comportamiento */}
      <div style={{ ...glass({ padding:'20px 24px' }) }}>
        {sectionTitle('Comportamiento')}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Toggle value={cfg.autoPrintRecibo} onChange={v => set('autoPrintRecibo', v)} label="Imprimir ticket automáticamente al cerrar mesa" />
          <Toggle value={cfg.autoPrintComanda} onChange={v => set('autoPrintComanda', v)} label="Imprimir comanda automáticamente al enviar a cocina" />
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:13, color:G.textMid }}>Copias de comanda</span>
            <div style={{ display:'flex', alignItems:'center', gap:6, ...glassLight({ padding:'4px 8px', borderRadius:10, border:'1px solid rgba(255,255,255,0.7)' }) }}>
              <button onClick={() => set('copiasComanda', Math.max(1, cfg.copiasComanda - 1))} style={{ width:26, height:26, border:'none', background:'none', cursor:'pointer', fontSize:16, color:G.textMid }}>−</button>
              <span style={{ fontSize:14, fontWeight:700, color:G.text, minWidth:20, textAlign:'center' }}>{cfg.copiasComanda}</span>
              <button onClick={() => set('copiasComanda', Math.min(3, cfg.copiasComanda + 1))} style={{ width:26, height:26, border:'none', background:'none', cursor:'pointer', fontSize:16, color:G.textMid }}>+</button>
            </div>
            <span style={{ fontSize:11, color:G.textFaint }}>(ej: 2 → salón + cocina)</span>
          </div>
        </div>
      </div>

      {/* Botones */}
      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
        <button onClick={handleSave} style={{ padding:'10px 28px', background:G.teal, border:'none', borderRadius:12, fontSize:14, fontWeight:700, color:'white', cursor:'pointer', boxShadow:`0 4px 14px rgba(29,158,117,0.28)` }}>
          {saved ? '✓ Guardado' : 'Guardar configuración'}
        </button>
        <div style={{ flex:1 }} />
        <button onClick={handleTestComanda} disabled={testingPrint} style={{ ...glassLight({ padding:'9px 16px', borderRadius:12, fontSize:13, color:G.textMid, cursor:'pointer', border:'1px solid rgba(255,255,255,0.8)' }), opacity: testingPrint ? 0.5 : 1 }}>
          Probar comanda
        </button>
        <button onClick={handleTestReceipt} disabled={testingPrint} style={{ ...glassLight({ padding:'9px 16px', borderRadius:12, fontSize:13, color:G.textMid, cursor:'pointer', border:'1px solid rgba(255,255,255,0.8)' }), opacity: testingPrint ? 0.5 : 1 }}>
          Probar ticket
        </button>
      </div>

    </div>
  );
}
