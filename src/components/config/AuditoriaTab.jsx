import { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';

const CAT_BADGE = {
  'Salón':      { bg:'#E8F7F2', c:'#1D9E75' },
  'Caja':       { bg:'#DBEAFE', c:'#3B82F6' },
  'Menú':       { bg:'#FFEDD5', c:'#F97316' },
  'Reservas':   { bg:'#EDE9FE', c:'#8B5CF6' },
  'Stock':      { bg:'#FEF9C3', c:'#CA8A04' },
  'Analíticas': { bg:'#FEE2E2', c:'#EF4444' },
  'Equipo':     { bg:'#F3F4F6', c:'#6B7280' },
};
const CATEGORIAS = ['Salón','Caja','Menú','Reservas','Stock','Analíticas','Equipo'];

function fmtFecha(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function AuditoriaTab() {
  const store = useStore();
  const { auditoria, sucursales, restaurantId } = store;
  const [search, setSearch] = useState('');
  const [filterSuc, setFilterSuc] = useState('todas');
  const [filterCat, setFilterCat] = useState('todas');
  const [dbRows, setDbRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) { setDbRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await base44.entities.AuditLog.filter({ restaurant_id: restaurantId }, '-ts', 500);
      setDbRows((rows || []).map(r => ({
        id: r.id,
        fecha: r.ts ? fmtFecha(r.ts) : '',
        usuario: r.usuario_email || 'Sistema',
        accion: r.accion || '',
        entidad: r.categoria || '',
        detalle: r.detalle || '',
        sucursal: r.sucursal_nombre || '',
        ts: r.ts || 0,
      })));
    } catch(err) {
      setDbRows([]);
    }
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  const combined = useMemo(() => {
    const map = new Map();
    [...dbRows, ...(auditoria||[])].forEach(r => {
      if (!map.has(r.id)) map.set(r.id, r);
    });
    return Array.from(map.values()).sort((a,b) => (b.ts||0) - (a.ts||0)).slice(0, 200);
  }, [dbRows, auditoria]);

  const filtered = combined.filter(row => {
    const matchSearch = !search || [row.usuario, row.accion, row.entidad, row.detalle].some(v => v?.toLowerCase().includes(search.toLowerCase()));
    const matchSuc = filterSuc === 'todas' || row.sucursal?.toLowerCase() === filterSuc;
    const matchCat = filterCat === 'todas' || row.entidad === filterCat;
    return matchSearch && matchSuc && matchCat;
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{ flex:1, minWidth:200, padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13 }} />
        <select value={filterSuc} onChange={e=>setFilterSuc(e.target.value)}
          style={{ padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, backgroundColor:'white' }}>
          <option value="todas">Todas las sucursales</option>
          {sucursales.map(s=><option key={s.id} value={s.nombre.toLowerCase()}>{s.nombre}</option>)}
        </select>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
          style={{ padding:'7px 10px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:13, backgroundColor:'white' }}>
          <option value="todas">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          style={{ padding:'7px 14px', border:'0.5px solid rgba(0,0,0,0.12)', borderRadius:7, fontSize:12, color:'#374151', backgroundColor:'white', cursor:'pointer' }}>
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>
      <div style={{ fontSize:11, color:'#9CA3AF' }}>{filtered.length} registro{filtered.length!==1?'s':''} encontrado{filtered.length!==1?'s':''}</div>
      <div style={{ backgroundColor:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:10, overflow:'hidden', overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead style={{ backgroundColor:'#F9FAFB' }}>
            <tr>
              {['Fecha','Usuario','Categoría','Acción','Detalle'].map(h=>(
                <th key={h} style={{ textAlign:'left', padding:'10px 14px', fontSize:11, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.4px', borderBottom:'0.5px solid rgba(0,0,0,0.08)', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding:'32px', textAlign:'center', fontSize:13, color:'#9CA3AF' }}>{loading ? 'Cargando...' : 'No hay registros.'}</td></tr>
            ) : filtered.map(row => {
              const badge = CAT_BADGE[row.entidad] || { bg:'#F3F4F6', c:'#6B7280' };
              return (
                <tr key={row.id} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding:'10px 14px', color:'#9CA3AF', fontSize:12, whiteSpace:'nowrap' }}>{row.fecha}</td>
                  <td style={{ padding:'10px 14px', fontWeight:500, color:'#111827' }}>{row.usuario}</td>
                  <td style={{ padding:'10px 14px' }}>
                    {row.entidad ? <span style={{ backgroundColor:badge.bg, color:badge.c, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>{row.entidad}</span> : <span style={{ color:'#9CA3AF', fontSize:12 }}>-</span>}
                  </td>
                  <td style={{ padding:'10px 14px', color:'#374151' }}>{row.accion}</td>
                  <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12 }}>{row.detalle}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


