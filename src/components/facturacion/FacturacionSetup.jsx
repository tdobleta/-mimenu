import { useEffect, useMemo, useState } from 'react';
import {
  CONDICION_IVA_EMISOR,
  DEFAULT_AFIP_CONFIG,
  getAfipConfig,
  loadAfipSettings,
  saveAfipSettings,
  testAfipConexion,
} from '@/lib/afip';
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
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        padding:'9px 12px',
        border:'1px solid rgba(255,255,255,0.65)',
        background:'rgba(255,255,255,0.65)',
        borderRadius:10,
        fontSize: mono ? 12 : 13,
        color:G.text,
        outline:'none',
        width:'100%',
        boxSizing:'border-box',
        fontFamily: mono ? 'monospace' : 'inherit',
        ...style,
      }}
    />
  );
}

function Toggle({ value, onChange, label, sub }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width:40,
          height:22,
          borderRadius:99,
          background: value ? G.teal : 'rgba(0,0,0,0.15)',
          position:'relative',
          transition:'background 0.2s',
          cursor:'pointer',
          flexShrink:0,
          marginTop:2,
        }}
      >
        <div style={{
          position:'absolute',
          top:2,
          left: value ? 20 : 2,
          width:18,
          height:18,
          borderRadius:'50%',
          background:'white',
          transition:'left 0.2s',
          boxShadow:'0 1px 4px rgba(0,0,0,0.2)',
        }} />
      </div>
      <div>
        <div style={{ fontSize:13, color:G.textMid, fontWeight:500 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:G.textFaint, marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

const emptyCredentials = { usertoken: false, tokenclient: false, apitoken: false };

export default function FacturacionSetup() {
  const [cfg, setCfg] = useState(getAfipConfig());
  const [credentials, setCredentials] = useState(emptyCredentials);
  const [restaurantId, setRestaurantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await loadAfipSettings();
        if (cancelled) return;
        setCfg({ ...DEFAULT_AFIP_CONFIG, ...data.config });
        setCredentials(data.credentials || emptyCredentials);
        setRestaurantId(data.restaurantId || null);
      } catch (err) {
        if (!cancelled) setStatusMsg(err.message || 'No se pudo cargar la configuracion fiscal.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const canTest = useMemo(() => {
    const formComplete = cfg.usertoken && cfg.tokenclient && cfg.apitoken;
    const storedComplete = credentials.usertoken && credentials.tokenclient && credentials.apitoken;
    return Boolean(formComplete || storedComplete);
  }, [cfg.usertoken, cfg.tokenclient, cfg.apitoken, credentials]);

  function set(key, val) {
    setCfg(prev => ({ ...prev, [key]: val }));
    setTestResult(null);
    setStatusMsg('');
  }

  async function handleSave() {
    setSaving(true);
    setTestResult(null);
    setStatusMsg('');
    try {
      const data = await saveAfipSettings(cfg, restaurantId);
      setCfg({ ...DEFAULT_AFIP_CONFIG, ...data.config });
      setCredentials(data.credentials || emptyCredentials);
      setRestaurantId(data.restaurantId || restaurantId);
      setStatusMsg('Configuracion guardada.');
      setTimeout(() => setStatusMsg(''), 2200);
    } catch (err) {
      setStatusMsg(err.message || 'No se pudo guardar la configuracion.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setStatusMsg('');
    try {
      await testAfipConexion(cfg, restaurantId);
      setTestResult('ok');
      setStatusMsg('Conexion exitosa con TusFacturasAPP.');
    } catch (err) {
      setTestResult('error');
      setStatusMsg(err.message || 'Credenciales invalidas.');
    } finally {
      setTesting(false);
    }
  }

  const sectionTitle = (title) => (
    <div style={{
      fontSize:13,
      fontWeight:700,
      color:G.text,
      fontFamily:fontDisplay,
      marginBottom:14,
      paddingBottom:8,
      borderBottom:'1px solid rgba(255,255,255,0.5)',
    }}>
      {title}
    </div>
  );

  const credentialHint = (key) => (
    credentials[key]
      ? 'Ya guardada en servidor. Dejala vacia para conservarla.'
      : 'Pegala una vez; no se vuelve a mostrar en pantalla.'
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18, maxWidth:640 }}>
      <div style={{ ...glassLight({ padding:'14px 18px', borderRadius:14, border:'1px solid rgba(29,158,117,0.25)', background:'rgba(29,158,117,0.06)' }) }}>
        <div style={{ fontSize:13, fontWeight:700, color:G.teal, marginBottom:6 }}>Como funciona</div>
        <div style={{ fontSize:12, color:G.textMid, lineHeight:1.6 }}>
          mimenu usa TusFacturasAPP para conectarse con AFIP/ARCA. Las credenciales se guardan del lado servidor:
          el navegador solo muestra si estan configuradas, pero no puede leerlas completas despues de guardarlas.
        </div>
        <a
          href="https://www.tusfacturas.app"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display:'inline-block', marginTop:8, fontSize:12, color:G.teal, fontWeight:600 }}
        >
          Crear cuenta en TusFacturasAPP
        </a>
      </div>

      {loading && (
        <div style={{ ...glass({ padding:'14px 18px', fontSize:12, color:G.textMuted }) }}>
          Cargando configuracion fiscal...
        </div>
      )}

      <div style={{ ...glass({ padding:'20px 24px' }) }}>
        <Toggle
          value={cfg.habilitado}
          onChange={v => set('habilitado', v)}
          label="Activar facturacion electronica AFIP"
          sub="Al activar, aparece el boton para emitir factura al cerrar una mesa."
        />
      </div>

      {cfg.habilitado && (
        <>
          <div style={{ ...glassDeep({ padding:'20px 24px' }) }}>
            {sectionTitle('Credenciales TusFacturasAPP')}
            <div style={{ ...glassLight({ padding:'10px 14px', borderRadius:10, marginBottom:16, fontSize:11, color:'#92600A', background:'rgba(239,159,39,0.08)', border:'1px solid rgba(239,159,39,0.2)' }) }}>
              Si ya estan guardadas, los campos aparecen vacios a proposito. Solo escribi una credencial cuando quieras reemplazarla.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <Field label="User Token" hint={credentialHint('usertoken')}>
                <Input
                  value={cfg.usertoken}
                  onChange={v => set('usertoken', v)}
                  placeholder={credentials.usertoken ? 'Configurado en servidor' : 'tu_usertoken_aqui'}
                  type="password"
                  mono
                />
              </Field>
              <Field label="Token Client" hint={credentialHint('tokenclient')}>
                <Input
                  value={cfg.tokenclient}
                  onChange={v => set('tokenclient', v)}
                  placeholder={credentials.tokenclient ? 'Configurado en servidor' : 'tu_tokenclient_aqui'}
                  type="password"
                  mono
                />
              </Field>
              <Field label="API Token" hint={credentialHint('apitoken')}>
                <Input
                  value={cfg.apitoken}
                  onChange={v => set('apitoken', v)}
                  placeholder={credentials.apitoken ? 'Configurado en servidor' : 'tu_apitoken_aqui'}
                  type="password"
                  mono
                />
              </Field>
            </div>

            <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <button
                onClick={handleTest}
                disabled={testing || !canTest}
                style={{
                  padding:'7px 18px',
                  background:G.teal,
                  border:'none',
                  borderRadius:10,
                  fontSize:12,
                  fontWeight:700,
                  color:'white',
                  cursor:'pointer',
                  opacity: (!canTest || testing) ? 0.5 : 1,
                }}
              >
                {testing ? 'Probando...' : 'Probar conexion'}
              </button>
              {testResult && (
                <span style={{ fontSize:12, fontWeight:600, color: testResult === 'ok' ? G.teal : G.red }}>
                  {statusMsg}
                </span>
              )}
            </div>
          </div>

          <div style={{ ...glass({ padding:'20px 24px' }) }}>
            {sectionTitle('Datos del emisor')}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Field label="CUIT" hint="Sin guiones">
                  <Input value={cfg.cuit} onChange={v => set('cuit', v)} placeholder="20123456789" />
                </Field>
                <Field label="Punto de venta AFIP" hint="Ej: 00001">
                  <Input value={cfg.punto_venta} onChange={v => set('punto_venta', v)} placeholder="00001" />
                </Field>
              </div>
              <Field label="Razon social">
                <Input value={cfg.razon_social} onChange={v => set('razon_social', v)} placeholder="Mi Restaurante S.A." />
              </Field>
              <Field label="Domicilio fiscal">
                <Input value={cfg.domicilio} onChange={v => set('domicilio', v)} placeholder="Av. Corrientes 1234, CABA" />
              </Field>
              <Field label="Condicion frente al IVA">
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {Object.entries(CONDICION_IVA_EMISOR).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => set('condicion_iva', key)}
                      style={{
                        padding:'7px 16px',
                        borderRadius:10,
                        fontSize:12,
                        fontWeight:600,
                        cursor:'pointer',
                        border:'none',
                        transition:'all .15s',
                        background: cfg.condicion_iva === key ? G.teal : 'rgba(255,255,255,0.6)',
                        color: cfg.condicion_iva === key ? 'white' : G.textMuted,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Alicuota IVA" hint="La mayoria de los servicios gastronomicos son 21%">
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {[21, 10.5, 0].map(ali => (
                    <button
                      key={ali}
                      onClick={() => set('alicuota_iva', ali)}
                      style={{
                        padding:'7px 16px',
                        borderRadius:10,
                        fontSize:12,
                        fontWeight:600,
                        cursor:'pointer',
                        border:'none',
                        background: cfg.alicuota_iva === ali ? G.teal : 'rgba(255,255,255,0.6)',
                        color: cfg.alicuota_iva === ali ? 'white' : G.textMuted,
                      }}
                    >
                      {ali}%
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>

          <div style={{ ...glass({ padding:'20px 24px' }) }}>
            {sectionTitle('Comportamiento')}
            <Toggle
              value={cfg.auto_factura}
              onChange={v => set('auto_factura', v)}
              label="Preguntar siempre si emitir factura"
              sub="Si esta desactivado, el sistema solo ofrece factura cuando el cajero lo pide manualmente."
            />
          </div>
        </>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding:'10px 28px',
            background:G.teal,
            border:'none',
            borderRadius:12,
            fontSize:14,
            fontWeight:700,
            color:'white',
            cursor:'pointer',
            opacity: saving ? 0.65 : 1,
            boxShadow:`0 4px 14px rgba(29,158,117,0.28)`,
          }}
        >
          {saving ? 'Guardando...' : 'Guardar configuracion'}
        </button>
        {statusMsg && !testResult && (
          <span style={{ fontSize:12, color: statusMsg.includes('No se') ? G.red : G.teal, fontWeight:600 }}>
            {statusMsg}
          </span>
        )}
      </div>
    </div>
  );
}
