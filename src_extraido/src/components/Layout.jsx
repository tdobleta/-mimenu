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
      {/* Blobs decorativos de fondo */}
      <div style={{ position:'fixed', top:-140, right:-100, width:560, height:560, borderRadius:'50%', background:'radial-gradient(circle, rgba(127,119,221,0.12) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />
      <div style={{ position:'fixed', bottom:-120, left:-80, width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(29,158,117,0.10) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />
      <div style={{ position:'fixed', top:'35%', left:'38%', width:380, height:380, borderRadius:'50%', background:'radial-gradient(circle, rgba(239,159,39,0.06) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />
      <div style={{ position:'fixed', top:'60%', right:'15%', width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, rgba(55,138,221,0.07) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />

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
