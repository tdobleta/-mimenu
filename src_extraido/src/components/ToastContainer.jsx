import { useToast } from '@/lib/toast';

const TYPE_COLOR = { success:'#1D9E75', error:'#EF4444', warning:'#CA8A04', info:'#3B82F6' };

export default function ToastContainer() {
  const { toasts, remove } = useToast();
  return (
    <div style={{ position:'fixed', bottom:20, right:20, zIndex:9999, display:'flex', flexDirection:'column', gap:8, pointerEvents:'none' }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => remove(t.id)}
          style={{
            display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px',
            backgroundColor:'#0D1117', borderLeft:`3px solid ${TYPE_COLOR[t.type]||'#1D9E75'}`,
            borderRadius:8, minWidth:260, maxWidth:360, color:'white', fontSize:13,
            lineHeight:'18px', pointerEvents:'auto', cursor:'pointer',
            animation:'toastIn .25s ease',
          }}>
          <span style={{ width:8,height:8,borderRadius:'50%',backgroundColor:TYPE_COLOR[t.type]||'#1D9E75',flexShrink:0,marginTop:5 }} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}


