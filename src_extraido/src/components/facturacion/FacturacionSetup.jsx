import { useState, useEffect } from 'react';
import { getAfipConfig, saveAfipConfig, DEFAULT_AFIP_CONFIG, testAfipConexion, CONDICION_IVA_EMISOR } from '@/lib/afip';
import { G, glass, glassDeep, glassLight, labelStyle, fontDisplay } from '@/lib/glass';

function Field({ label, children, hint }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <span style={{ fontSize:11, color:G.textFaint }}>{hint}</span>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type='text', mono=false, style={} }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ padding:'9px 12px', border:'1px solid rgba(255,255,255,0.65)', background:'rgba(255,255,255,0.65)', borderRadius:10, fontSize: mono ? 12 : 13, color:G.text, outline:'none', width:'100%', boxSizing:'border-box', fontFamily: mono ? 'monospace' : 'inherit', ...style }} />
  );
}

function Toggle({ value, onChange, label, sub }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
      <div onClick={() => onChange(!value)} style={{ width:40, height:22, borderRadius:99, background: value ? G.teal : 'rgba(0,0,0,0.15)', position:'relative', transition:'background 0.2s', cursor:'pointer', flexShrink:0, marginTop:2 }}>
        <div style={{ position:'absolute', top:2, left: value ? 20 : 2, width:18, height:18, borderRadius:'50%', background:'white', transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
      </div>
      <div>
        <div style={{ fontSize:13, color:G.textMid, fontWeight:500 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:G.textFaint, marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function FacturacionSetup() {
  const [cfg, setCfg] = useState(getAfipConfig());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'error'
  const [testMsg, setTestMsg] = useState('');
  const [saved, setSaved] = useState(false);

  function set(key, val) { setCfg(prev => ({ ...prev, [key]: val })); setSaved(false); setTestResult(null); }

  function handleSave() {
    saveAfipConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTest() {
    setTesting(true); setTestResult(null); setTestMsg('');
    try {
      await testAfipConexion(cfg);
      setTestResult('ok');
      setTestMsg('Conexión exitosa con TusFacturasAPP ✓');
    } catch(e) {
      setTestResult('error');
      setTestMsg(e.message);
    }
    setTesting(false);
  }

  const sectionTitle = (title) => (
    <div style={{ fontSize:13, fontWeight:700, color:G.text, fontFamily:fontDisplay, marginBottom:14, paddingBottom:8, borderBottom:'1px solid rgba(255,255,255,0.5)' }}>{title}</div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18, maxWidth:640 }}>

      {/* Banner informativo */}
      <div style={{ ...glassLight({ padding:'14px 18px', borderRadius:14, border:'1px solid rgba(29,158,117,0.25)', background:'rgba(29,158,117,0.06)' }) }}>
        <div style={{ fontSize:13, fontWeight:700, color:G.teal, marginBottom:6 }}>¿Cómo funciona?</div>
        <div style={{ fontSize:12, color:G.textMid, lineHeight:1.6 }}>
          mimenú usa <strong>TusFacturasAPP</strong> para conectarse con AFIP/ARCA. El restaurante necesita crear
          una cuenta gratuita en <strong>tusfacturas.app</strong> (1 mes gratis, luego ~$8 USD/mes) y pegar
          sus credenciales API acá. Después, al cerrar cada mesa, el sistema emite la factura automáticamente
          y la AFIP devuelve el CAE en segundos.
        </div>
        <a href="https://www.tusfacturas.app" target="_blank" rel="noopener noreferrer"
          style={{ display:'inline-block', marginTop:8, fontSize:12, color:G.teal, fontWeight:600 }}>
          Crear cuenta en TusFacturasAPP →
        </a>
      </div>

      {/* Activar */}
      <div style={{ ...glass({ padding:'20px 24px' }) }}>
        <Toggle
          value={cfg.habilitado}
          onChange={v => set('habilitado', v)}
          label="Activar facturación electrónica AFIP"
          sub="Al activar, aparecerá el botón para emitir factura al cerrar cada mesa"
        />
      </div>

      {cfg.habilitado && (<>

        {/* Credenciales API */}
        <div style={{ ...glassDeep({ padding:'20px 24px' }) }}>
          {sectionTitle('Credenciales TusFacturasAPP')}
          <div style={{ ...glassLight({ padding:'10px 14px', borderRadius:10, marginBottom:16, fontSize:11, color:'#92600A', background:'rgba(239,159,39,0.08)', border:'1px solid rgba(239,159,39,0.2)' }) }}>
            Estas credenciales las encontrás en tu cuenta de tusfacturas.app → Mi perfil → API
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <Field label="User Token">
              <Input value={cfg.usertoken} onChange={v => set('usertoken', v)} placeholder="tu_usertoken_aqui" mono />
            </Field>
            <Field label="Token Client">
              <Input value={cfg.tokenclient} onChange={v => set('tokenclient', v)} placeholder="tu_tokenclient_aqui" mono />
            </Field>
            <Field label="API Token">
              <Input value={cfg.apitoken} onChange={v => set('apitoken', v)} placeholder="tu_apitoken_aqui" mono />
            </Field>
          </div>

          {/* Test conexión */}
          <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={handleTest} disabled={testing || !cfg.usertoken || !cfg.tokenclient || !cfg.apitoken}
              style={{ padding:'7px 18px', background:G.teal, border:'none', borderRadius:10, fontSize:12, fontWeight:700, color:'white', cursor:'pointer', opacity: (!cfg.usertoken || testing) ? 0.5 : 1 }}>
              {testing ? 'Probando...' : 'Probar conexión'}
            </button>
            {testResult && (
              <span style={{ fontSize:12, fontWeight:600, color: testResult === 'ok' ? G.teal : G.red }}>
                {testMsg}
              </span>
            )}
          </div>
        </div>

        {/* Datos del emisor */}
        <div style={{ ...glass({ padding:'20px 24px' }) }}>
          {sectionTitle('Datos del emisor (tu restaurante)')}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field label="CUIT" hint="Sin guiones">
                <Input value={cfg.cuit} onChange={v => set('cuit', v)} placeholder="20123456789" />
              </Field>
              <Field label="Punto de venta AFIP" hint="Ej: 00001">
                <Input value={cfg.punto_venta} onChange={v => set('punto_venta', v)} placeholder="00001" />
              </Field>
            </div>
            <Field label="Razón social">
              <Input value={cfg.razon_social} onChange={v => set('razon_social', v)} placeholder="Mi Restaurante S.A." />
            </Field>
            <Field label="Domicilio fiscal">
              <Input value={cfg.domicilio} onChange={v => set('domicilio', v)} placeholder="Av. Corrientes 1234, CABA" />
            </Field>
            <Field label="Condición frente al IVA">
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(CONDICION_IVA_EMISOR).map(([key, label]) => (
                  <button key={key} onClick={() => set('condicion_iva', key)} style={{
                    padding:'7px 16px', borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', border:'none', transition:'all .15s',
                    background: cfg.condicion_iva === key ? G.teal : 'rgba(255,255,255,0.6)',
                    color: cfg.condicion_iva === key ? 'white' : G.textMuted,
                  }}>{label}</button>
                ))}
              </div>
            </Field>
            <Field label="Alícuota IVA" hint="La mayoría de los servicios gastronómicos son 21%">
              <div style={{ display:'flex', gap:8 }}>
                {[21, 10.5, 0].map(ali => (
                  <button key={ali} onClick={() => set('alicuota_iva', ali)} style={{
                    padding:'7px 16px', borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
                    background: cfg.alicuota_iva === ali ? G.teal : 'rgba(255,255,255,0.6)',
                    color: cfg.alicuota_iva === ali ? 'white' : G.textMuted,
                  }}>{ali}%</button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        {/* Comportamiento */}
        <div style={{ ...glass({ padding:'20px 24px' }) }}>
          {sectionTitle('Comportamiento')}
          <Toggle
            value={cfg.auto_factura}
            onChange={v => set('auto_factura', v)}
            label="Preguntar siempre si emitir factura"
            sub="Si está desactivado, el sistema solo ofrece factura cuando el cajero lo pide manualmente"
          />
        </div>

      </>)}

      {/* Guardar */}
      <div>
        <button onClick={handleSave} style={{ padding:'10px 28px', background:G.teal, border:'none', borderRadius:12, fontSize:14, fontWeight:700, color:'white', cursor:'pointer', boxShadow:`0 4px 14px rgba(29,158,117,0.28)` }}>
          {saved ? '✓ Guardado' : 'Guardar configuración'}
        </button>
      </div>

    </div>
  );
}
