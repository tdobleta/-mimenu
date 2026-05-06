import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout() {
  const [mob, setMob] = useState(false);
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', backgroundColor:'#F6F8FA', fontFamily:"'DM Sans', sans-serif" }}>
      <div className="hidden md:flex flex-shrink-0" style={{ width:220 }}>
        <Sidebar />
      </div>
      {mob && (
        <div style={{ position:'fixed',inset:0,zIndex:50 }} className="md:hidden">
          <div style={{ position:'absolute',inset:0,backgroundColor:'rgba(0,0,0,0.5)' }} onClick={() => setMob(false)} />
          <div style={{ position:'absolute',left:0,top:0,height:'100%',width:220 }}>
            <Sidebar onClose={() => setMob(false)} />
          </div>
        </div>
      )}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
        <Topbar onMobile={() => setMob(v => !v)} />
        <main style={{ flex:1, overflowY:'auto', padding:24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}


