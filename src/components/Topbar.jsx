import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useStore } from '@/lib/store';
import { dateLong } from '@/lib/fmt';
import AlertsDropdown from './AlertsDropdown';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import useUserRole from '@/lib/useUserRole';

const ROLE_BADGE = {
  Dueno: { bg:'#E8F7F2', c:'#1D9E75', label:'Dueño' },
  Encargado: { bg:'#DBEAFE', c:'#3B82F6', label:'Encargado' },
  Mozo: { bg:'#F3F4F6', c:'#6B7280', label:'Mozo' },
  Cocinero: { bg:'#FEF9C3', c:'#CA8A04', label:'Cocinero' },
};

export default function Topbar({ onMobile }) {
  const store = useStore();
  const { restaurante, branchId, sucursales, setBranchId } = store;
  const { user } = useAuth();

  const liveAlerts = useMemo(() => {
    const stockItems = store.getStock ? store.getStock() : [];
    return stockItems
      .filter(it => Number(it.actual) < Number(it.minimo))
      .map(it => ({ id: it.id, mensaje: `Stock bajo: ${it.nombre} (${it.actual}/${it.minimo})`, created_date: new Date().toISOString() }));
  }, [store]);
  const alertsCount = liveAlerts.length;
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertsRef = useRef();
  const userName = user?.full_name || user?.email || 'Usuario';
  const userInitial = userName.charAt(0).toUpperCase();
  const userRole = user?.role || '';
  const appRole = useUserRole();
  const roleBadge = ROLE_BADGE[appRole] || ROLE_BADGE.Encargado;
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const ref = useRef();
  const userRef = useRef();
  void alertsRef;

  useEffect(() => {
    const fn = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const activeName = branchId === 'todas'
    ? 'Todas las sucursales'
    : (sucursales.find(s => s.id === branchId)?.nombre || branchId);

  return (
    <div style={{ height:52, display:'flex', alignItems:'center', padding:'0 24px', gap:12, backgroundColor:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', flexShrink:0 }}>
      <button className="md:hidden" onClick={onMobile} style={{ marginRight:4, color:'#6B7280' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      {restaurante.nombre && (
        <div className="hidden md:flex" style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 12px', backgroundColor:'#F6F8FA', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:99 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span style={{ fontSize:13, color:'#111827', fontWeight:500 }}>{restaurante.nombre}</span>
          </div>
          <span style={{ backgroundColor: roleBadge.bg, color: roleBadge.c, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99 }}>
            {roleBadge.label}
          </span>
        </div>
      )}

      <div style={{ flex:1, display:'flex', justifyContent:'center' }} ref={ref}>
        <div style={{ position:'relative' }}>
          <button onClick={() => setOpen(v=>!v)}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:99, backgroundColor:'white', fontSize:13, fontWeight:500, color:'#111827', cursor:'pointer', transition:'all .15s' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {activeName}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {open && (
            <div style={{ position:'absolute', top:38, left:'50%', transform:'translateX(-50%)', backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'4px 0', minWidth:210, zIndex:999, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
              {sucursales.map(su => (
                <button key={su.id} onClick={() => { setBranchId(su.id); setOpen(false); }}
                  style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'9px 14px', fontSize:13, backgroundColor:'white', border:'none', cursor:'pointer', textAlign:'left', transition:'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor='#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor='white'}>
                  <span style={{ width:7, height:7, borderRadius:'50%', backgroundColor: branchId===su.id ? '#1D9E75' : 'transparent', border: branchId===su.id ? 'none' : '1.5px solid #D1D5DB', flexShrink:0 }} />
                  {su.nombre}
                </button>
              ))}
              <div style={{ height:'0.5px', backgroundColor:'rgba(0,0,0,0.06)', margin:'4px 0' }} />
              <button onClick={() => { setBranchId('todas'); setOpen(false); }}
                style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'9px 14px', fontSize:13, backgroundColor:'white', border:'none', cursor:'pointer', textAlign:'left', transition:'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor='#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor='white'}>
                <span style={{ width:7, height:7, borderRadius:'50%', backgroundColor: branchId==='todas' ? '#1D9E75' : 'transparent', border: branchId==='todas' ? 'none' : '1.5px solid #D1D5DB', flexShrink:0 }} />
                Todas las sucursales
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <span className="hidden sm:block" style={{ fontSize:12, color:'#9CA3AF' }}>{dateLong(new Date())}</span>
        <div style={{ position:'relative', cursor:'pointer' }} onClick={()=>setAlertsOpen(v=>!v)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          {alertsCount > 0 && (
            <span style={{ position:'absolute', top:-6, right:-6, width:16, height:16, backgroundColor:'#EF4444', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'white' }}>{alertsCount}</span>
          )}
          {alertsOpen && <AlertsDropdown alerts={liveAlerts} onClose={()=>setAlertsOpen(false)} />}
        </div>
        <div ref={userRef} style={{ position:'relative' }}>
          <button onClick={()=>setUserMenuOpen(v=>!v)}
            style={{ width:28, height:28, borderRadius:'50%', backgroundColor:'#1D9E75', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:12, fontWeight:700, border:'none', cursor:'pointer' }}>
            {userInitial}
          </button>
          {userMenuOpen && (
            <div style={{ position:'absolute', top:36, right:0, backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'4px 0', minWidth:180, zIndex:999, boxShadow:'0 4px 16px rgba(0,0,0,0.10)' }}>
              <div style={{ padding:'10px 14px', borderBottom:'0.5px solid rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{userName}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{userRole}</div>
                <span style={{ display:'inline-block', marginTop:6, backgroundColor:roleBadge.bg, color:roleBadge.c, padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:600 }}>{roleBadge.label}</span>
              </div>
              <button
                onClick={()=>{ setUserMenuOpen(false); supabase.auth.signOut().then(() => window.location.href = '/login'); }}
                style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'9px 14px', fontSize:13, backgroundColor:'white', border:'none', cursor:'pointer', color:'#EF4444', textAlign:'left' }}
                onMouseEnter={e=>e.currentTarget.style.backgroundColor='#FEF2F2'}
                onMouseLeave={e=>e.currentTarget.style.backgroundColor='white'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


