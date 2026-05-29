import { Link, useLocation } from 'react-router-dom';
import { useStore } from '@/lib/store';
import useUserRole from '@/lib/useUserRole';
import { G } from '@/lib/glass';
import { useActiveStaff } from '@/lib/useActiveStaff';
import { useDeviceMode, MODE_LABELS } from '@/lib/DeviceModeContext';

// UX-only filter: which paths each device mode prefers to show.
// null = no filtering (show everything the role allows).
// This NEVER expands access — role remains the security layer.
export const MODE_PATHS = {
  admin:   null,
  cashier: ['/caja', '/salon'],
  pos:     ['/salon', '/reservas', '/delivery'],
  kds:     [],
  stock:   ['/stock'],
};

const ROLE_PATHS = {
  Dueno:    ['/','/salon','/caja','/reservas','/stock','/clientes','/delivery','/reportes','/analiticas','/conexion','/configuracion','/control-cocina','/cocina'],
  Encargado:['/','/salon','/caja','/reservas','/stock','/clientes','/delivery','/reportes','/analiticas','/conexion','/control-cocina','/cocina'],
  Mozo:     ['/salon','/reservas','/delivery'],
  Cocinero: [],
};

const NAV = [
  { path:'/', label:'Dashboard', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { path:'/salon', label:'Salón', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { path:'/caja', label:'Caja', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg> },
  { path:'/reservas', label:'Reservas', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { path:'/stock', label:'Stock y ventas', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { path:'/clientes', label:'Clientes', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { path:'/delivery', label:'Delivery', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect width="13" height="10" x="9" y="11" rx="1"/><path d="M9 17h4"/><circle cx="6.5" cy="17.5" r="1.5"/><circle cx="18.5" cy="17.5" r="1.5"/></svg> },
  { path:'/reportes', label:'Reportes', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { path:'/analiticas', label:'Analíticas', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg> },
  { path:'/conexion', label:'Conexión', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M20 12h1M3 12H2M12 20v1M12 3V2"/></svg> },
  { path:'/configuracion', label:'Configuración', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg> },
  { path:'/control-cocina', label:'Control Cocina', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { path:'/cocina', label:'Vista Cocina', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg> },
];

// Agrupación visual — sin impacto en lógica ni permisos
const NAV_GROUPS = [
  { label: null,          paths: ['/'] },
  { label: 'Operaciones', paths: ['/salon', '/caja', '/reservas', '/delivery'] },
  { label: 'Datos',       paths: ['/stock', '/clientes', '/reportes', '/analiticas'] },
  { label: 'Sistema',     paths: ['/conexion', '/configuracion'] },
  { label: 'Cocina',      paths: ['/control-cocina', '/cocina'] },
];

export default function Sidebar({ onClose }) {
  const loc = useLocation();
  const store = useStore();
  const { restaurante } = store;
  const role = useUserRole();
  const { activeStaff, clearActiveStaff } = useActiveStaff();
  const { mode, clearMode } = useDeviceMode();
  const allowed = ROLE_PATHS[role] || [];
  const modePaths = (mode && MODE_PATHS.hasOwnProperty(mode)) ? MODE_PATHS[mode] : null;
  const navItems = NAV
    .filter(item => allowed.includes(item.path))
    .filter(item => modePaths === null || modePaths.includes(item.path));

  return (
    <div style={{
      background: '#0D1117',
      borderRight: '1px solid #21262D',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
    }}>
      {/* Logo */}
      <div style={{ height:58, display:'flex', alignItems:'center', paddingLeft:20, borderBottom:'1px solid #21262D', flexShrink:0 }}>
        <span style={{ fontSize:20, fontWeight:700, letterSpacing:'-0.5px', fontFamily:"'Playfair Display', Georgia, serif", color:'#F0F6FF' }}>
          mi<span style={{ color: G.teal }}>menú</span>
        </span>
      </div>

      {/* Nav — agrupado */}
      <nav style={{ flex:1, padding:'10px 8px', display:'flex', flexDirection:'column', gap:0, overflowY:'auto' }}>
        {NAV_GROUPS.map((group, gi) => {
          const groupItems = navItems.filter(item => group.paths.includes(item.path.split('?')[0]));
          if (groupItems.length === 0) return null;
          return (
            <div key={gi}>
              {/* Label de grupo (no se muestra para el primero) */}
              {gi > 0 && (
                <div style={{ padding:'10px 10px 3px' }}>
                  <span style={{ fontSize:9.5, fontWeight:700, color:'#484F58', textTransform:'uppercase', letterSpacing:'0.09em' }}>
                    {group.label}
                  </span>
                </div>
              )}
              {/* Items del grupo */}
              <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                {groupItems.map(item => {
                  const active = item.path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.path.split('?')[0]);
                  const baseStyle = {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: active ? '8px 12px 8px 10px' : '8px 12px',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    transition: 'all .15s',
                    background: active ? 'rgba(29,158,117,0.12)' : 'transparent',
                    color: active ? '#FFFFFF' : '#8B949E',
                    border: 'none',
                    borderLeft: active ? '2px solid #1D9E75' : '2px solid transparent',
                    boxShadow: 'none',
                  };
                  const onEnter = e => { if (!active) { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='#E6EDF3'; } };
                  const onLeave = e => { if (!active) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#8B949E'; } };

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
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding:'14px 16px', borderTop:'1px solid #21262D' }}>
        <div style={{ fontSize:10, color:'#484F58', marginBottom:6, letterSpacing:'0.04em' }}>versión 1.0.0</div>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#1D9E75', flexShrink:0 }} />
          <span style={{ fontSize:12, color:'#8B949E', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1 }}>
            {restaurante.nombre}
          </span>
        </div>

        {/* Badge modo de dispositivo */}
        {mode && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontSize: 10.5, color: '#484F58' }}>
              Modo: <span style={{ color: '#8B949E', fontWeight: 600 }}>{MODE_LABELS[mode] || mode}</span>
            </span>
            <button
              onClick={clearMode}
              title="Cambiar modo de dispositivo"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#484F58', fontSize: 10, padding: '2px 4px',
                textDecoration: 'underline', textUnderlineOffset: 2,
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#8B949E'}
              onMouseLeave={e => e.currentTarget.style.color = '#484F58'}
            >
              Cambiar
            </button>
          </div>
        )}

        {/* Badge mozo activo + botón de cambio rápido */}
        {activeStaff && (
          <div style={{ marginTop: 10, background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.18)', borderRadius: 8, padding: '7px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: G.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#FFF', flexShrink: 0 }}>
                {activeStaff.nombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#E6EDF3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeStaff.nombre}</div>
                <div style={{ fontSize: 9.5, color: '#484F58' }}>{activeStaff.rol}</div>
              </div>
              <button
                onClick={clearActiveStaff}
                title="Cambiar mozo"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#484F58', padding: 2, display: 'flex' }}
                onMouseEnter={e => e.currentTarget.style.color = '#8B949E'}
                onMouseLeave={e => e.currentTarget.style.color = '#484F58'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
