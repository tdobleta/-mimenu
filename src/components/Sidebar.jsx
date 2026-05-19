import { Link, useLocation } from 'react-router-dom';
import { useStore } from '@/lib/store';
import useUserRole from '@/lib/useUserRole';
import { G } from '@/lib/glass';

const ROLE_PATHS = {
  Dueno:    ['/','/salon','/caja','/reservas','/stock','/reportes','/analiticas','/conexion','/configuracion','/control-cocina','/public/cocina'],
  Encargado:['/','/salon','/caja','/reservas','/stock','/reportes','/analiticas','/conexion','/control-cocina','/public/cocina'],
  Mozo:     ['/salon','/reservas'],
  Cocinero: [],
};

const NAV = [
  { path:'/', label:'Dashboard', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { path:'/salon', label:'Salón', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { path:'/caja', label:'Caja', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg> },
  { path:'/reservas', label:'Reservas', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { path:'/stock', label:'Stock y ventas', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { path:'/reportes', label:'Reportes', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { path:'/analiticas', label:'Analíticas', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg> },
  { path:'/conexion', label:'Conexión', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M20 12h1M3 12H2M12 20v1M12 3V2"/></svg> },
  { path:'/configuracion', label:'Configuración', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg> },
  { path:'/control-cocina', label:'Control Cocina', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { path:'/public/cocina', label:'Vista Cocina', external:true, icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg> },
];

export default function Sidebar({ onClose }) {
  const loc = useLocation();
  const store = useStore();
  const { restaurante } = store;
  const role = useUserRole();
  const allowed = ROLE_PATHS[role] || ROLE_PATHS.Encargado;
  const cocinaBranch = store.branchId !== 'todas' ? store.branchId : (store.sucursales?.[0]?.id || '');
  const navItems = NAV
    .filter(item => allowed.includes(item.path))
    .map(item => item.path === '/public/cocina' ? { ...item, path:`/public/cocina?branch=${cocinaBranch}` } : item);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.45)',
      backdropFilter: 'blur(28px) saturate(180%)',
      WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      borderRight: '1px solid rgba(255,255,255,0.65)',
      boxShadow: '4px 0 32px rgba(80,80,180,0.06)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
    }}>
      {/* Logo */}
      <div style={{ height:58, display:'flex', alignItems:'center', paddingLeft:20, borderBottom:'1px solid rgba(255,255,255,0.5)', flexShrink:0 }}>
        <span style={{ fontSize:20, fontWeight:700, letterSpacing:'-0.5px', fontFamily:"'Playfair Display', Georgia, serif", color:'#1a1a2e' }}>
          mi<span style={{ color: G.teal }}>menú</span>
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'12px 10px', display:'flex', flexDirection:'column', gap:2, overflowY:'auto' }}>
        {navItems.map(item => {
          const active = item.path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.path.split('?')[0]);
          const baseStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 13px',
            borderRadius: 12,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: active ? 600 : 400,
            transition: 'all .15s',
            background: active ? 'rgba(29,158,117,0.13)' : 'transparent',
            color: active ? G.teal : G.textMuted,
            border: active ? '1px solid rgba(29,158,117,0.22)' : '1px solid transparent',
            boxShadow: active ? '0 2px 10px rgba(29,158,117,0.10)' : 'none',
          };
          const onEnter = e => { if (!active) { e.currentTarget.style.background='rgba(255,255,255,0.55)'; e.currentTarget.style.color=G.textMid; } };
          const onLeave = e => { if (!active) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=G.textMuted; } };

          if (item.external) {
            return (
              <a key={item.path} href={item.path} target="_blank" rel="noopener noreferrer" onClick={onClose}
                style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                {item.icon}
                <span style={{ flex:1 }}>{item.label}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity:0.4 }}><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
              </a>
            );
          }
          return (
            <Link key={item.path} to={item.path} onClick={onClose}
              style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding:'14px 16px', borderTop:'1px solid rgba(255,255,255,0.5)' }}>
        <div style={{ fontSize:10, color:G.textFaint, marginBottom:2, letterSpacing:'0.04em' }}>versión 1.0.0</div>
        <div style={{ fontSize:12, color:G.textMid, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {restaurante.nombre}
        </div>
      </div>
    </div>
  );
}
