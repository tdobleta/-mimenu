import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { APP_BG } from '@/lib/glass';
import MimenuChatbot from './MimenuChatbot';

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
          <div style={{ position:'absolute', left:0, top:0, height:'100%', width:220, zIndex:51 }}>
            <Sidebar onClose={() => setMob(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden', position:'relative', zIndex:1 }}>
        <Topbar onMobile={() => setMob(v => !v)} />
        <main style={{ flex:1, overflowY:'auto', padding:24 }}>
          <Outlet />
        </main>
      </div>
      <MimenuChatbot />
    </div>
  );
}
