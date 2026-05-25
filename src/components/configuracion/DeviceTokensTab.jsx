// components/configuracion/DeviceTokensTab.jsx
// Gestión de tokens de dispositivo para pantallas de cocina.
//
// Flujo del dueño:
//   1. Elige la sucursal y escribe el nombre del dispositivo (ej: "Monitor Cocina", "Tablet Bar")
//   2. Click "Nuevo dispositivo" → se crea un token en la DB
//   3. Aparece la URL completa con el token — la copia y la abre en el monitor de cocina
//   4. El monitor guarda el token en localStorage al abrir la URL
//   5. El dueño puede desactivar tokens de dispositivos perdidos/robados

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useStore } from '@/lib/store';

const BASE_URL = import.meta.env.VITE_APP_URL || 'https://mimenuar.netlify.app';

export default function DeviceTokensTab() {
  const { branchId, sucursales } = useStore();

  // Para listar, el dueño necesita elegir una sucursal si tiene varias.
  // Por defecto tomamos la branchId activa del store, o la primera.
  const [selectedBranch, setSelectedBranch] = useState(
    branchId !== 'todas' ? branchId : sucursales[0]?.id || ''
  );
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [showToken, setShowToken] = useState({});
  const [newlyCreated, setNewlyCreated] = useState(null); // { id, token, url } — se muestra 1 vez

  const loadTokens = useCallback(async () => {
    if (!selectedBranch) return;
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('device_tokens')
      .select('id, nombre, token, activo, created_at')
      .eq('branch_id', selectedBranch)
      .order('created_at', { ascending: false });

    if (err) setError('Error al cargar dispositivos: ' + err.message);
    else setTokens(data || []);
    setLoading(false);
  }, [selectedBranch]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  async function createToken() {
    if (!selectedBranch) { setError('Elegí una sucursal primero'); return; }
    const nombre = newName.trim() || 'Monitor Cocina';
    setCreating(true);
    setError('');
    setNewlyCreated(null);

    const { data, error: err } = await supabase
      .from('device_tokens')
      .insert({ branch_id: selectedBranch, nombre })
      .select('id, nombre, token, activo, created_at')
      .single();

    if (err) {
      setError('Error al crear dispositivo: ' + err.message);
    } else if (data) {
      const deviceUrl = `${BASE_URL}/public/cocina?branch=${selectedBranch}&token=${data.token}`;
      setNewlyCreated({ ...data, url: deviceUrl });
      setTokens(prev => [data, ...prev]);
      setNewName('');
    }
    setCreating(false);
  }

  async function toggleActive(tokenId, currentlyActive) {
    const { error: err } = await supabase
      .from('device_tokens')
      .update({ activo: !currentlyActive })
      .eq('id', tokenId);

    if (err) { setError('Error: ' + err.message); return; }
    setTokens(prev => prev.map(t => t.id === tokenId ? { ...t, activo: !currentlyActive } : t));
  }

  function buildUrl(token) {
    return `${BASE_URL}/public/cocina?branch=${selectedBranch}&token=${token}`;
  }

  async function copyToClipboard(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // Fallback: textarea trick
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' });
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, maxWidth:720 }}>
      <div>
        <h2 style={{ fontSize:17, fontWeight:700, color:'#111827', margin:'0 0 4px' }}>
          Dispositivos de cocina
        </h2>
        <p style={{ fontSize:13, color:'#6B7280', margin:0, lineHeight:1.5 }}>
          Cada monitor de cocina necesita su propio token de dispositivo. El token reemplaza
          la contraseña: si un dispositivo se pierde, lo desactivás desde acá y listo.
        </p>
      </div>

      {/* Selector de sucursal (si hay varias) */}
      {sucursales.length > 1 && (
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>
            Sucursal
          </label>
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            style={{ padding:'8px 12px', border:'1px solid #D1D5DB', borderRadius:8, fontSize:13, width:'100%', maxWidth:280 }}
          >
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      )}

      {/* Crear nuevo dispositivo */}
      <div style={{ backgroundColor:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:12, padding:20 }}>
        <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginBottom:12 }}>
          Nuevo dispositivo
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <input
            type="text"
            placeholder="Nombre del dispositivo (ej: Monitor Cocina)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createToken()}
            style={{ flex:1, minWidth:200, padding:'9px 12px', border:'1px solid #D1D5DB', borderRadius:8, fontSize:13 }}
          />
          <button
            onClick={createToken}
            disabled={creating || !selectedBranch}
            style={{
              padding:'9px 18px', borderRadius:8, border:'none', cursor:'pointer',
              backgroundColor: creating ? '#9CA3AF' : '#1D9E75',
              color:'white', fontSize:13, fontWeight:600,
              opacity: !selectedBranch ? 0.5 : 1,
              transition:'background 0.15s',
            }}
          >
            {creating ? 'Creando...' : '+ Nuevo dispositivo'}
          </button>
        </div>

        {/* URL del dispositivo recién creado — mostrar solo 1 vez */}
        {newlyCreated && (
          <div style={{ marginTop:16, backgroundColor:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:10, padding:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#065F46', marginBottom:8 }}>
              ✓ Dispositivo "{newlyCreated.nombre}" creado — abrí esta URL en el monitor de cocina
            </div>
            <div style={{
              backgroundColor:'white', border:'1px solid #D1FAE5', borderRadius:8,
              padding:'10px 12px', fontSize:11, fontFamily:'monospace', wordBreak:'break-all',
              color:'#065F46', lineHeight:1.6, marginBottom:10,
            }}>
              {newlyCreated.url}
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button
                onClick={() => copyToClipboard(newlyCreated.url, newlyCreated.id + '_url')}
                style={{ padding:'7px 14px', borderRadius:7, border:'none', cursor:'pointer', backgroundColor:'#1D9E75', color:'white', fontSize:12, fontWeight:600 }}
              >
                {copiedId === newlyCreated.id + '_url' ? '✓ Copiado' : 'Copiar URL'}
              </button>
              <button
                onClick={() => setNewlyCreated(null)}
                style={{ padding:'7px 14px', borderRadius:7, border:'1px solid #D1D5DB', cursor:'pointer', backgroundColor:'white', color:'#6B7280', fontSize:12 }}
              >
                Cerrar
              </button>
            </div>
            <div style={{ marginTop:10, fontSize:11, color:'#6B7280', lineHeight:1.5 }}>
              💡 <strong>¿Qué hace esta URL?</strong> Al abrirla en el monitor de cocina, guarda el token automáticamente.
              Las próximas visitas a <code style={{ fontSize:10 }}>/cocina</code> no necesitan la URL larga.
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ backgroundColor:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#DC2626' }}>
          {error}
        </div>
      )}

      {/* Lista de tokens */}
      {loading ? (
        <div style={{ textAlign:'center', padding:24, color:'#9CA3AF', fontSize:13 }}>Cargando dispositivos...</div>
      ) : tokens.length === 0 ? (
        <div style={{ textAlign:'center', padding:32, color:'#9CA3AF', fontSize:14 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📱</div>
          No hay dispositivos configurados para esta sucursal.
          <br />Creá el primero con el formulario de arriba.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2 }}>
            {tokens.length} dispositivo{tokens.length !== 1 ? 's' : ''}
          </div>
          {tokens.map(t => {
            const url = buildUrl(t.token);
            const tokenPreview = showToken[t.id] ? t.token : t.token.slice(0, 8) + '••••••••••••••••••••••••' + t.token.slice(-4);
            return (
              <div key={t.id} style={{
                backgroundColor: t.activo ? 'white' : '#F9FAFB',
                border: `1px solid ${t.activo ? '#E5E7EB' : '#D1D5DB'}`,
                borderRadius:10, padding:16,
                opacity: t.activo ? 1 : 0.7,
                transition:'all 0.15s',
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>{t.nombre || 'Sin nombre'}</span>
                      <span style={{
                        fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99,
                        backgroundColor: t.activo ? '#ECFDF5' : '#F3F4F6',
                        color: t.activo ? '#065F46' : '#6B7280',
                      }}>
                        {t.activo ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:6 }}>
                      Creado {fmtDate(t.created_at)}
                    </div>
                    {/* Token (oculto por defecto) */}
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <code style={{ fontSize:10, fontFamily:'monospace', color:'#374151', backgroundColor:'#F3F4F6', padding:'3px 7px', borderRadius:5, flex:1, wordBreak:'break-all' }}>
                        {tokenPreview}
                      </code>
                      <button
                        onClick={() => setShowToken(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                        style={{ padding:'3px 8px', borderRadius:5, border:'1px solid #D1D5DB', cursor:'pointer', fontSize:10, backgroundColor:'white', color:'#6B7280', flexShrink:0 }}
                      >
                        {showToken[t.id] ? 'Ocultar' : 'Ver'}
                      </button>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button
                      onClick={() => copyToClipboard(url, t.id + '_url')}
                      title="Copiar URL de setup"
                      style={{ padding:'6px 12px', borderRadius:7, border:'1px solid #D1D5DB', cursor:'pointer', fontSize:11, backgroundColor:'white', color:'#374151', fontWeight:500 }}
                    >
                      {copiedId === t.id + '_url' ? '✓ Copiado' : 'Copiar URL'}
                    </button>
                    <button
                      onClick={() => toggleActive(t.id, t.activo)}
                      title={t.activo ? 'Desactivar dispositivo' : 'Reactivar dispositivo'}
                      style={{
                        padding:'6px 12px', borderRadius:7, border:'none', cursor:'pointer', fontSize:11, fontWeight:600,
                        backgroundColor: t.activo ? '#FEF2F2' : '#ECFDF5',
                        color: t.activo ? '#DC2626' : '#065F46',
                      }}
                    >
                      {t.activo ? 'Desactivar' : 'Reactivar'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Instrucciones */}
      <div style={{ backgroundColor:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:16, fontSize:12, color:'#1E40AF', lineHeight:1.7 }}>
        <strong>Cómo funciona:</strong>
        <ol style={{ margin:'6px 0 0', paddingLeft:18 }}>
          <li>Crear un dispositivo acá y copiar la URL generada.</li>
          <li>Abrir esa URL en el monitor de cocina (Chrome, en modo pantalla completa).</li>
          <li>Listo — el monitor queda configurado y no necesita la URL larga en el futuro.</li>
          <li>Si un dispositivo se pierde o se cambia, desactivarlo desde acá.</li>
        </ol>
      </div>
    </div>
  );
}
