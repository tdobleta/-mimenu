import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { supabase } from '@/api/supabaseClient';
import { G } from '@/lib/glass';

// ── helpers ───────────────────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
export default function TerminalTab() {
  const store    = useStore();
  const { addToast } = useToast();
  const rid      = store.restaurantId;

  // Campos del formulario
  const [token,    setToken]    = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Estado UI
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [testing,   setTesting]   = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [devices,   setDevices]   = useState([]);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'error'

  // ── Cargar settings actuales ─────────────────────────────────────────────
  useEffect(() => {
    if (!rid) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('restaurant_settings')
        .select('mp_access_token, mp_device_id')
        .eq('restaurant_id', rid)
        .single();
      if (data) {
        setToken(data.mp_access_token || '');
        setDeviceId(data.mp_device_id || '');
      }
      setLoading(false);
    })();
  }, [rid]);

  // ── Guardar ──────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!rid) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('restaurant_settings')
        .upsert(
          { restaurant_id: rid, mp_access_token: token.trim() || null, mp_device_id: deviceId.trim() || null },
          { onConflict: 'restaurant_id' }
        );
      if (error) throw error;
      addToast('Configuración guardada', 'success');
      setTestResult(null);
    } catch (err) {
      addToast('Error al guardar: ' + (err.message || 'revisar conexión'), 'error');
    }
    setSaving(false);
  }

  // ── Detectar terminales via Edge Function ─────────────────────────────────
  async function handleDetect() {
    if (!token.trim()) { addToast('Ingresá el Access Token primero', 'error'); return; }
    setDetecting(true);
    setDevices([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/mp-list-devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ accessToken: token.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al detectar');
      setDevices(json.devices || []);
      if ((json.devices || []).length === 0) addToast('No se encontraron terminales registradas en esta cuenta MP', 'warning');
    } catch (err) {
      addToast('Error: ' + (err.message || 'no se pudo conectar con Mercado Pago'), 'error');
    }
    setDetecting(false);
  }

  // ── Probar conexión ($1 de prueba, cancelada inmediatamente) ──────────────
  async function handleTest() {
    if (!token.trim() || !deviceId.trim()) {
      addToast('Completá Access Token y Device ID antes de probar', 'error');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/mp-test-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ accessToken: token.trim(), deviceId: deviceId.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Error de conexión');
      setTestResult('ok');
      addToast('Terminal conectada correctamente ✓', 'success');
    } catch (err) {
      setTestResult('error');
      addToast('Error: ' + (err.message || 'no se pudo conectar con la terminal'), 'error');
    }
    setTesting(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding:32, textAlign:'center', color:G.textFaint, fontSize:13 }}>
        Cargando configuración…
      </div>
    );
  }

  const hasConfig = !!token && !!deviceId;

  return (
    <div style={{ maxWidth:600, display:'flex', flexDirection:'column', gap:20 }}>

      {/* ── Banner informativo ──────────────────────────────────────────── */}
      <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'14px 16px' }}>
        <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" style={{ flexShrink:0, marginTop:1 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{ fontSize:12, color:'#1E40AF', lineHeight:'18px' }}>
            <strong>Mercado Pago Point</strong> — Para usar la terminal física necesitás:
            una cuenta de Mercado Pago verificada (negocio), la terminal Point conectada a tu cuenta,
            y el <strong>Access Token</strong> de la app en{' '}
            <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer"
               style={{ color:'#2563EB', fontWeight:600 }}>
              mercadopago.com.ar/developers
            </a>.
          </div>
        </div>
      </div>

      {/* ── Estado actual ──────────────────────────────────────────────── */}
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 16px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
          Estado de la integración
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <StatusDot ok={!!token}    label={token    ? 'Access Token configurado' : 'Access Token no configurado'} />
          <StatusDot ok={!!deviceId} label={deviceId ? `Terminal: ${deviceId}` : 'Sin terminal seleccionada'} />
          {testResult === 'ok'    && <StatusDot ok={true}  label="Conexión verificada ✓" />}
          {testResult === 'error' && <StatusDot ok={false} label="Error de conexión — revisá los datos" />}
        </div>
      </div>

      {/* ── Formulario ─────────────────────────────────────────────────── */}
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:12, padding:'20px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:G.text, marginBottom:16 }}>
          Credenciales Mercado Pago
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Access Token */}
          <Field
            label="Access Token de producción"
            hint="Empieza con 'APP_USR-…'. Lo encontrás en Developers → Credenciales → Production."
          >
            <div style={{ position:'relative' }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => { setToken(e.target.value); setTestResult(null); }}
                placeholder="APP_USR-123456789012345678-..."
                style={{ ...INPUT, paddingRight:42 }}
              />
              <button
                onClick={() => setShowToken(v => !v)}
                style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                  background:'none', border:'none', cursor:'pointer', color:G.textFaint, padding:2 }}
                title={showToken ? 'Ocultar' : 'Mostrar'}
              >
                {showToken
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </Field>

          {/* Device ID */}
          <Field
            label="Device ID (terminal física)"
            hint="ID único de tu terminal Point. Usá 'Detectar terminales' para obtenerlo automáticamente."
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
                disabled={detecting || !token.trim()}
                style={{ padding:'8px 14px', border:'1px solid #E2E8F0', borderRadius:8,
                  fontSize:12, fontWeight:600, cursor: detecting || !token.trim() ? 'not-allowed' : 'pointer',
                  background:'#FFFFFF', color: detecting || !token.trim() ? G.textFaint : G.text,
                  whiteSpace:'nowrap', flexShrink:0 }}
              >
                {detecting ? 'Detectando…' : 'Detectar'}
              </button>
            </div>
          </Field>

          {/* Lista de dispositivos detectados */}
          {devices.length > 0 && (
            <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden' }}>
              <div style={{ padding:'8px 12px', borderBottom:'1px solid #E2E8F0', fontSize:11, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.07em' }}>
                Terminales disponibles
              </div>
              {devices.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDeviceId(d.id)}
                  style={{ width:'100%', textAlign:'left', padding:'10px 12px', background: deviceId === d.id ? '#F0FBF7' : 'transparent',
                    border:'none', borderBottom:'1px solid #F1F5F9', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
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

        {/* Botones de acción */}
        <div style={{ display:'flex', gap:8, marginTop:20 }}>
          <button
            onClick={handleTest}
            disabled={testing || !hasConfig}
            style={{ padding:'9px 16px', border:'1px solid #E2E8F0', borderRadius:8,
              fontSize:13, fontWeight:600, cursor: testing || !hasConfig ? 'not-allowed' : 'pointer',
              background:'#FFFFFF', color: !hasConfig ? G.textFaint : G.text,
              opacity: testing ? 0.7 : 1 }}
          >
            {testing ? 'Probando…' : 'Probar conexión'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex:1, padding:'9px 0', border:'none', borderRadius:8,
              fontSize:13, fontWeight:600, cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? G.textFaint : '#1D9E75', color:'white', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* ── Cómo obtener las credenciales ──────────────────────────────── */}
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:12, padding:'16px 20px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:G.text, marginBottom:12 }}>
          ¿Cómo obtener las credenciales?
        </div>
        <ol style={{ margin:0, padding:'0 0 0 20px', display:'flex', flexDirection:'column', gap:8 }}>
          {[
            <>Creá o ingresá a <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer" style={{ color:G.teal }}>mercadopago.com.ar/developers</a></>,
            'Creá una aplicación (o usá una existente)',
            'Ir a "Credenciales" → "Producción" → copiá el Access Token',
            'El Device ID lo obtenés con el botón "Detectar terminales" (la terminal tiene que estar encendida y conectada a internet)',
          ].map((step, i) => (
            <li key={i} style={{ fontSize:12, color:G.textMid, lineHeight:'18px' }}>{step}</li>
          ))}
        </ol>
      </div>

      {/* ── Nota sobre WhatsApp ───────────────────────────────────────── */}
      {hasConfig && (
        <div style={{ background:'#F0FBF7', border:'1px solid #A7F3D0', borderRadius:10, padding:'12px 14px' }}>
          <div style={{ fontSize:12, color:'#065F46', lineHeight:'18px' }}>
            <strong>✓ Listo para usar:</strong> Cuando cerrés una mesa, aparecerá la opción
            <strong> "Terminal MP"</strong> en el selector de método de pago.
          </div>
        </div>
      )}
    </div>
  );
}
