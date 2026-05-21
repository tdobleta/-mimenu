import { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { money } from '@/lib/fmt';
import { CATEGORY_NAMES as CATEGORIES } from '@/lib/menuCategories';

const PAY_COLORS = {
  'Efectivo':'#1D9E75',
  'MercadoPago':'#3B82F6',
  'Débito':'#F59E0B',
  'Crédito':'#EF4444',
  'Transferencia':'#8B5CF6',
  'Otro':'#9CA3AF',
};

function normalizeMethod(m) {
  const s = (m||'').toLowerCase();
  if (s.includes('efectivo')) return 'Efectivo';
  if (s.includes('mercado')) return 'MercadoPago';
  if (s.includes('déb') || s.includes('deb')) return 'Débito';
  if (s.includes('créd') || s.includes('cred')) return 'Crédito';
  if (s.includes('trans')) return 'Transferencia';
  return 'Otro';
}

// Desglosa pagos mixtos igual que Caja.jsx
function parsePagos(t) {
  // 1. pagos_detalle (nuevo campo JSONB) o pagos (campo legacy)
  const raw = t.pagos_detalle || t.pagos;
  if (raw) {
    try {
      const arr = Array.isArray(raw) ? raw : JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {}
  }
  const m = t.metodo_pago || '';
  // 2. Pago simple
  if (!m.toLowerCase().startsWith('mixto')) {
    return [{ metodo: m, monto: t.total_facturado || 0 }];
  }
  // 3. Parsear string "Mixto (Efectivo $10.000 + Tarjeta $5.000)"
  const inner = m.match(/\((.+)\)/)?.[1];
  if (!inner) return [{ metodo: m, monto: t.total_facturado || 0 }];
  const parts = inner.split('+').map(part => {
    const trimmed = part.trim();
    const match = trimmed.match(/^(.+?)\s+\$([\d.,]+)$/);
    if (!match) return null;
    const montoStr = match[2].replace(/\./g, '').replace(',', '.');
    return { metodo: match[1].trim(), monto: Number(montoStr) };
  }).filter(Boolean);
  return parts.length > 0 ? parts : [{ metodo: m, monto: t.total_facturado || 0 }];
}

export default function IncomeDistribution({ periodTurns, periodItems, menuItemsDb }) {
  const payData = useMemo(() => {
    const map = {};
    periodTurns.forEach(t => {
      const pagos = parsePagos(t);
      pagos.forEach(p => {
        const name = normalizeMethod(p.metodo);
        map[name] = (map[name]||0) + (Number(p.monto)||0);
      });
    });
    const total = Object.values(map).reduce((a,b) => a+b, 0);
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: total > 0 ? ((value/total)*100).toFixed(1) : '0.0' }))
      .sort((a,b) => b.value - a.value);
  }, [periodTurns]);

  const catData = useMemo(() => {
    const menuMap = {};
    (menuItemsDb||[]).forEach(m => { menuMap[m.id] = m.categoria || ''; });
    const acc = {};
    CATEGORIES.forEach(c => acc[c] = 0);
    periodItems.forEach(it => {
      const cat = menuMap[it.menu_item_id];
      const c = CATEGORIES.includes(cat) ? cat : null;
      if (c) acc[c] += (it.cantidad||0) * (it.precio||0);
    });
    return CATEGORIES.map(c => ({ categoria: c, monto: acc[c] }));
  }, [periodItems, menuItemsDb]);

  const totalPay = payData.reduce((a,b) => a + b.value, 0);

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:16 }}>
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', borderRadius:12, padding:'18px 20px' }}>
        <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginBottom:14 }}>Cómo te pagan</div>
        {totalPay === 0 ? (
          <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'30px 0' }}>Sin datos de pago</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={payData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
                  {payData.map(p => <Cell key={p.name} fill={PAY_COLORS[p.name]||'#9CA3AF'} />)}
                </Pie>
                <Tooltip contentStyle={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:8, fontSize:12 }} formatter={v => [money(v)]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:10 }}>
              {payData.map(p => (
                <div key={p.name} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:10, height:10, borderRadius:2, backgroundColor:PAY_COLORS[p.name]||'#9CA3AF', flexShrink:0 }} />
                  <span style={{ flex:1, fontSize:12, color:'#374151' }}>{p.name}</span>
                  <span style={{ fontSize:12, color:'#111827', fontWeight:500 }}>{money(p.value)}</span>
                  <span style={{ fontSize:11, color:'#9CA3AF', minWidth:42, textAlign:'right' }}>{p.pct}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', borderRadius:12, padding:'18px 20px' }}>
        <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginBottom:14 }}>Facturación por categoría</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={catData} layout="vertical" margin={{ left:20 }}>
            <XAxis type="number" tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000 ? `$${Math.round(v/1000)}k` : `$${v}`} />
            <YAxis type="category" dataKey="categoria" tick={{ fontSize:12, fill:'#374151' }} axisLine={false} tickLine={false} width={90} />
            <Tooltip contentStyle={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:8, fontSize:12 }} formatter={v => [money(v), 'Facturación']} />
            <Bar dataKey="monto" fill="#1D9E75" radius={[0,6,6,0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


