import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { G, glass, glassDeep, fontDisplay, fontUI } from '@/lib/glass';
import { money } from '@/lib/fmt';

// ── Helpers ────────────────────────────────────────────────────────────

function minutesSince(ts) {
  if (!ts) return 0;
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
}

function fmtMin(m) {
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtHora(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function mesaColor(mins) {
  if (mins >= 15) return { bg: '#DBEAFE', border: '#3B82F6', text: '#1E40AF', label: 'Demorada' };
  if (mins >= 8)  return { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', label: 'En tiempo' };
  return              { bg: '#D1FAE5', border: '#10B981', text: '#065F46', label: 'Normal' };
}

// ── Component ──────────────────────────────────────────────────────────

export default function ControlCocina() {
  const store = useStore();
  const branchId = store.branchId !== 'todas' ? store.branchId : store.sucursales[0]?.id;
  const allTables = store.getTables(branchId);

  const [comandas, setComandas] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [promedioPrep, setPromedioPrep] = useState(null);
  const completedCountRef = useRef(0);
  const prepTimesRef = useRef([]);
  const [, setTick] = useState(0);

  // ── Cargar comandas activas ──────────────────────────────────────────

  const loadComandas = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data: turns } = await supabase
        .from('turns')
        .select('*')
        .eq('branch_id', branchId)
        .eq('status', 'abierta')
        .eq('enviado_cocina', true)
        .order('opened_at', { ascending: true });

      const turnIds = (turns || []).map(t => t.id);
      let allItems = [];
      if (turnIds.length > 0) {
        const BATCH = 50;
        for (let i = 0; i < turnIds.length; i += BATCH) {
          const batch = turnIds.slice(i, i + BATCH);
          const { data } = await supabase.from('turn_items').select('*').in('turn_id', batch);
          if (data) allItems.push(...data);
        }
      }

      setComandas((turns || []).map(t => ({
        ...t,
        items: allItems.filter(it => it.turn_id === t.id),
        mins: minutesSince(t.opened_at),
      })));
    } catch (e) {
      console.error('Error cargando comandas:', e);
    }
  }, [branchId]);

  // ── Realtime + fallback ──────────────────────────────────────────────

  useEffect(() => {
    if (!branchId) return;
    loadComandas();

    const channel = supabase
      .channel(`ctrl_cocina_${branchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turns', filter: `branch_id=eq.${branchId}` }, () => loadComandas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turn_items' }, () => loadComandas())
      .subscribe();

    const fallback = setInterval(loadComandas, 30000);
    return () => { supabase.removeChannel(channel); clearInterval(fallback); };
  }, [branchId, loadComandas]);

  // Tick cada segundo para actualizar tiempos
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Marcar como entregada ────────────────────────────────────────────

  async function marcarEntregada(turnId) {
    try {
      await supabase.from('turns').update({ comanda_entregada: true, comanda_entregada_at: new Date().toISOString() }).eq('id', turnId);

      // Calcular tiempo de preparación para promedio
      const comanda = comandas.find(c => c.id === turnId);
      if (comanda?.opened_at) {
        const prepTime = minutesSince(comanda.opened_at);
        prepTimesRef.current.push(prepTime);
        completedCountRef.current++;

        // Actualizar promedio cada 5 entregas
        if (completedCountRef.current % 5 === 0 && prepTimesRef.current.length > 0) {
          const avg = Math.round(prepTimesRef.current.reduce((a, b) => a + b, 0) / prepTimesRef.current.length);
          setPromedioPrep(avg);
        }
      }

      loadComandas();
    } catch (e) {
      console.error('Error marcando entregada:', e);
    }
  }

  // ── Clasificar comandas ──────────────────────────────────────────────

  const activas = comandas.filter(c => c.cocina_estado !== 'lista' && !c.comanda_entregada);
  const listas = comandas.filter(c => c.cocina_estado === 'lista' && !c.comanda_entregada);
  const activeMesaNums = new Set(comandas.filter(c => !c.comanda_entregada).map(c => c.mesa_num));
  const demoradas = activas.filter(c => minutesSince(c.opened_at) >= 15).length;

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: fontUI }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: G.text, margin: 0, fontFamily: fontDisplay, letterSpacing: '-0.02em' }}>
          Control de Cocina
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <KPI label="Activas" value={activas.length} color={G.teal} />
          <KPI label="Listas" value={listas.length} color={G.red} />
          <KPI label="Demoradas" value={demoradas} color={G.blue} />
        </div>
      </div>

      {/* ── GRID DE TODAS LAS MESAS ───────────────────────────────── */}
      <div style={{ ...glassDeep({ padding: 20 }) }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: G.textFaint, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          Mesas del local
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 10 }}>
          {allTables.map(t => {
            const hasComanda = activeMesaNums.has(t.num);
            const comanda = comandas.find(c => c.mesa_num === t.num && !c.comanda_entregada);
            const mins = comanda ? minutesSince(comanda.opened_at) : 0;
            const isLista = comanda?.cocina_estado === 'lista';
            const mc = hasComanda ? (isLista ? { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' } : mesaColor(mins)) : { bg: 'rgba(243,244,246,0.8)', border: '#D1D5DB', text: '#9CA3AF' };

            return (
              <div
                key={t.id}
                onClick={() => comanda && setExpandedId(expandedId === comanda.id ? null : comanda.id)}
                style={{
                  height: 70,
                  borderRadius: 12,
                  border: `2px solid ${mc.border}`,
                  background: mc.bg,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: comanda ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                  position: 'relative',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: mc.text, lineHeight: 1 }}>{t.num}</div>
                {hasComanda && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: mc.text, marginTop: 2 }}>
                    {isLista ? 'LISTA' : fmtMin(mins)}
                  </div>
                )}
                {isLista && (
                  <div style={{ position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderRadius: '50%', background: '#EF4444', border: '2px solid white', animation: 'ccpulse 1.2s ease-in-out infinite' }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── COMANDA EXPANDIDA ─────────────────────────────────────── */}
      {expandedId && (() => {
        const c = comandas.find(x => x.id === expandedId);
        if (!c) return null;
        const mins = minutesSince(c.opened_at);
        const mc = c.cocina_estado === 'lista' ? { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' } : mesaColor(mins);
        return (
          <div style={{ ...glassDeep({ padding: 0, overflow: 'hidden' }), border: `2px solid ${mc.border}` }}>
            <div style={{ background: mc.bg, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: mc.text, fontFamily: fontDisplay }}>Mesa {c.mesa_num}</div>
                <div style={{ fontSize: 12, color: mc.text, opacity: 0.7, marginTop: 2 }}>
                  Enviada a las {fmtHora(c.opened_at)} · {fmtMin(mins)}
                </div>
              </div>
              <button onClick={() => setExpandedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: mc.text, fontSize: 20 }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {c.items.length === 0
                ? <div style={{ fontSize: 13, color: G.textFaint, textAlign: 'center', padding: 16 }}>Sin ítems</div>
                : c.items.map(item => (
                    <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: G.text }}>{item.menu_item_name}</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: G.text }}>×{item.cantidad}</span>
                      </div>
                      {item.notas && (
                        <div style={{ fontSize: 12, color: G.teal, marginTop: 4, fontStyle: 'italic', paddingLeft: 2 }}>
                          ↳ {item.notas}
                        </div>
                      )}
                    </div>
                  ))
              }
            </div>
          </div>
        );
      })()}

      {/* ── SECCIÓN INFERIOR: 3 PANELES ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 16 }}>

        {/* Panel izquierdo: Alertas */}
        <div style={{ ...glassDeep({ padding: 16 }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.textFaint, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Alertas
          </div>
          {demoradas === 0 && listas.length === 0 ? (
            <div style={{ fontSize: 12, color: G.textFaint, textAlign: 'center', padding: '20px 0' }}>
              Sin alertas activas
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activas.filter(c => minutesSince(c.opened_at) >= 15).map(c => (
                <div key={c.id} style={{ padding: '8px 10px', borderRadius: 8, background: '#DBEAFE', border: '1px solid #93C5FD', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#1E40AF' }}>Mesa {c.mesa_num} demorada</div>
                  <div style={{ color: '#3B82F6', marginTop: 2 }}>{fmtMin(minutesSince(c.opened_at))} en preparación</div>
                </div>
              ))}
              {activas.filter(c => minutesSince(c.opened_at) >= 8 && minutesSince(c.opened_at) < 15).map(c => (
                <div key={c.id} style={{ padding: '8px 10px', borderRadius: 8, background: '#FEF3C7', border: '1px solid #FDE68A', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#92400E' }}>Mesa {c.mesa_num}</div>
                  <div style={{ color: '#B45309', marginTop: 2 }}>{fmtMin(minutesSince(c.opened_at))} — atención</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel central: Comandas listas */}
        <div style={{ ...glassDeep({ padding: 16 }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.textFaint, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Comandas listas para entregar
          </div>
          {listas.length === 0 ? (
            <div style={{ fontSize: 13, color: G.textFaint, textAlign: 'center', padding: '30px 0' }}>
              No hay comandas listas en este momento
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {listas.map(c => (
                <div key={c.id} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: '#FEE2E2', border: '1.5px solid #FCA5A5',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#991B1B', fontFamily: fontDisplay }}>Mesa {c.mesa_num}</div>
                    <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 2 }}>
                      {c.items.length} ítem{c.items.length !== 1 ? 's' : ''} · lista hace {fmtMin(minutesSince(c.opened_at))}
                    </div>
                  </div>
                  <button
                    onClick={() => marcarEntregada(c.id)}
                    style={{
                      padding: '8px 16px', border: 'none', borderRadius: 8,
                      background: '#1D9E75', color: 'white', fontSize: 12,
                      fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Marcar entregado
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel derecho: Tiempo promedio */}
        <div style={{ ...glassDeep({ padding: 16 }), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.textFaint, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Tiempo promedio
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, color: promedioPrep !== null ? G.teal : G.textFaint, fontFamily: fontDisplay, lineHeight: 1 }}>
            {promedioPrep !== null ? `${promedioPrep}m` : '—'}
          </div>
          <div style={{ fontSize: 11, color: G.textFaint, marginTop: 8, textAlign: 'center' }}>
            {promedioPrep !== null
              ? `Calculado de ${prepTimesRef.current.length} entregas`
              : 'Se calcula cada 5 entregas completadas'
            }
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ccpulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  );
}

// ── KPI mini badge ─────────────────────────────────────────────────────

function KPI({ label, value, color }) {
  return (
    <div style={{
      padding: '6px 14px', borderRadius: 10,
      background: `${color}12`, border: `1px solid ${color}33`,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontSize: 18, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
    </div>
  );
}
