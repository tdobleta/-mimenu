import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { supabase } from '@/api/supabaseClient';
import { G } from '@/lib/glass';

function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ fontSize:12, fontWeight:600, color:G.textMuted, marginBottom:4 }}>{label}</div>
      {hint && <div style={{ fontSize:11, color:G.textFaint, marginBottom:6, lineHeight:'16px' }}>{hint}</div>}
      {children}
    </div>
  );
}

const INPUT = {
  width: '100%',
  padding: '8px 11px',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  fontSize: 13,
  color: G.text,
  background: '#FFFFFF',
  boxSizing: 'border-box',
  outline: 'none',
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

function StatusDot({ ok, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ width:8, height:8, borderRadius:'50%', background: ok ? '#1D9E75' : '#9CA3AF', flexShrink:0 }} />
      <span style={{ fontSize:12, color: ok ? '#1D9E75' : G.textFaint, fontWeight:500 }}>{label}</span>
    </div>
  );
}

async function invokeMpSettings(body) {
  const { data, error } = await supabase.functions.invoke('mp-settings', { body });
  if (error) throw new Error(error.message || 'No se pudo acceder a Mercado Pago');
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function TerminalTab() {
  const store = useStore();
  const { addToast } = useToast();
  const rid = store.restaurantId;

  const [token, setToken] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [devices, setDevices] = useState([]);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!rid) return undefined;
    (async () => {
      setLoading(true);
      try {
        const data = await invokeMpSettings({ action: 'load', restaurantId: rid });
        if (cancelled) return;
        setDeviceId(data.config?.mp_device_id || '');
        setToken('');
        setTokenConfigured(Boolean(data.credentials?.mp_access_token));
      } catch (err) {
        if (!cancelled) addToast('No se pudo cargar la terminal: ' + (err.message || 'revisar conexion'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rid, addToast]);

  const canUseToken = useMemo(() => Boolean(token.trim() || tokenConfigured), [token, tokenConfigured]);
  const hasConfig = Boolean(canUseToken && deviceId.trim());

  async function handleSave() {
    if (!rid) return;
    setSaving(true);
    try {
      const data = await invokeMpSettings({
        action: 'save',
        restaurantId: rid,
        accessToken: token.trim() || undefined,
        deviceId: deviceId.trim() || undefined,
      });
      setToken('');
      setTokenConfigured(Boolean(data.credentials?.mp_access_token));
      setDeviceId(data.config?.mp_device_id || deviceId.trim());
      setTestResult(null);
      addToast('Configuracion guardada', 'success');
    } catch (err) {
      addToast('Error al guardar: ' + (err.message || 'revisar conexion'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDetect() {
    if (!canUseToken) {
      addToast('Ingresa el Access Token o guarda uno antes de detectar terminales', 'error');
      return;
    }
    setDetecting(true);
    setDevices([]);
    try {
      const data = await invokeMpSettings({
        action: 'detect',
        restaurantId: rid,
        accessToken: token.trim() || undefined,
      });
      const list = data.devices || [];
      setDevices(list);
      if (list.length === 0) addToast('No se encontraron terminales registradas en esta cuenta MP', 'warning');
    } catch (err) {
      addToast('Error: ' + (err.message || 'no se pudo conectar con Mercado Pago'), 'error');
    } finally {
      setDetecting(false);
    }
  }

  async function handleTest() {
    if (!hasConfig) {
      addToast('Completa Access Token y Device ID antes de probar', 'error');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await invokeMpSettings({
        action: 'test',
        restaurantId: rid,
        accessToken: token.trim() || undefined,
        deviceId: deviceId.trim(),
      });
      setTestResult('ok');
      addToast('Terminal conectada correctamente', 'success');
    } catch (err) {
      setTestResult('error');
      addToast('Error: ' + (err.message || 'no se pudo conectar con la terminal'), 'error');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding:32, textAlign:'center', color:G.textFaint, fontSize:13 }}>
        Cargando configuracion...
      </div>
    );
  }

  return (
    <div style={{ maxWidth:600, display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'14px 16px' }}>
        <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" style={{ flexShrink:0, marginTop:1 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{ fontSize:12, color:'#1E40AF', lineHeight:'18px' }}>
            <strong>Mercado Pago Point</strong>: necesitas una cuenta de negocio verificada, una terminal Point
            asociada y el Access Token de produccion. El token se guarda del lado servidor y no vuelve a mostrarse.
          </div>
        </div>
      </div>

      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 16px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
          Estado de la integracion
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <StatusDot ok={tokenConfigured || !!token.trim()} label={(tokenConfigured || token.trim()) ? 'Access Token configurado' : 'Access Token no configurado'} />
          <StatusDot ok={!!deviceId} label={deviceId ? `Terminal: ${deviceId}` : 'Sin terminal seleccionada'} />
          {testResult === 'ok' && <StatusDot ok={true} label="Conexion verificada" />}
          {testResult === 'error' && <StatusDot ok={false} label="Error de conexion - revisa los datos" />}
        </div>
      </div>

      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:12, padding:'20px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:G.text, marginBottom:16 }}>
          Credenciales Mercado Pago
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Field
            label="Access Token de produccion"
            hint={tokenConfigured ? 'Ya guardado en servidor. Dejalo vacio para conservarlo.' : "Empieza con 'APP_USR-'. No se vuelve a mostrar despues de guardar."}
          >
            <div style={{ position:'relative' }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => { setToken(e.target.value); setTestResult(null); }}
                placeholder={tokenConfigured ? 'Configurado en servidor' : 'APP_USR-123456789012345678-...'}
                style={{ ...INPUT, paddingRight:42 }}
              />
              <button
                onClick={() => setShowToken(v => !v)}
                style={{
                  position:'absolute',
                  right:10,
                  top:'50%',
                  transform:'translateY(-50%)',
                  background:'none',
                  border:'none',
                  cursor:'pointer',
                  color:G.textFaint,
                  padding:2,
                }}
                title={showToken ? 'Ocultar' : 'Mostrar'}
              >
                {showToken
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </Field>

          <Field
            label="Device ID"
            hint="Usa Detectar terminales para obtenerlo automaticamente. La terminal debe estar encendida y vinculada a la cuenta."
          >
            <div style={{ display:'flex', gap:8 }}>
              <input
                type="text"
                value={deviceId}
                onChange={e => { setDeviceId(e.target.value); setTestResult(null); }}
                placeholder="PAX_A910__SMARTPOS123456789"
                style={{ ...INPUT, flex:1 }}
              />
              <button
                onClick={handleDetect}
                disabled={detecting || !canUseToken}
                style={{
                  padding:'8px 14px',
                  border:'1px solid #E2E8F0',
                  borderRadius:8,
                  fontSize:12,
                  fontWeight:600,
                  cursor: detecting || !canUseToken ? 'not-allowed' : 'pointer',
                  background:'#FFFFFF',
                  color: detecting || !canUseToken ? G.textFaint : G.text,
                  whiteSpace:'nowrap',
                  flexShrink:0,
                }}
              >
                {detecting ? 'Detectando...' : 'Detectar'}
              </button>
            </div>
          </Field>

          {devices.length > 0 && (
            <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden' }}>
              <div style={{ padding:'8px 12px', borderBottom:'1px solid #E2E8F0', fontSize:11, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.07em' }}>
                Terminales disponibles
              </div>
              {devices.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDeviceId(d.id)}
                  style={{
                    width:'100%',
                    textAlign:'left',
                    padding:'10px 12px',
                    background: deviceId === d.id ? '#F0FBF7' : 'transparent',
                    border:'none',
                    borderBottom:'1px solid #F1F5F9',
                    cursor:'pointer',
                    display:'flex',
                    justifyContent:'space-between',
                    alignItems:'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:G.text }}>{d.model || d.id}</div>
                    <div style={{ fontSize:11, color:G.textFaint, fontFamily:'monospace', marginTop:2 }}>{d.id}</div>
                  </div>
                  {deviceId === d.id && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:8, marginTop:20 }}>
          <button
            onClick={handleTest}
            disabled={testing || !hasConfig}
            style={{
              padding:'9px 16px',
              border:'1px solid #E2E8F0',
              borderRadius:8,
              fontSize:13,
              fontWeight:600,
              cursor: testing || !hasConfig ? 'not-allowed' : 'pointer',
              background:'#FFFFFF',
              color: !hasConfig ? G.textFaint : G.text,
              opacity: testing ? 0.7 : 1,
            }}
          >
            {testing ? 'Probando...' : 'Probar conexion'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex:1,
              padding:'9px 0',
              border:'none',
              borderRadius:8,
              fontSize:13,
              fontWeight:600,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? G.textFaint : '#1D9E75',
              color:'white',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:12, padding:'16px 20px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:G.text, marginBottom:12 }}>
          Como obtener las credenciales
        </div>
        <ol style={{ margin:0, padding:'0 0 0 20px', display:'flex', flexDirection:'column', gap:8 }}>
          {[
            <>Entra a <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer" style={{ color:G.teal }}>mercadopago.com.ar/developers</a></>,
            'Crea una aplicacion o usa una existente.',
            'Ir a Credenciales -> Produccion -> copiar el Access Token.',
            'El Device ID se obtiene con Detectar terminales.',
          ].map((step, i) => (
            <li key={i} style={{ fontSize:12, color:G.textMid, lineHeight:'18px' }}>{step}</li>
          ))}
        </ol>
      </div>

      {hasConfig && (
        <div style={{ background:'#F0FBF7', border:'1px solid #A7F3D0', borderRadius:10, padding:'12px 14px' }}>
          <div style={{ fontSize:12, color:'#065F46', lineHeight:'18px' }}>
            <strong>Listo para usar:</strong> al cerrar una mesa aparece Terminal MP como metodo de pago.
          </div>
        </div>
      )}
    </div>
  );
}
