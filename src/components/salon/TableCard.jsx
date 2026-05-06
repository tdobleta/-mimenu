import { elapsedMin, fmtTableTime, tableTotal, money } from '@/lib/fmt';

const S = {
  libre:    { bg:'white',    border:'#E5E7EB', numColor:'#9CA3AF', dot:null      },
  ocupada:  { bg:'#E8F7F2',  border:'#1D9E75', numColor:'#1D9E75', dot:'#1D9E75' },
  demorada: { bg:'#FEF2F2',  border:'#EF4444', numColor:'#EF4444', dot:'#EF4444' },
  reservada:{ bg:'#EFF6FF',  border:'#3B82F6', numColor:'#3B82F6', dot:'#3B82F6' },
};

export default function TableCard({ table, isSelected, onClick, onComandaListaClick, loading = false }) {
  const s = S[table.status] || S.libre;
  const elapsed = table.openedAt ? elapsedMin(table.openedAt) : 0;
  const total   = tableTotal(table.order);
  const showYellow = table.comandaLista && table.status === 'ocupada';

  return (
    <button onClick={onClick} disabled={loading}
      style={{
        width:'100%', position:'relative', borderRadius:10, padding:'10px 8px', textAlign:'left', cursor:'pointer', transition:'all .15s',
        backgroundColor: s.bg,
        border: `1px solid ${isSelected ? '#0A7A5A' : s.border}`,
        outline: isSelected ? '2px solid #1D9E75' : 'none',
        outlineOffset: 2,
        height: 140,
      }}>

      {/* Punto de estado normal */}
      {s.dot && !showYellow && (
        <span style={{ position:'absolute', top:8, right:8, width:8, height:8, borderRadius:'50%', backgroundColor:s.dot }} />
      )}

      {/* Punto amarillo — comanda lista */}
      {showYellow && (
        <button
          onClick={e => { e.stopPropagation(); onComandaListaClick && onComandaListaClick(); }}
          title="Marcar como entregado"
          style={{
            position:'absolute', top:6, right:6,
            width:20, height:20, borderRadius:'50%',
            backgroundColor:'#FBBF24',
            border:'2px solid #F59E0B',
            cursor:'pointer',
            boxShadow:'0 0 0 3px rgba(251,191,36,0.3)',
            animation:'yellowpulse 1.2s ease-in-out infinite',
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:0,
          }}>
          <style>{`@keyframes yellowpulse { 0%,100%{box-shadow:0 0 0 3px rgba(251,191,36,0.3)} 50%{box-shadow:0 0 0 6px rgba(251,191,36,0.1)} }`}</style>
        </button>
      )}

      <div style={{ fontSize:22, fontWeight:700, color:s.numColor, lineHeight:1 }}>{table.num}</div>
      {table.status !== 'libre' && (
        <div style={{ marginTop:4 }}>
          {table.openedAt && <div style={{ fontSize:12, fontWeight:600, color:s.numColor, marginTop:3 }}>{fmtTableTime(elapsed)}</div>}
          {total > 0     && <div style={{ fontSize:13, fontWeight:700, color:s.numColor }}>{money(total)}</div>}
          {table.clientName && <div style={{ fontSize:11, color:s.numColor, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{table.clientName}</div>}
        </div>
      )}
      <div style={{ fontSize:11, color:'#9CA3AF', marginTop: table.status === 'libre' ? 12 : 3 }}>{table.sillas} sillas</div>
      {loading && (
        <div style={{ position:'absolute', inset:0, borderRadius:10, backgroundColor:'rgba(255,255,255,0.7)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:16, height:16, border:'2px solid #E5E7EB', borderTop:'2px solid #1D9E75', borderRadius:'50%', animation:'tcspin 0.8s linear infinite' }} />
          <style>{`@keyframes tcspin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </button>
  );
}


