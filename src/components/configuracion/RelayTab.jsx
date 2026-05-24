// components/configuracion/RelayTab.jsx
// Configuración del relay LAN local para comunicación cocina/salón sin internet.
// El relay es un proceso Node.js que corre en la PC Caja y actúa de intermediario.

import { useState, useEffect } from 'react';
import { getRelayConfig, saveRelayConfig, DEFAULT_URL, localRelay } from '@/lib/localRelay';
import { G } from '@/lib/glass';

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

function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: G.textMuted, marginBottom: 4 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: G.textFaint, marginBottom: 6, lineHeight: '16px' }}>{hint}</div>}
      {children}
    </div>
  );
}

function StatusChip({ ok, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: ok === null ? '#9CA3AF' : ok ? '#1D9E75' : '#EF4444',
      }} />
      <span style={{ fontSize: 12, color: ok === null ? G.textFaint : ok ? '#1D9E75' : '#EF4444', fontWeight: 500 }}>
        {label}
      </span>
    </div>
  );
}

export default function RelayTab() {
  const cfg = getRelayConfig();
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [url,     setUrl]     = useState(cfg.url);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | true | false
  const [saved,   setSaved]   = useState(false);

  // Estado de conexión en tiempo real
  const [connected, setConnected] = useState(localRelay.isConnected);
  useEffect(() => {
    const iv = setInterval(() => setConnected(localRelay.isConnected), 2000);
    return () => clearInterval(iv);
  }, []);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      // Intentar conectar al relay con la URL actual (sin guardar)
      const ok = await new Promise((resolve) => {
        try {
          const ws = new WebSocket(url);
          const timer = setTimeout(() => { ws.close(); resolve(false); }, 3000);
          ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(true); };
          ws.onerror = () => { clearTimeout(timer); resolve(false); };
        } catch {
          resolve(false);
        }
      });
      setTestResult(ok);
    } catch {
      setTestResult(false);
    }
    setTesting(false);
  }

  function handleSave() {
    saveRelayConfig({ enabled, url });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setUrl(DEFAULT_URL);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 580 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: G.text, margin: '0 0 6px' }}>Red local (relay LAN)</h2>
        <p style={{ fontSize: 13, color: G.textMuted, margin: 0, lineHeight: '20px' }}>
          Permite que las tablets y el monitor de cocina se comuniquen en la misma red WiFi
          aunque se corte el internet. Requiere instalar el relay en la <strong>PC Caja</strong>.
        </p>
      </div>

      {/* Cómo instalar */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: G.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          Instalación en PC Caja (una sola vez)
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: G.textMid, lineHeight: '22px' }}>
          <li>Instalar <strong>Node.js</strong> desde <code>nodejs.org</code></li>
          <li>Abrir una terminal y ejecutar:<br />
            <code style={{ background: '#0D1117', color: '#58D68D', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
              cd C:\mimenu\local-server &amp;&amp; npm install &amp;&amp; node server.js
            </code>
          </li>
          <li>La terminal muestra <code>ws://mimenu-caja.local:3001</code> cuando está listo</li>
          <li>Dejá la terminal abierta mientras el restaurante opera</li>
        </ol>
        <div style={{ marginTop: 10, fontSize: 11, color: G.textFaint }}>
          Para auto-inicio con Windows: usá NSSM (ver README en la carpeta local-server/).
        </div>
      </div>

      {/* Habilitar / deshabilitar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: G.text }}>Activar relay local</div>
          <div style={{ fontSize: 11, color: G.textFaint, marginTop: 2 }}>
            La app intentará conectarse al relay al iniciar
          </div>
        </div>
        <button
          onClick={() => setEnabled(e => !e)}
          style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: enabled ? G.teal : '#D1D5DB',
            position: 'relative', transition: 'background .2s',
            flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: 2,
            left: enabled ? 22 : 2,
            width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF',
            transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>

      {/* URL del relay */}
      <Field
        label="URL del relay"
        hint="Dejá el valor por defecto (mDNS) si instalaste el relay en la misma red. Usá la IP manual si mDNS no funciona en algún dispositivo Android."
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={DEFAULT_URL}
            style={INPUT}
          />
          <button
            onClick={handleReset}
            title="Restaurar automático (mDNS)"
            style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8FAFC', fontSize: 12, color: G.textMuted, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Restablecer
          </button>
        </div>
      </Field>

      {/* Test de conexión */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleTest}
          disabled={testing}
          style={{
            padding: '8px 18px', borderRadius: 8, border: 'none', cursor: testing ? 'not-allowed' : 'pointer',
            background: testing ? '#E2E8F0' : '#0D1117', color: testing ? G.textFaint : '#FFFFFF',
            fontSize: 13, fontWeight: 600,
          }}
        >
          {testing ? 'Probando...' : 'Probar conexión'}
        </button>

        {testResult === true  && <StatusChip ok={true}  label="Relay disponible — conectado correctamente" />}
        {testResult === false && <StatusChip ok={false} label="No se pudo conectar — revisá que el relay esté corriendo" />}
      </div>

      {/* Estado actual */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusChip ok={connected ? true : null} label={connected ? 'Relay activo en esta sesión' : 'Sin conexión al relay en esta sesión'} />
      </div>

      {/* Guardar */}
      <div>
        <button
          onClick={handleSave}
          style={{
            padding: '9px 22px', background: saved ? '#1D9E75' : G.teal, color: '#FFFFFF',
            border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {saved ? '✓ Guardado' : 'Guardar configuración'}
        </button>
      </div>

      {/* Nota de degradación */}
      <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>Comportamiento sin relay</div>
        <div style={{ fontSize: 12, color: '#78350F', lineHeight: '18px' }}>
          Si el relay no está disponible, la app usa Supabase Realtime automáticamente (comportamiento normal).
          La degradación es transparente — no hay ningún error visible.
        </div>
      </div>

    </div>
  );
}
