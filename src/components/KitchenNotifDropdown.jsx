import { useEffect, useRef } from 'react';
import { G, glassLight } from '@/lib/glass';

function fmtTs(ts) {
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return 'Ahora';
  if (m < 60) return `hace ${m}m`;
  return `hace ${Math.floor(m/60)}h`;
}

export default function KitchenNotifDropdown({ notifs, onClose, onClear }) {
  const ref = useRef();

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position:'absolute', top:42, right:0,
      width:300,
      background:'rgba(255,255,255,0.96)',
      backdropFilter:'blur(24px)',
      WebkitBackdropFilter:'blur(24px)',
      border:'1px solid rgba(255,255,255,0.9)',
      borderRadius:16,
      boxShadow:'0 12px 40px rgba(0,0,0,0.14)',
      zIndex:999,
      overflow:'hidden',
      fontFamily:"'DM Sans',system-ui,sans-serif",
    }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(0,0,0,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={G.teal} strokeWidth="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.1 1 3"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
          <span style={{ fontSize:13, fontWeight:700, color:G.text }}>Cocina</span>
          {notifs.length > 0 && <span style={{ fontSize:11, color:G.textFaint }}>{notifs.length} aviso{notifs.length!==1?'s':''}</span>}
        </div>
        {notifs.length > 0 && (
          <button onClick={onClear} style={{ fontSize:11, color:G.textFaint, background:'none', border:'none', cursor:'pointer', padding:'2px 6px', borderRadius:6, fontFamily:'inherit' }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Lista */}
      <div style={{ maxHeight:320, overflowY:'auto' }}>
        {notifs.length === 0 ? (
          <div style={{ padding:'28px 16px', textAlign:'center' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>🍳</div>
            <div style={{ fontSize:13, color:G.textFaint }}>Sin notificaciones de cocina</div>
          </div>
        ) : notifs.map(n => (
          <div key={n.id} style={{
            padding:'12px 16px',
            borderBottom:'1px solid rgba(0,0,0,0.04)',
            display:'flex', gap:12, alignItems:'flex-start',
            background: n.read ? 'transparent' : 'rgba(29,158,117,0.04)',
          }}>
            {/* Ícono */}
            <div style={{
              width:36, height:36, borderRadius:10, flexShrink:0,
              background:'rgba(29,158,117,0.10)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:18,
            }}>🍽</div>

            {/* Contenido */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:G.text, marginBottom:2 }}>
                Mesa {n.mesa} lista para servir
              </div>
              {n.mozo && (
                <div style={{ fontSize:11, color:G.textFaint, marginBottom:2 }}>
                  Mozo: {n.mozo}
                </div>
              )}
              <div style={{ fontSize:11, color:G.textFaint }}>{fmtTs(n.ts)}</div>
            </div>

            {/* Dot no leído */}
            {!n.read && (
              <div style={{ width:8, height:8, borderRadius:'50%', background:G.teal, flexShrink:0, marginTop:4 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
