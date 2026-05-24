// src/pages/Delivery.jsx
// Módulo de delivery — pedidos manuales sin API externa.
// Los pedidos aparecen como "mesa virtual" en el sistema y en CocinaDisplay.

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { money } from '@/lib/fmt';
import { G } from '@/lib/glass';
import { subscribeToTurns } from '@/lib/realtimeManager';
import { useAuth } from '@/lib/AuthContext';
import useUserRole from '@/lib/useUserRole';
import { getActiveStaff, touchActiveStaff } from '@/lib/useActiveStaff';

// ── Constantes ─────────────────────────────────────────────────────────────────
const ESTADOS = [
  { key:'preparando',  label:'Preparando',  color:'#EF9F27', bg:'rgba(239,159,39,0.10)',  icon:'🍳' },
  { key:'listo',       label:'Listo',        color:'#7F77DD', bg:'rgba(127,119,221,0.10)', icon:'✓' },
  { key:'en_camino',   label:'En camino',    color:'#378ADD', bg:'rgba(55,138,221,0.10)',  icon:'🛵' },
  { key:'entregado',   label:'Entregado',    color:'#1D9E75', bg:'rgba(29,158,117,0.10)',  icon:'✅' },
];
const PLATAFORMAS = ['Manual', 'WhatsApp', 'PedidosYa', 'Rappi', 'Mercado Envíos'];

// ── Helpers ────────────────────────────────────────────────────────────────────
function elapsed(openedAt) {
  const ms = Date.now() - new Date(openedAt).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function BadgeEstado({ estado }) {
  const e = ESTADOS.find(s => s.key === estado) || ESTADOS[0];
  return (
    <span style={{
      background: e.bg, color: e.color, border: `1px solid ${e.color}33`,
      borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700,
    }}>
      {e.icon} {e.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function Delivery() {
  const store      = useStore();
  const { addToast } = useToast();
  const { user } = useAuth();
  const userRole = useUserRole();
  const branchId   = store.branchId !== 'todas' ? store.branchId : (store.sucursales?.[0]?.id || '');

  const [pedidos,     setPedidos]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showNew,     setShowNew]     = useState(false);
  const [filterEstado, setFilterEstado] = useState('activos'); // 'activos' | key de estado | 'todos'
  const rtRef = useRef(null);

  // ── Cargar pedidos de delivery ───────────────────────────────────────────
  async function loadPedidos() {
    if (!branchId) { setPedidos([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from('turns')
      .select('id, mesa_num, status, opened_at, closed_at, total_facturado, mozo, delivery_estado, delivery_data, turn_items(id, menu_item_name, cantidad, precio, notas)')
      .eq('branch_id', branchId)
      .eq('tipo', 'delivery')
      .in('status', filterEstado === 'todos' ? ['abierta','cerrada'] : ['abierta'])
      .order('opened_at', { ascending: false })
      .limit(100);
    if (!error) setPedidos(data || []);
    setLoading(false);
  }

  useEffect(() => { loadPedidos(); }, [branchId, filterEstado]);

  // ── Realtime ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!branchId) return;
    if (rtRef.current) rtRef.current();
    rtRef.current = subscribeToTurns(branchId, () => loadPedidos());
    return () => { if (rtRef.current) rtRef.current(); };
  }, [branchId]);

  // ── Cambiar estado ────────────────────────────────────────────────────────
  async function cambiarEstado(pedidoId, nuevoEstado) {
    const updates = { delivery_estado: nuevoEstado };
    if (nuevoEstado === 'entregado') {
      updates.status       = 'cerrada';
      updates.closed_at    = new Date().toISOString();
      updates.total_facturado = pedidos.find(p => p.id === pedidoId)
        ?.turn_items?.reduce((s, i) => s + i.precio * i.cantidad, 0) || 0;
    }
    // Optimistic update
    setPedidos(prev => prev.map(p =>
      p.id === pedidoId
        ? { ...p, delivery_estado: nuevoEstado, status: nuevoEstado === 'entregado' ? 'cerrada' : p.status }
        : p
    ));
    const { error } = await supabase.from('turns').update(updates).eq('id', pedidoId);
    if (error) { addToast('Error al actualizar estado', 'error'); loadPedidos(); }
    else if (nuevoEstado === 'entregado') {
      const pedido = pedidos.find(p => p.id === pedidoId);
      const total = pedido?.turn_items?.reduce((s, i) => s + i.precio * i.cantidad, 0) || 0;
      store.logAccion({
        usuario: getActiveStaff()?.nombre || user?.email || 'Sistema',
        rol: userRole,
        categoria: 'Delivery',
        accion: 'Pedido entregado',
        detalle: (pedido?.mesa_num || pedidoId) + ' · ' + money(total),
        sucursal: store.sucursales.find(s => s.id === branchId)?.nombre || '',
      });
      touchActiveStaff();
      addToast('Pedido entregado ✓', 'success');
    }
  }

  // ── Asignar repartidor ────────────────────────────────────────────────────
  async function asignarRepartidor(pedidoId, repartidor) {
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const newData = { ...(pedido.delivery_data || {}), repartidor };
    setPedidos(prev => prev.map(p =>
      p.id === pedidoId ? { ...p, delivery_data: newData } : p
    ));
    await supabase.from('turns').update({ delivery_data: newData }).eq('id', pedidoId);
  }

  // ── Filtrar pedidos ───────────────────────────────────────────────────────
  const pedidosFiltrados = filterEstado === 'activos'
    ? pedidos.filter(p => p.status === 'abierta')
    : filterEstado === 'todos'
    ? pedidos
    : pedidos.filter(p => p.delivery_estado === filterEstado);

  // ── KPIs rápidos ──────────────────────────────────────────────────────────
  const enCurso    = pedidos.filter(p => p.status === 'abierta').length;
  const entregados = pedidos.filter(p => p.delivery_estado === 'entregado').length;
  const totalHoy   = pedidos
    .filter(p => p.delivery_estado === 'entregado')
    .reduce((s, p) => s + (p.total_facturado || p.turn_items?.reduce((a, i) => a + i.precio * i.cantidad, 0) || 0), 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, fontFamily:"'DM Sans', system-ui, sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:G.text, margin:0, letterSpacing:'-0.02em' }}>
            🛵 Delivery
          </h1>
          <div style={{ fontSize:12, color:G.textFaint, marginTop:3 }}>
            Pedidos manuales y de plataformas
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ padding:'9px 18px', background:'#1D9E75', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(29,158,117,0.28)' }}
        >
          + Nuevo pedido
        </button>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {[
          { label:'En curso',     value:enCurso,                 color:'#EF9F27' },
          { label:'Entregados hoy', value:entregados,            color:'#1D9E75' },
          { label:'Facturado hoy',  value:money(totalHoy),       color:'#378ADD' },
        ].map(k => (
          <div key={k.label} style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:12, padding:'12px 16px', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize:10, fontWeight:700, color:G.textFaint, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:24, fontWeight:800, color:k.color, letterSpacing:'-0.02em' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {[
          { key:'activos',  label:'Activos' },
          ...ESTADOS.map(e => ({ key:e.key, label:e.label })),
          { key:'todos',    label:'Todos (hoy)' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilterEstado(f.key)}
            style={{
              padding:'6px 14px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .12s',
              background: filterEstado === f.key ? '#1D9E75' : '#FFFFFF',
              color:       filterEstado === f.key ? 'white'   : G.textMuted,
              border:      filterEstado === f.key ? 'none'    : '1px solid #E2E8F0',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Lista de pedidos ────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:G.textFaint, fontSize:13 }}>Cargando pedidos…</div>
      ) : pedidosFiltrados.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:14 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🛵</div>
          <div style={{ fontSize:15, fontWeight:600, color:G.text, marginBottom:4 }}>Sin pedidos activos</div>
          <div style={{ fontSize:13, color:G.textFaint }}>Cliqueá "Nuevo pedido" para registrar un pedido de delivery.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {pedidosFiltrados.map(p => (
            <PedidoCard
              key={p.id}
              pedido={p}
              teamMembers={store.teamMembers || []}
              onCambiarEstado={cambiarEstado}
              onAsignarRepartidor={asignarRepartidor}
            />
          ))}
        </div>
      )}

      {/* ── Modal nuevo pedido ──────────────────────────────────────────── */}
      {showNew && (
        <NuevoPedidoModal
          branchId={branchId}
          store={store}
          addToast={addToast}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); loadPedidos(); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PedidoCard
// ══════════════════════════════════════════════════════════════════════════════
function PedidoCard({ pedido, teamMembers, onCambiarEstado, onAsignarRepartidor }) {
  const [editRepartidor, setEditRepartidor] = useState(false);
  const [repartidorDraft, setRepartidorDraft] = useState(pedido.delivery_data?.repartidor || '');

  const data     = pedido.delivery_data || {};
  const items    = pedido.turn_items   || [];
  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const estadoActual = ESTADOS.find(e => e.key === pedido.delivery_estado) || ESTADOS[0];

  // Siguiente estado lógico
  const nextEstado = ESTADOS[ESTADOS.indexOf(estadoActual) + 1];

  function handleAsignar() {
    onAsignarRepartidor(pedido.id, repartidorDraft.trim());
    setEditRepartidor(false);
  }

  return (
    <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:14, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
      {/* ── Header del pedido ── */}
      <div style={{ padding:'12px 16px', background: estadoActual.bg, display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #E2E8F0' }}>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:15, fontWeight:800, color:estadoActual.color }}>
            {pedido.mesa_num}
          </span>
          {data.plataforma && (
            <span style={{ fontSize:11, background:'rgba(0,0,0,0.07)', borderRadius:99, padding:'2px 8px', fontWeight:600, color:G.textMid }}>
              {data.plataforma}
            </span>
          )}
          <BadgeEstado estado={pedido.delivery_estado} />
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <span style={{ fontSize:11, color:G.textFaint }}>⏱ {elapsed(pedido.opened_at)}</span>
          <span style={{ fontSize:14, fontWeight:800, color:estadoActual.color }}>{money(subtotal)}</span>
        </div>
      </div>

      {/* ── Cuerpo: info + items ── */}
      <div style={{ padding:'12px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {/* Info del cliente */}
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {data.telefono && (
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={G.textFaint} strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <a href={`tel:${data.telefono}`} style={{ fontSize:13, color:'#378ADD', fontWeight:600, textDecoration:'none' }}>{data.telefono}</a>
            </div>
          )}
          {data.direccion && (
            <div style={{ display:'flex', gap:6, alignItems:'flex-start' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={G.textFaint} strokeWidth="2" style={{ flexShrink:0, marginTop:2 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span style={{ fontSize:12, color:G.textMid, lineHeight:'16px' }}>{data.direccion}</span>
            </div>
          )}
          {data.nota_interna && (
            <div style={{ fontSize:11, color:'#92400E', background:'#FEF9C3', borderRadius:6, padding:'3px 8px', lineHeight:'16px' }}>
              📝 {data.nota_interna}
            </div>
          )}
        </div>

        {/* Items del pedido */}
        <div>
          {items.length === 0
            ? <div style={{ fontSize:12, color:G.textFaint }}>Sin ítems registrados</div>
            : items.map(i => (
              <div key={i.id} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'2px 0', color:G.textMid }}>
                <span>{i.menu_item_name} × {i.cantidad}{i.notas ? ` (${i.notas})` : ''}</span>
                <span style={{ color:G.text, fontWeight:600 }}>{money(i.precio * i.cantidad)}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* ── Footer: repartidor + acciones ── */}
      <div style={{ padding:'10px 16px', borderTop:'1px solid #F1F5F9', display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', justifyContent:'space-between' }}>
        {/* Repartidor */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {editRepartidor ? (
            <>
              <input
                autoFocus
                value={repartidorDraft}
                onChange={e => setRepartidorDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAsignar(); if (e.key === 'Escape') setEditRepartidor(false); }}
                placeholder="Nombre del repartidor"
                style={{ padding:'4px 8px', border:'1px solid #E2E8F0', borderRadius:7, fontSize:12, outline:'none', width:160 }}
              />
              <button onClick={handleAsignar} style={{ padding:'4px 10px', background:'#1D9E75', color:'white', border:'none', borderRadius:7, fontSize:12, cursor:'pointer' }}>OK</button>
              <button onClick={() => setEditRepartidor(false)} style={{ padding:'4px 8px', background:'none', border:'1px solid #E2E8F0', borderRadius:7, fontSize:12, cursor:'pointer', color:G.textFaint }}>✕</button>
            </>
          ) : (
            <button
              onClick={() => setEditRepartidor(true)}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:7, fontSize:12, color:data.repartidor ? G.textMid : G.textFaint, cursor:'pointer' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              {data.repartidor || 'Asignar repartidor'}
            </button>
          )}
        </div>

        {/* Botones de avance de estado */}
        {pedido.status !== 'cerrada' && (
          <div style={{ display:'flex', gap:6 }}>
            {nextEstado && (
              <button
                onClick={() => onCambiarEstado(pedido.id, nextEstado.key)}
                style={{ padding:'6px 14px', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                  background: nextEstado.color, color:'white', boxShadow:`0 2px 6px ${nextEstado.color}44` }}
              >
                {nextEstado.icon} {nextEstado.label}
              </button>
            )}
          </div>
        )}
        {pedido.status === 'cerrada' && (
          <span style={{ fontSize:11, color:'#1D9E75', fontWeight:700 }}>✅ Entregado</span>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NuevoPedidoModal
// ══════════════════════════════════════════════════════════════════════════════
function NuevoPedidoModal({ branchId, store, addToast, onClose, onCreated }) {
  const [form, setForm] = useState({
    plataforma: 'Manual',
    telefono:   '',
    direccion:  '',
    nota:       '',
  });
  const [selectedItems, setSelectedItems] = useState([]); // [{item, qty}]
  const [saving, setSaving] = useState(false);

  const menuItems = (store.menuItems?.[branchId] || []).filter(i => i.disponible);

  function addItem(item) {
    setSelectedItems(prev => {
      const existing = prev.find(si => si.item.id === item.id);
      if (existing) return prev.map(si => si.item.id === item.id ? { ...si, qty: si.qty + 1 } : si);
      return [...prev, { item, qty: 1 }];
    });
  }

  function removeItem(itemId) {
    setSelectedItems(prev => {
      const existing = prev.find(si => si.item.id === itemId);
      if (!existing || existing.qty <= 1) return prev.filter(si => si.item.id !== itemId);
      return prev.map(si => si.item.id === itemId ? { ...si, qty: si.qty - 1 } : si);
    });
  }

  const subtotal = selectedItems.reduce((s, si) => s + si.item.precio * si.qty, 0);

  async function handleCreate() {
    if (!branchId) { addToast('Seleccioná una sucursal primero', 'error'); return; }
    // Número único: 4 dígitos aleatorios — evita colisiones por timestamp truncado
    const numPedido = (1000 + Math.floor(Math.random() * 9000)).toString();
    const mozoNombre = getActiveStaff()?.nombre || '';
    setSaving(true);
    try {
      // 1. Crear turn de delivery
      const { data: turn, error: turnErr } = await supabase
        .from('turns')
        .insert({
          branch_id:        branchId,
          mesa_num:         `DEL-${numPedido}`,
          status:           'abierta',
          tipo:             'delivery',
          delivery_estado:  'preparando',
          delivery_data:    {
            plataforma:   form.plataforma,
            telefono:     form.telefono.trim() || null,
            direccion:    form.direccion.trim() || null,
            nota_interna: form.nota.trim() || null,
            repartidor:   null,
          },
          opened_at:        new Date().toISOString(),
          total_facturado:  0,
          mozo:             mozoNombre,
          caja_shift_id:    store.turnoActivo?.id || null,
        })
        .select()
        .single();
      if (turnErr) throw turnErr;

      // 2. Crear ítems del pedido
      if (selectedItems.length > 0) {
        const { error: itemsErr } = await supabase.from('turn_items').insert(
          selectedItems.map(si => ({
            turn_id:        turn.id,
            branch_id:      branchId,
            menu_item_id:   si.item.id,
            menu_item_name: si.item.nombre,
            cantidad:       si.qty,
            precio:         si.item.precio,
            notas:          '',
          }))
        );
        if (itemsErr) throw itemsErr;
      }

      store.logAccion({
        usuario: mozoNombre || 'Sistema',
        rol: '',
        categoria: 'Delivery',
        accion: 'Pedido creado',
        detalle: `DEL-${numPedido} · ${form.plataforma} · ${money(subtotal)}`,
        sucursal: store.sucursales.find(s => s.id === branchId)?.nombre || '',
      });
      touchActiveStaff();
      addToast(`Pedido DEL-${numPedido} creado — en cocina`, 'success');
      onCreated();
    } catch (err) {
      addToast('Error al crear el pedido: ' + (err.message || 'revisar conexión'), 'error');
    }
    setSaving(false);
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(15,15,35,0.45)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'16px 8px', overflow:'auto' }}
      onClick={onClose}>
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:18, width:520, maxWidth:'95vw', boxShadow:'0 24px 64px rgba(0,0,0,0.18)', fontFamily:"'DM Sans', system-ui, sans-serif" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid #E2E8F0' }}>
          <span style={{ fontSize:16, fontWeight:700, color:G.text }}>🛵 Nuevo pedido de delivery</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:G.textFaint }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:16, maxHeight:'75vh', overflowY:'auto', WebkitOverflowScrolling:'touch' }}>

          {/* Plataforma */}
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:G.textMuted, marginBottom:6 }}>Plataforma</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {PLATAFORMAS.map(p => (
                <button key={p} onClick={() => setForm(f => ({ ...f, plataforma: p }))}
                  style={{ padding:'5px 14px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer',
                    background: form.plataforma === p ? '#1D9E75' : '#F8FAFC',
                    color:      form.plataforma === p ? 'white'   : G.textMid,
                    border:     form.plataforma === p ? 'none'    : '1px solid #E2E8F0',
                  }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Datos del cliente */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[
              { k:'telefono',  label:'Teléfono', placeholder:'11 1234-5678', type:'tel' },
              { k:'direccion', label:'Dirección', placeholder:'Av. Corrientes 1234, CABA', type:'text' },
            ].map(f => (
              <div key={f.k}>
                <div style={{ fontSize:12, fontWeight:600, color:G.textMuted, marginBottom:4 }}>{f.label}</div>
                <input
                  type={f.type}
                  value={form[f.k]}
                  onChange={e => setForm(prev => ({ ...prev, [f.k]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width:'100%', padding:'8px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' }}
                />
              </div>
            ))}
          </div>

          {/* Nota interna */}
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:G.textMuted, marginBottom:4 }}>Nota interna</div>
            <textarea
              value={form.nota}
              onChange={e => setForm(f => ({ ...f, nota: e.target.value }))}
              placeholder="Instrucciones especiales, referencias, etc."
              rows={2}
              style={{ width:'100%', padding:'8px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', resize:'none', boxSizing:'border-box', fontFamily:'inherit' }}
            />
          </div>

          {/* Selector de ítems */}
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:G.textMuted, marginBottom:8 }}>Ítems del pedido</div>
            {/* Items seleccionados */}
            {selectedItems.length > 0 && (
              <div style={{ background:'#F0FBF7', border:'1px solid #A7F3D0', borderRadius:10, padding:'10px 12px', marginBottom:10 }}>
                {selectedItems.map(si => (
                  <div key={si.item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0' }}>
                    <span style={{ fontSize:13, color:G.text }}>{si.item.nombre} <strong>× {si.qty}</strong></span>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <span style={{ fontSize:12, color:'#1D9E75', fontWeight:700 }}>{money(si.item.precio * si.qty)}</span>
                      <button onClick={() => removeItem(si.item.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#EF4444', fontSize:16, lineHeight:1, padding:'0 2px' }}>−</button>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop:'1px solid #A7F3D0', paddingTop:8, marginTop:6, display:'flex', justifyContent:'space-between', fontWeight:800, fontSize:14, color:'#065F46' }}>
                  <span>Total</span><span>{money(subtotal)}</span>
                </div>
              </div>
            )}

            {/* Catálogo de menú */}
            {menuItems.length === 0 ? (
              <div style={{ fontSize:12, color:G.textFaint, textAlign:'center', padding:'12px 0' }}>
                No hay ítems en el menú de esta sucursal.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:2, maxHeight:220, overflowY:'auto' }}>
                {menuItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addItem(item)}
                    style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', background:'#FAFAFA', border:'1px solid #E2E8F0', borderRadius:8, cursor:'pointer', textAlign:'left', fontSize:13 }}
                    onMouseEnter={e => { e.currentTarget.style.background='#F0FBF7'; }}
                    onMouseLeave={e => { e.currentTarget.style.background='#FAFAFA'; }}
                  >
                    <span style={{ color:G.text }}>{item.nombre}</span>
                    <span style={{ color:'#1D9E75', fontWeight:700 }}>{money(item.precio)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Botones footer */}
        <div style={{ padding:'14px 20px', borderTop:'1px solid #E2E8F0', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:'9px 0', border:'1px solid #E2E8F0', borderRadius:10, fontSize:13, background:'#FFF', color:G.textMid, cursor:'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || selectedItems.length === 0}
            style={{ flex:2, padding:'9px 0', border:'none', borderRadius:10, fontSize:13, fontWeight:700, color:'white',
              background: saving || selectedItems.length === 0 ? G.textFaint : '#1D9E75',
              cursor: saving || selectedItems.length === 0 ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Creando…' : `Crear pedido DEL-${numPedido}`}
          </button>
        </div>
      </div>
    </div>
  );
}
