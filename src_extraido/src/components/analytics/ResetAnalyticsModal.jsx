import { useState, useEffect } from 'react';

export default function ResetAnalyticsModal({ isOpen, onClose, onConfirm, branchName, loading }) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!isOpen) setText('');
  }, [isOpen]);

  if (!isOpen) return null;

  const matches = text === 'confirmar';
  const showError = text.length > 0 && !matches;

  const inputBorder = matches ? '1.5px solid #1D9E75' : showError ? '1.5px solid #EF4444' : '0.5px solid rgba(0,0,0,0.12)';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.5)' }}
      onClick={loading ? undefined : onClose}>
      <div style={{ backgroundColor:'white', borderRadius:12, width:480, maxWidth:'95vw', padding:24 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:14 }}>
          <div style={{ width:40, height:40, borderRadius:'50%', backgroundColor:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:17, fontWeight:700, color:'#111827' }}>Reiniciar analíticas</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>{branchName}</div>
          </div>
        </div>

        <p style={{ fontSize:13, color:'#6B7280', lineHeight:'19px', marginBottom:14 }}>
          Esta acción eliminará permanentemente todas las ventas cerradas registradas. El historial de reportes, el gráfico comparativo y el ranking de productos quedarán en cero. Esta acción es irreversible.
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
          {['Historial de ventas cerradas','Detalle de ítems por venta','Datos del gráfico semanal','Top de productos vendidos'].map(item => (
            <div key={item} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#374151' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', backgroundColor:'#EF4444', flexShrink:0 }} />
              {item}
            </div>
          ))}
        </div>

        <div style={{ height:'0.5px', backgroundColor:'rgba(0,0,0,0.08)', marginBottom:14 }} />

        <label style={{ display:'block', fontSize:12, color:'#6B7280', marginBottom:6 }}>
          Para confirmar escribí la palabra <strong>confirmar</strong> en minúsculas
        </label>
        <input
          value={text}
          onChange={e=>setText(e.target.value)}
          placeholder="confirmar"
          disabled={loading}
          style={{ width:'100%', padding:'8px 12px', border:inputBorder, borderRadius:7, fontSize:13, marginBottom:16, outline:'none', boxSizing:'border-box' }}
        />

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} disabled={loading}
            style={{ flex:1, padding:'10px 0', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, color:'#374151', backgroundColor:'white', cursor:loading?'not-allowed':'pointer' }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={!matches || loading}
            style={{ flex:1, padding:'10px 0', border:'none', borderRadius:7, fontSize:13, color:'white', backgroundColor:'#EF4444', cursor:(matches&&!loading)?'pointer':'not-allowed', opacity:(matches&&!loading)?1:0.4, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading && <span style={{ width:12, height:12, border:'2px solid white', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }} />}
            {loading ? 'Eliminando...' : 'Eliminar todo'}
          </button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}


