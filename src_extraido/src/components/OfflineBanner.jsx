import { useState, useEffect } from 'react';
import { useOfflineSync } from '@/lib/offlineSync';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBack, setShowBack] = useState(false);
  const { pending, syncing } = useOfflineSync();

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setShowBack(true);
      setTimeout(() => setShowBack(false), 4000);
    }
    function handleOffline() {
      setIsOnline(false);
      setShowBack(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showSyncBanner = isOnline && (syncing || pending > 0);
  if (isOnline && !showBack && !showSyncBanner) return null;

  if (showSyncBanner) return (
    <div style={{ position:'fixed',top:0,left:0,right:0,zIndex:9999,padding:'8px 20px',display:'flex',alignItems:'center',justifyContent:'center',gap:10,fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",background:syncing?'#F97316':'#3B82F6',color:'white',boxShadow:'0 2px 12px rgba(0,0,0,0.15)' }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      {syncing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{animation:'spin 1s linear infinite'}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> : null}
      {syncing ? `Sincronizando ${pending} operación${pending!==1?'es':''} pendiente${pending!==1?'s':''}...` : `${pending} operación${pending!==1?'es':''} pendiente${pending!==1?'s':''} de sincronizar`}
    </div>
  );

  if (isOnline && showBack) return (
    <div style={{ position:'fixed',top:0,left:0,right:0,zIndex:9999,padding:'8px 20px',display:'flex',alignItems:'center',justifyContent:'center',gap:10,fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",background:'#1D9E75',color:'white',boxShadow:'0 2px 12px rgba(0,0,0,0.15)' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      Conexión restaurada
    </div>
  );

  return (
    <div style={{ position:'fixed',top:0,left:0,right:0,zIndex:9999,padding:'8px 20px',display:'flex',alignItems:'center',justifyContent:'center',gap:10,fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",background:'#EF4444',color:'white',boxShadow:'0 2px 12px rgba(0,0,0,0.15)' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
      Sin conexión — algunas funciones no están disponibles
    </div>
  );
}
