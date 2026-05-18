import { elapsedMin, fmtTableTime, tableTotal, money } from '@/lib/fmt';
import { G } from '@/lib/glass';

const S = {
  libre:    { bg:'rgba(255,255,255,0.6)', border:'rgba(209,213,219,0.8)', numColor:'#9CA3AF', dot:null,    shadow:'none' },
  ocupada:  { bg:'rgba(29,158,117,0.10)', border:G.teal,                  numColor:G.teal,   dot:G.teal,  shadow:'0 4px 16px rgba(29,158,117,0.18)' },
  demorada: { bg:'rgba(226,75,74,0.09)',  border:G.red,                   numColor:G.red,    dot:G.red,   shadow:'0 4px 16px rgba(226,75,74,0.18)' },
  reservada:{ bg:'rgba(55,138,221,0.09)', border:G.blue,                  numColor:G.blue,   dot:G.blue,  shadow:'0 4px 16px rgba(55,138,221,0.18)' },
};

export default function TableCard({ table, isSelected, onClick, onComandaListaClick, loading = false }) {
  const s = S[table.status] || S.libre;
  const elapsed = table.openedAt ? elapsedMin(table.openedAt) : 0;
  const total   = tableTotal(table.order);
  const showYellow = table.comandaLista && table.status === 'ocupada';
  const ocupada = table.status !== 'libre';

  return (
    <button onClick={onClick} disabled={loading}
      style={{
        width: '100%',
        position: 'relative',
        borderRadius: 16,
        padding: '14px 14px',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all .18s',
        height: 130,
        background: s.bg,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1.5px solid ${isSelected ? G.teal : s.border}`,
        outline: isSelected ? '3px solid rgba(29,158,117,0.25)' : 'none',
        outlineOffset: 2,
        boxShadow: isSelected ? `0 0 0 3px rgba(29,158,117,0.15), ${s.shadow}` : s.shadow,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>

      {/* Fila superior: número + indicador */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div style={{ fontSize:28, fontWeight:800, color:s.numColor, lineHeight:1, fontFamily:"'Playfair Display', Georgia, serif" }}>
          {table.num}
        </div>

        {/* Dot estado */}
        {s.dot && !showYellow && (
          <span style={{ width:9, height:9, borderRadius:'50%', background:s.dot, boxShadow:`0 0 6px ${s.dot}60`, marginTop:4 }} />
        )}

        {/* Dot amarillo comanda lista */}
        {showYellow && (
          <button onClick={e => { e.stopPropagation(); onComandaListaClick?.(); }}
            title="Marcar como entregado"
            style={{ width:22, height:22, borderRadius:'50%', background:'#FBBF24', border:'2px solid #F59E0B',
              cursor:'pointer', boxShadow:'0 0 0 4px rgba(251,191,36,0.25)',
              animation:'yellowpulse 1.2s ease-in-out infinite',
              display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
            <style>{`@keyframes yellowpulse{0%,100%{box-shadow:0 0 0 4px rgba(251,191,36,0.25)}50%{box-shadow:0 0 0 8px rgba(251,191,36,0.08)}}`}</style>
          </button>
        )}
      </div>

      {/* Fila inferior: info ocupada o sillas */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
        {ocupada ? (
          <>
            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
              {total > 0 && <div style={{ fontSize:14, fontWeight:800, color:s.numColor, lineHeight:1 }}>{money(total)}</div>}
              {table.openedAt && <div style={{ fontSize:11, color:s.numColor, opacity:0.7, fontWeight:600 }}>{fmtTableTime(elapsed)}</div>}
            </div>
            <div style={{ fontSize:10, color:G.textFaint, fontWeight:500 }}>{table.sillas} sillas</div>
          </>
        ) : (
          <div style={{ fontSize:10, color:G.textFaint, fontWeight:500 }}>{table.sillas} sillas</div>
        )}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div style={{ position:'absolute', inset:0, borderRadius:16, background:'rgba(255,255,255,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:18, height:18, border:'2.5px solid rgba(29,158,117,0.2)', borderTop:`2.5px solid ${G.teal}`, borderRadius:'50%', animation:'tcspin 0.7s linear infinite' }} />
          <style>{`@keyframes tcspin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
    </button>
  );
}
