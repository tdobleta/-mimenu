import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useStore } from '@/lib/store';
import { dateLong } from '@/lib/fmt';
import AlertsDropdown from './AlertsDropdown';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import useUserRole from '@/lib/useUserRole';
import { G, glassLight } from '@/lib/glass';

const ROLE_BADGE = {
  Dueno:     { bg:'rgba(29,158,117,0.12)', c:G.teal,   label:'Dueño' },
  Encargado: { bg:'rgba(55,138,221,0.12)', c:G.blue,   label:'Encargado' },
  Mozo:      { bg:'rgba(0,0,0,0.06)',      c:'#6B7280', label:'Mozo' },
  Cocinero:  { bg:'rgba(239,159,39,0.12)', c:G.amber,  label:'Cocinero' },
};

export default function Topbar({ onMobile }) {
  const store = useStore();
  const { restaurante, branchId, sucursales, setBranchId } = store;
  const { user } = useAuth();

  const liveAlerts = useMemo(() => {
    const stockItems = store.getStock ? store.getStock() : [];
    return stockItems
      .filter(it => Number(it.actual) < Number(it.minimo))
      .map(it => ({ id:it.id, mensaje:`Stock bajo: ${it.nombre} (${it.actual}/${it.minimo})`, created_date:new Date().toISOString() }));
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
    <div style={{
      height: 58,
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 12,
      background: 'rgba(255,255,255,0.55)',
      backdropFilter: 'blur(20px) saturate(160%)',
      WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      borderBottom: '1px solid rgba(255,255,255,0.65)',
      boxShadow: '0 2px 16px rgba(80,80,180,0.05)',
      flexShrink: 0,
      position: 'relative',
      zIndex: 5,
    }}>
      {/* Mobile menu toggle */}
      <button className="md:hidden" onClick={onMobile} style={{ color:G.textMuted, background:'none', border:'none', cursor:'pointer', padding:4 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      {/* Restaurante + rol */}
      {restaurante.nombre && (
        <div className="hidden md:flex" style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ ...glassLight({ padding:'4px 12px', borderRadius:99, display:'flex', alignItems:'center', gap:6 }) }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={G.teal} strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span style={{ fontSize:13, color:G.text, fontWeight:500 }}>{restaurante.nombre}</span>
          </div>
          <span style={{ background:roleBadge.bg, color:roleBadge.c, fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99 }}>
            {roleBadge.label}
          </span>
        </div>
      )}

      {/* Sucursal selector - centro */}
      <div style={{ flex:1, display:'flex', justifyContent:'center' }} ref={ref}>
        <div style={{ position:'relative' }}>
          <button onClick={() => setOpen(v=>!v)} style={{
            ...glassLight({ padding:'7px 16px', borderRadius:99, display:'flex', alignItems:'center', gap:8, border:'1px solid rgba(255,255,255,0.8)', cursor:'pointer' }),
            fontSize: 13, fontWeight: 500, color: G.text,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={G.teal} strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {activeName}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={G.textFaint} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {open && (
            <div style={{
              position:'absolute', top:42, left:'50%', transform:'translateX(-50%)',
              background:'rgba(255,255,255,0.90)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
              border:'1px solid rgba(255,255,255,0.9)', borderRadius:14, padding:'4px 0',
              minWidth:220, zIndex:999,
              boxShadow:'0 8px 32px rgba(60,60,160,0.12)',
            }}>
              {sucursales.map(su => (
                <button key={su.id} onClick={() => { setBranchId(su.id); setOpen(false); }}
                  style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'9px 16px', fontSize:13, background:'transparent', border:'none', cursor:'pointer', textAlign:'left', color:G.text, transition:'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(29,158,117,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background: branchId===su.id ? G.teal : 'transparent', border: branchId===su.id ? 'none' : `1.5px solid #D1D5DB`, flexShrink:0 }} />
                  {su.nombre}
                </button>
              ))}
              <div style={{ height:'0.5px', background:'rgba(0,0,0,0.06)', margin:'4px 0' }} />
              <button onClick={() => { setBranchId('todas'); setOpen(false); }}
                style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'9px 16px', fontSize:13, background:'transparent', border:'none', cursor:'pointer', textAlign:'left', color:G.text, transition:'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(29,158,117,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <span style={{ width:7, height:7, borderRadius:'50%', background: branchId==='todas' ? G.teal : 'transparent', border: branchId==='todas' ? 'none' : `1.5px solid #D1D5DB`, flexShrink:0 }} />
                Todas las sucursales
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Derecha: fecha + alertas + usuario */}
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <span className="hidden sm:block" style={{ fontSize:12, color:G.textFaint }}>{dateLong(new Date())}</span>

        {/* Alertas */}
        <div style={{ position:'relative', cursor:'pointer' }} onClick={() => setAlertsOpen(v=>!v)}>
          <div style={{ ...glassLight({ width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0 }) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={G.textMuted} strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          {alertsCount > 0 && (
            <span style={{ position:'absolute', top:-4, right:-4, width:16, height:16, background:'#EF4444', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'white', border:'2px solid white' }}>{alertsCount}</span>
          )}
          {alertsOpen && <AlertsDropdown alerts={liveAlerts} onClose={() => setAlertsOpen(false)} />}
        </div>

        {/* Usuario */}
        <div ref={userRef} style={{ position:'relative' }}>
          <button onClick={() => setUserMenuOpen(v=>!v)} style={{
            width:34, height:34, borderRadius:'50%',
            background: `linear-gradient(135deg, ${G.teal}, #0F6E56)`,
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'white', fontSize:13, fontWeight:700, border:'none', cursor:'pointer',
            boxShadow:`0 3px 10px rgba(29,158,117,0.30)`,
          }}>
            {userInitial}
          </button>
          {userMenuOpen && (
            <div style={{
              position:'absolute', top:42, right:0,
              background:'rgba(255,255,255,0.92)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
              border:'1px solid rgba(255,255,255,0.9)', borderRadius:14, padding:'4px 0',
              minWidth:190, zIndex:999,
              boxShadow:'0 8px 32px rgba(60,60,160,0.12)',
            }}>
              <div style={{ padding:'12px 16px', borderBottom:'0.5px solid rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:13, fontWeight:600, color:G.text }}>{userName}</div>
                <div style={{ fontSize:11, color:G.textFaint, marginTop:2 }}>{userRole}</div>
                <span style={{ display:'inline-block', marginTop:6, background:roleBadge.bg, color:roleBadge.c, padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:700 }}>{roleBadge.label}</span>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); supabase.auth.signOut().then(() => window.location.href = '/login'); }}
                style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'10px 16px', fontSize:13, background:'transparent', border:'none', cursor:'pointer', color:'#EF4444', textAlign:'left' }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
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
