import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { money } from '@/lib/fmt';

const TIPO_LABEL = { manana:'Mañana', tarde:'Tarde', noche:'Noche', general:'General' };
const FILTROS = [
  { key:'todos', label:'Todos' },
  { key:'manana', label:'Mañana' },
  { key:'tarde', label:'Tarde' },
  { key:'noche', label:'Noche' },
  { key:'general', label:'General' },
];

const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDayLong(key) {
  const [y,m,dd] = key.split('-').map(Number);
  const d = new Date(y, m-1, dd);
  const nombre = DIAS[d.getDay()];
  return `${nombre.charAt(0).toUpperCase()+nombre.slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export default function ShiftHistory() {
  const store = useStore();
  const [shifts, setShifts] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('todos');

  useEffect(() => {
    async function load() {
      try {
        let result;
        if (store.branchId && store.branchId !== 'todas') {
          result = await base44.entities.CajaShift.filter({ branch_id: store.branchId, status: 'cerrado' }, '-cerrado_at', 100);
        } else {
          const branchIds = (store.sucursales||[]).map(b => b.id);
          const shiftArrays = await Promise.all(
            branchIds.map(bid =>
              base44.entities.CajaShift.filter({ branch_id: bid, status: 'cerrado' }, '-cerrado_at', 100).catch(() => [])
            )
          );
          result = shiftArrays.flat();
        }
        setShifts(result || []);
      } catch(err) {
        setShifts([]);
      }
    }
    load();
  }, [store.branchId, store.sucursales]);

  const filtered = useMemo(() => {
    if (!shifts) return [];
    if (filtroTipo === 'todos') return shifts;
    return shifts.filter(s => s.tipo_turno === filtroTipo);
  }, [shifts, filtroTipo]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(s => {
      const key = s.cerrado_at ? fmtDayKey(s.cerrado_at) : '0000-00-00';
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return Object.entries(map).sort((a,b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  if (shifts === null) {
    return <div style={{ textAlign:'center', padding:'40px 0', fontSize:13, color:'#9CA3AF' }}>Cargando historial...</div>;
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      {/* Filtros */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {FILTROS.map(f => (
          <button key={f.key} onClick={()=>setFiltroTipo(f.key)}
            style={{
              padding:'6px 14px', fontSize:12, fontWeight:500, borderRadius:99, cursor:'pointer',
              border: filtroTipo===f.key ? 'none' : '0.5px solid rgba(0,0,0,0.12)',
              backgroundColor: filtroTipo===f.key ? '#1D9E75' : 'white',
              color: filtroTipo===f.key ? 'white' : '#374151',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, padding:'40px 20px', textAlign:'center' }}>
          <div style={{ fontSize:14, color:'#374151', fontWeight:500 }}>No hay turnos cerrados todavía</div>
          <div style={{ fontSize:12, color:'#9CA3AF', marginTop:4 }}>Cuando cierres tu primer turno aparecerá acá.</div>
        </div>
      ) : grouped.map(([dayKey, dayShifts]) => {
        const totalDia = dayShifts.reduce((a,s) => a + (s.total_facturado_turno||0), 0);
        return (
          <div key={dayKey}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 4px', marginBottom:4 }}>
              <span style={{ fontSize:13, fontWeight:600, color:'#374151' }}>{fmtDayLong(dayKey)}</span>
              <span style={{ fontSize:13, color:'#1D9E75', fontWeight:600 }}>{money(totalDia)}</span>
            </div>
            {dayShifts.map(s => {
              const dif = s.diferencia_caja || 0;
              let badge;
              if (dif === 0) badge = { bg:'#E8F7F2', color:'#1D9E75', text:'Cuadró' };
              else if (dif > 0) badge = { bg:'#FEF9C3', color:'#CA8A04', text:`+${money(dif)}` };
              else badge = { bg:'#FEE2E2', color:'#EF4444', text:`-${money(Math.abs(dif))}` };

              const isExp = expanded === s.id;
              let retiros = [];
              try { retiros = JSON.parse(s.retiros || '[]'); } catch(e) {}
              const totalRetiros = retiros.reduce((a,r) => a + (r.monto||0), 0);
              const nombreCard = s.nombre_turno || ('Caja ' + (TIPO_LABEL[s.tipo_turno] || s.tipo_turno || ''));

              return (
                <div key={s.id} style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:8, overflow:'hidden', margin:'6px 0' }}>
                  <button onClick={()=>setExpanded(isExp?null:s.id)}
                    style={{ width:'100%', padding:'12px 16px', display:'flex', alignItems:'center', gap:14, border:'none', backgroundColor:'white', cursor:'pointer', textAlign:'left', flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{nombreCard}</span>
                    <span style={{ fontSize:12, color:'#9CA3AF' }}>{fmtTime(s.abierto_at)} → {fmtTime(s.cerrado_at)}</span>
                    <div style={{ flex:1 }} />
                    <span style={{ fontSize:14, fontWeight:700, color:'#1D9E75' }}>{money(s.total_facturado_turno||0)}</span>
                    <span style={{ backgroundColor:badge.bg, color:badge.color, padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:600 }}>{badge.text}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ transform: isExp?'rotate(180deg)':'rotate(0)', transition:'transform .15s' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {isExp && (
                    <div style={{ padding:'12px 16px', borderTop:'0.5px solid rgba(0,0,0,0.06)', backgroundColor:'#F9FAFB', display:'flex', flexDirection:'column', gap:10 }}>
                      <Detail label="Fondo inicial" value={money(s.fondo_inicial||0)} />
                      <Detail label="Total facturado" value={money(s.total_facturado_turno||0)} color="#1D9E75" />
                      <Detail label="Total retiros" value={`-${money(totalRetiros)}`} color="#F97316" />
                      <Detail label="Arqueo efectivo contado" value={money(s.arqueo_efectivo||0)} />
                      <Detail label="Diferencia" value={dif===0?'$0 (cuadró)':`${dif>0?'+':'-'}${money(Math.abs(dif))}`} color={dif===0?'#1D9E75':dif>0?'#CA8A04':'#EF4444'} />
                      {s.motivo_diferencia && <Detail label="Motivo" value={s.motivo_diferencia} />}

                      {retiros.length > 0 && (
                        <div>
                          <div style={{ fontSize:12, color:'#6B7280', fontWeight:600, marginBottom:6 }}>Retiros ({retiros.length})</div>
                          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            {retiros.map((r,i) => (
                              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#374151' }}>
                                <span>{fmtTime(r.ts)} · {r.concepto}</span>
                                <span style={{ color:'#EF4444' }}>-{money(r.monto)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Detail({ label, value, color }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
      <span style={{ color:'#6B7280' }}>{label}</span>
      <span style={{ color: color || '#111827', fontWeight:500 }}>{value}</span>
    </div>
  );
}


