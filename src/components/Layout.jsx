import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { APP_BG, containerPad } from '@/lib/glass';
import MimenuChatbot from './MimenuChatbot';
import PWAInstallPrompt from './PWAInstallPrompt';

// Banner de actualización del Service Worker.
// Aparece cuando hay una nueva versión disponible (registerType: 'prompt').
// El restaurante elige cuándo actualizar — no se reinicia automáticamente.
function SWUpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      background: '#FFFFFF', border: '1px solid #E2E8F0',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', borderRadius: 12,
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
      maxWidth: 360, fontSize: 13,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>Nueva versión disponible</div>
        <div style={{ color: '#64748B', fontSize: 12 }}>Actualizá cuando termines la jornada.</div>
      </div>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          padding: '7px 14px', border: 'none', borderRadius: 8,
          background: '#1D9E75', color: 'white', fontSize: 12,
          fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Actualizar
      </button>
    </div>
  );
}

export default function Layout() {
  const [mob, setMob] = useState(false);
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'clip',
      background: APP_BG,
      fontFamily: "'DM Sans', sans-serif",
      position: 'relative',
    }}>
      {/* Sidebar desktop */}
      <div className="hidden md:flex flex-shrink-0" style={{ width: 220, position:'relative', zIndex:10 }}>
        <Sidebar />
      </div>

      {/* Sidebar mobile */}
      {mob && (
        <div style={{ position:'fixed', inset:0, zIndex:50 }} className="md:hidden">
          <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(15,15,35,0.45)', backdropFilter:'blur(4px)' }} onClick={() => setMob(false)} />
          <div style={{ position:'absolute', left:0, top:0, height:'100%', width:'clamp(200px, 60vw, 260px)', zIndex:51 }}>
            <Sidebar onClose={() => setMob(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden', position:'relative', zIndex:1 }}>
        <Topbar onMobile={() => setMob(v => !v)} />
        <main style={{ flex:1, overflowY:'auto', ...containerPad }}>
          <Outlet />
        </main>
      </div>
      <MimenuChatbot />
      <SWUpdateBanner />
      <PWAInstallPrompt />
    </div>
  );
}
