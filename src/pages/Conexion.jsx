import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import ManualTurnForm from '@/components/settings/ManualTurnForm';

export default function Conexion() {
  const navigate = useNavigate();
  const store = useStore();
  const { addToast } = useToast();
  const [openManual, setOpenManual] = useState(false);
  const [openMP, setOpenMP] = useState(false);
  const [mpToken, setMpToken] = useState('');
  const [mpSaving, setMpSaving] = useState(false);
  const [showMpToken, setShowMpToken] = useState(false);
  const [editMp, setEditMp] = useState(false);

  const branch = store.branchId !== 'todas'
    ? store.sucursales.find(s => s.id === store.branchId)
    : store.sucursales[0];
  const branchHasMpToken = !!branch?.mp_access_token;

  async function saveMp() {
    if (!mpToken.trim()) return;
    setMpSaving(true);
    try {
      await base44.entities.Branch.update(store.branchId, { mp_access_token: mpToken.trim() });
      addToast('Token de MercadoPago guardado', 'success');
      setEditMp(false);
      setMpToken('');
    } catch(err) {
      console.error(err);
      addToast('Error al guardar el token', 'error');
    } finally {
      setMpSaving(false);
    }
  }

  function onManualSaved() {
    if (store.refreshCharts) store.refreshCharts();
    addToast('Turno registrado — analíticas actualizadas', 'success');
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18, maxWidth:720 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize:20, fontWeight:600, color:'#111827', margin:0 }}>Conexión de datos</h1>
        <p style={{ fontSize:13, color:'#6B7280', marginTop:6, lineHeight:'18px' }}>
          mimenú funciona como sistema completo de caja y POS. Esta sección es opcional — si ya usás otro sistema podés importar tus ventas acá.
        </p>
      </div>

      {/* Card 1 — mimenú como caja (destacada) */}
      <div style={{ position:'relative', border:'1.5px solid #1D9E75', borderRadius:10, padding:20, backgroundColor:'#F0FBF7' }}>
        <span style={{ position:'absolute', top:14, right:14, backgroundColor:'#1D9E75', color:'white', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, letterSpacing:'0.4px' }}>Recomendado</span>
        <div style={{ fontSize:15, fontWeight:700, color:'#111827', marginBottom:6 }}>Usar mimenú como caja</div>
        <p style={{ fontSize:13, color:'#374151', lineHeight:'19px', margin:0, marginBottom:14 }}>
          Los mozos toman pedidos desde el celular, las mesas se cierran con el método de pago, y la caja se gestiona con turnos de apertura y cierre. Todo queda registrado automáticamente.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:16 }}>
          {['Salón con mapa de mesas','Caja con turnos y arqueo','Vista de cocina en tiempo real','Analíticas automáticas'].map(t => (
            <div key={t} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#374151' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><polyline points="20 6 9 17 4 12"/></svg>
              {t}
            </div>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <button onClick={()=>navigate('/salon')}
            style={{ padding:'9px 18px', border:'none', borderRadius:7, fontSize:13, fontWeight:500, color:'white', backgroundColor:'#1D9E75', cursor:'pointer' }}>
            Ir al Salón →
          </button>
          {store.turnoActivo && (
            <span style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', backgroundColor:'#E8F7F2', color:'#1D9E75', borderRadius:99, fontSize:11, fontWeight:600 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', backgroundColor:'#1D9E75' }} />
              Turno abierto ahora
            </span>
          )}
        </div>
      </div>

      {/* Card 2 — Carga manual */}
      <div style={{ border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, backgroundColor:'white', overflow:'hidden' }}>
        <button onClick={()=>setOpenManual(o=>!o)}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:16, background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Carga manual de ventas</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Para importar datos de otro sistema o cargar cierres históricos</div>
          </div>
          <span style={{ fontSize:12, color:'#1D9E75', fontWeight:500 }}>{openManual ? 'Ocultar' : 'Expandir'}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ transition:'transform .2s', transform: openManual?'rotate(180deg)':'none', flexShrink:0 }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {openManual && (
          <div style={{ padding:'0 16px 16px' }}>
            {branch ? (
              <ManualTurnForm branch={branch} onSaved={onManualSaved} />
            ) : (
              <div style={{ fontSize:13, color:'#9CA3AF', padding:'8px 0' }}>Configurá una sucursal primero.</div>
            )}
          </div>
        )}
      </div>

      {/* Card 3 — MercadoPago */}
      <div style={{ border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, backgroundColor:'white', overflow:'hidden' }}>
        <button onClick={()=>setOpenMP(o=>!o)}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:16, background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
          <div style={{ width:34, height:34, borderRadius:8, backgroundColor:'#DBEAFE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#3B82F6', flexShrink:0 }}>MP</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>MercadoPago</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Conectá tu cuenta para registrar pagos automáticamente cuando el cliente usa el QR o link de pago.</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ transition:'transform .2s', transform: openMP?'rotate(180deg)':'none', flexShrink:0 }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {openMP && (
          <div style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:12 }}>
            {branchHasMpToken && !editMp ? (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:13, color:'#1D9E75', fontWeight:600 }}>✓ Token configurado</span>
                <button onClick={()=>setEditMp(true)}
                  style={{ padding:'4px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:6, fontSize:12, color:'#6B7280', backgroundColor:'white', cursor:'pointer' }}>
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <div>
                  <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Access Token</div>
                  <div style={{ position:'relative' }}>
                    <input type={showMpToken?'text':'password'} value={mpToken} onChange={e=>setMpToken(e.target.value)} placeholder="APP_USR-..."
                      style={{ width:'100%', padding:'7px 36px 7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
                    <button onClick={()=>setShowMpToken(s=>!s)} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#6B7280', padding:4, display:'flex' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{showMpToken ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}</svg>
                    </button>
                  </div>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginTop:6, lineHeight:'15px' }}>
                    Encontrás tu Access Token en mercadopago.com.ar → Tu negocio → Credenciales → Producción.
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={saveMp} disabled={mpSaving || !mpToken.trim()}
                    style={{ padding:'8px 16px', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#1D9E75', cursor: (mpSaving||!mpToken.trim())?'not-allowed':'pointer', opacity: (mpSaving||!mpToken.trim())?0.6:1 }}>
                    {mpSaving?'Guardando...':'Guardar token'}
                  </button>
                  {editMp && (
                    <button onClick={()=>{ setEditMp(false); setMpToken(''); }}
                      style={{ padding:'8px 16px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


