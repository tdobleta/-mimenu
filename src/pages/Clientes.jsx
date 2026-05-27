// src/pages/Clientes.jsx
// Módulo CRM: directorio de clientes, ranking, cumpleaños y Email marketing.

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { money } from '@/lib/fmt';
import { supabase } from '@/api/supabaseClient';
import {
  getAllCustomers, getTopCustomers, getCustomersBirthdays,
  createCustomer, updateCustomer, deleteCustomer,
  PESOS_POR_PUNTO_CONST,
} from '@/lib/crmApi';

const FONT = "'DM Sans', system-ui, sans-serif";
const TEAL = '#1D9E75';
const TEAL_BG = 'rgba(29,158,117,0.08)';

const TABS = ['Directorio', 'Top clientes', 'Cumpleaños', 'Marketing'];

function downloadCSV(filename, headers, rows) {
  const content = '﻿' + [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const BtnCSV = ({ onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 13px', border:'1px solid #E2E8F0', borderRadius:9, fontSize:12, color:'#374151', background:'#F8FAFC', cursor:disabled?'default':'pointer', opacity:disabled?0.45:1, whiteSpace:'nowrap' }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Exportar CSV
  </button>
);

// ─── Customer Form Modal ─────────────────────────────────────────────────────
function CustomerModal({ customer, restaurantId, onSave, onClose }) {
  const isNew = !customer?.id;
  const [form, setForm] = useState({
    nombre:    customer?.nombre    || '',
    telefono:  customer?.telefono  || '',
    email:     customer?.email     || '',
    notas:     customer?.notas     || '',
    nacimiento:customer?.nacimiento|| '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError('');
    try {
      let result;
      if (isNew) {
        result = await createCustomer(restaurantId, form);
      } else {
        result = await updateCustomer(customer.id, form);
      }
      onSave(result, isNew);
    } catch (e) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const field = (label, key, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
        {label}
      </div>
      <input
        type={type}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box', fontFamily: FONT }}
      />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: '#FFF', borderRadius: 16, padding: '20px 22px', width: '100%', maxWidth: 'min(420px, 95vw)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', fontFamily: FONT }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
            {isNew ? 'Nuevo cliente' : 'Editar cliente'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {field('Nombre *', 'nombre', 'text', 'Juan García')}
        {field('Teléfono / WhatsApp', 'telefono', 'tel', '+54 9 11 1234-5678')}
        {field('Email', 'email', 'email', 'juan@email.com')}
        {field('Fecha de nacimiento', 'nacimiento', 'date')}

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Notas internas</div>
          <textarea
            value={form.notas}
            onChange={e => set('notas', e.target.value)}
            placeholder="Prefiere mesa cerca de la ventana..."
            rows={2}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: FONT }}
          />
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px 0', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, color: '#374151', background: '#FFF', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, padding: '9px 0', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#FFF', background: TEAL, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando...' : isNew ? 'Crear cliente' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Puntos badge ────────────────────────────────────────────────────────────
function PuntosBadge({ puntos }) {
  if (!puntos) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: TEAL_BG, color: TEAL, padding: '2px 7px', borderRadius: 99 }}>
      {puntos} pts
    </span>
  );
}

// ─── Tab 1: Directorio ───────────────────────────────────────────────────────
function TabDirectorio({ restaurantId }) {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | {customer}
  const [deleting, setDeleting] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getAllCustomers(restaurantId);
    setCustomers(data);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter(c => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (c.nombre || '').toLowerCase().includes(t)
      || (c.telefono || '').includes(t)
      || (c.email || '').toLowerCase().includes(t);
  });

  function handleSave(result, isNew) {
    if (isNew) {
      setCustomers(p => [result, ...p].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } else {
      setCustomers(p => p.map(c => c.id === result.id ? result : c));
    }
    setModal(null);
  }

  async function handleDelete(c) {
    if (!window.confirm(`¿Eliminar a ${c.nombre}? Se perderá su historial de visitas.`)) return;
    setDeleting(c.id);
    try {
      await deleteCustomer(restaurantId, c.id, 'Archivado desde directorio CRM');
      setCustomers(p => p.filter(x => x.id !== c.id));
    } catch { /* ignore */ }
    setDeleting(null);
  }

  function fmtFecha(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email..."
            style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: FONT }}
          />
        </div>
        <BtnCSV
          disabled={customers.length === 0}
          onClick={() => downloadCSV('clientes.csv',
            ['Nombre', 'Teléfono', 'Email', 'Nacimiento', 'Notas', 'Puntos'],
            customers.map(c => [c.nombre, c.telefono || '', c.email || '', c.nacimiento || '', c.notas || '', c.puntos || 0])
          )} />
        <button
          onClick={() => setModal('new')}
          style={{ padding: '8px 16px', background: TEAL, color: '#FFF', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo cliente
        </button>
      </div>

      {/* Stats chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '3px 10px', borderRadius: 6 }}>
          {customers.length} clientes
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: TEAL, background: TEAL_BG, padding: '3px 10px', borderRadius: 6 }}>
          {customers.filter(c => c.puntos > 0).length} con puntos
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 13 }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" style={{ margin: '0 auto 12px', display: 'block' }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <div style={{ fontSize: 14, color: '#6B7280', fontWeight: 500 }}>
            {q ? 'Sin resultados para esa búsqueda' : 'Aún no hay clientes registrados'}
          </div>
          {!q && (
            <button onClick={() => setModal('new')}
              style={{ marginTop: 12, padding: '8px 18px', background: TEAL, color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Agregar primer cliente
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(c => {
            const isExp = expanded === c.id;
            return (
              <div key={c.id} style={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                {/* Row */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }}
                  onClick={() => setExpanded(isExp ? null : c.id)}>
                  {/* Avatar */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: TEAL_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: TEAL, flexShrink: 0 }}>
                    {c.nombre.charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.nombre}</span>
                      <PuntosBadge puntos={c.puntos} />
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                      {[c.telefono, c.email].filter(Boolean).join(' · ') || 'Sin contacto'}
                    </div>
                  </div>
                  {/* Chevron */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ flexShrink: 0, transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div style={{ borderTop: '1px solid #F1F5F9', padding: '10px 14px', background: '#FAFAFA' }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontSize: 12, color: '#374151' }}>
                      {c.telefono && <span>📞 {c.telefono}</span>}
                      {c.email && <span>✉️ {c.email}</span>}
                      {c.nacimiento && <span>🎂 {fmtFecha(c.nacimiento)}</span>}
                      {c.puntos > 0 && <span style={{ color: TEAL, fontWeight: 600 }}>★ {c.puntos} puntos = {money(c.puntos)} de descuento</span>}
                    </div>
                    {c.notas && <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10, fontStyle: 'italic' }}>"{c.notas}"</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setModal(c)}
                        style={{ padding: '6px 14px', background: '#EFF6FF', color: '#3B82F6', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Editar
                      </button>
                      <button onClick={() => handleDelete(c)} disabled={deleting === c.id}
                        style={{ padding: '6px 14px', background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: deleting === c.id ? 0.5 : 1 }}>
                        {deleting === c.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {modal && (
        <CustomerModal
          customer={modal === 'new' ? null : modal}
          restaurantId={restaurantId}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ─── Tab 2: Top clientes ─────────────────────────────────────────────────────
function TabTopClientes({ restaurantId }) {
  const [top, setTop] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopCustomers(restaurantId)
      .then(setTop)
      .finally(() => setLoading(false));
  }, [restaurantId]);

  const maxGastado = top[0]?.totalGastado || 1;

  function fmtFecha(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 13 }}>Cargando...</div>;

  if (top.length === 0) return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: '#6B7280', fontSize: 13 }}>
      Aún no hay clientes con visitas registradas.
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#64748B' }}>Top {top.length} clientes por total gastado</div>
        <BtnCSV onClick={() => downloadCSV('top-clientes.csv',
          ['Rank', 'Nombre', 'Visitas', 'Ultima visita', 'Total gastado'],
          top.map((c, i) => [i + 1, c.nombre, c.visitas, c.ultimaVisita || '', c.totalGastado])
        )} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top.map((c, idx) => {
          const pct = Math.round((c.totalGastado / maxGastado) * 100);
          const isMVP = idx === 0;
          return (
            <div key={c.id} style={{ background: '#FFF', border: `1px solid ${isMVP ? 'rgba(29,158,117,0.25)' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {/* Rank */}
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: isMVP ? TEAL_BG : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: isMVP ? TEAL : '#64748B', flexShrink: 0 }}>
                  {idx + 1}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.nombre}</span>
                    {isMVP && <span style={{ fontSize: 9, fontWeight: 700, color: TEAL, background: TEAL_BG, border: '1px solid rgba(29,158,117,0.2)', borderRadius: 4, padding: '1px 5px' }}>MVP</span>}
                    <PuntosBadge puntos={c.puntos} />
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>
                    {c.visitas} visit{c.visitas !== 1 ? 'as' : 'a'} · última: {fmtFecha(c.ultimaVisita)}
                  </div>
                </div>
                {/* Total */}
                <div style={{ fontSize: 14, fontWeight: 800, color: isMVP ? TEAL : '#0F172A', fontFamily: FONT, letterSpacing: '-0.02em' }}>
                  {money(c.totalGastado)}
                </div>
              </div>
              {/* Barra progreso */}
              <div style={{ height: 3, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: isMVP ? TEAL : '#CBD5E1', borderRadius: 99, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helper: invocar crm-email edge function ─────────────────────────────────
async function sendCrmEmail({ type, to, customerName, restaurantName, puntos = 0, visitas = 0, descuento = '10%' }) {
  const { error } = await supabase.functions.invoke('crm-email', {
    body: { type, to, customerName, restaurantName, puntos, visitas, descuento },
  });
  if (error) throw new Error(error.message || 'Error al enviar email');
}

// ─── Tab 3: Cumpleaños ───────────────────────────────────────────────────────
function TabCumpleanos({ restaurantId }) {
  const store = useStore();
  const [bdayers, setBdayers] = useState([]);
  const [loading, setLoading] = useState(true);
  // Map de customerId → estado del email: 'idle' | 'sending' | 'sent' | 'error'
  const [emailState, setEmailState] = useState({});

  useEffect(() => {
    getCustomersBirthdays(restaurantId, 30)  // próximos 30 días
      .then(setBdayers)
      .finally(() => setLoading(false));
  }, [restaurantId]);

  function fmtNacimiento(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  }

  async function handleSendBirthday(c) {
    if (!c.email || emailState[c.id] === 'sending' || emailState[c.id] === 'sent') return;
    setEmailState(prev => ({ ...prev, [c.id]: 'sending' }));
    try {
      await sendCrmEmail({
        type: 'birthday',
        to: c.email,
        customerName: c.nombre,
        restaurantName: store.restaurante?.nombre || 'el restaurante',
        puntos: c.puntos || 0,
        descuento: '10%',
      });
      setEmailState(prev => ({ ...prev, [c.id]: 'sent' }));
    } catch {
      setEmailState(prev => ({ ...prev, [c.id]: 'error' }));
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 13 }}>Cargando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#64748B' }}>Clientes con cumpleaños en los próximos 30 días</div>
        <BtnCSV
          disabled={bdayers.length === 0}
          onClick={() => downloadCSV('cumpleanos.csv',
            ['Nombre', 'Teléfono', 'Email', 'Nacimiento', 'Días'],
            bdayers.map(c => [c.nombre, c.telefono || '', c.email || '', c.nacimiento || '', c._diasParaCumple ?? ''])
          )} />
      </div>

      {bdayers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎂</div>
          <div style={{ fontSize: 14, color: '#6B7280', fontWeight: 500 }}>Sin cumpleaños próximos</div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
            Agregá las fechas de nacimiento en el Directorio para ver los recordatorios aquí.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bdayers.map(c => {
            const dias = c._diasParaCumple;
            const esHoy = dias === 0;
            const esMañana = dias === 1;
            const label = esHoy ? '¡Hoy!' : esMañana ? 'Mañana' : `En ${dias} días`;
            const labelColor = esHoy ? '#EF4444' : esMañana ? '#F59E0B' : '#64748B';
            const labelBg = esHoy ? '#FEE2E2' : esMañana ? '#FEF3C7' : '#F1F5F9';
            const es = emailState[c.id] || 'idle';

            return (
              <div key={c.id} style={{ background: '#FFF', border: `1px solid ${esHoy ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>🎂</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.nombre}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>
                    {fmtNacimiento(c.nacimiento)}
                    {c.telefono ? ` · ${c.telefono}` : ''}
                    {c.email ? ` · ${c.email}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: labelColor, background: labelBg, padding: '2px 8px', borderRadius: 6 }}>
                    {label}
                  </span>
                  {c.puntos > 0 && <PuntosBadge puntos={c.puntos} />}
                  {/* Botón email cumpleaños — solo si el cliente tiene email */}
                  {c.email && (
                    <button
                      onClick={() => handleSendBirthday(c)}
                      disabled={es === 'sending' || es === 'sent'}
                      style={{
                        padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: es === 'sent' ? 'default' : 'pointer', border: 'none',
                        background: es === 'sent' ? 'rgba(29,158,117,0.12)' : es === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(29,158,117,0.10)',
                        color: es === 'sent' ? TEAL : es === 'error' ? '#EF4444' : TEAL,
                        opacity: es === 'sending' ? 0.6 : 1,
                        whiteSpace: 'nowrap',
                      }}>
                      {es === 'sending' ? '⏳ Enviando...' : es === 'sent' ? '✓ Email enviado' : es === 'error' ? '✗ Error' : '✉ Email cumpleaños'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16, padding: '10px 14px', background: '#F0FDF4', border: '1px solid rgba(29,158,117,0.25)', borderRadius: 8 }}>
        <div style={{ fontSize: 12, color: '#064E3B' }}>
          ✉️ <strong>Emails automáticos activos:</strong> los clientes con email registrado reciben un saludo de cumpleaños con 10% de descuento. Usá el botón de cada cliente para enviar ahora.
        </div>
      </div>
    </div>
  );
}

// ─── Tab 4: Marketing ────────────────────────────────────────────────────────
function TabMarketing({ restaurantId }) {
  const store = useStore();
  const [customers, setCustomers] = useState([]);
  const [loadingC, setLoadingC] = useState(false);
  // Map de customerId → 'idle' | 'sending' | 'sent' | 'error'
  const [ptState, setPtState] = useState({});
  const [blastState, setBlastState] = useState('idle'); // 'idle' | 'sending' | 'done'
  const [blastResult, setBlastResult] = useState({ sent: 0, skipped: 0 });

  // Cargar clientes con email para el blast de puntos
  async function loadCustomers() {
    setLoadingC(true);
    try {
      const all = await getAllCustomers(restaurantId, { limit: 500 });
      setCustomers(all.filter(c => c.email && c.puntos > 0));
    } finally { setLoadingC(false); }
  }

  useEffect(() => { loadCustomers(); }, [restaurantId]);

  async function handleSendPoints(c) {
    if (ptState[c.id] === 'sending' || ptState[c.id] === 'sent') return;
    setPtState(prev => ({ ...prev, [c.id]: 'sending' }));
    try {
      await sendCrmEmail({
        type: 'points_summary',
        to: c.email,
        customerName: c.nombre,
        restaurantName: store.restaurante?.nombre || 'el restaurante',
        puntos: c.puntos || 0,
        visitas: c._visitas || 0,
      });
      setPtState(prev => ({ ...prev, [c.id]: 'sent' }));
    } catch {
      setPtState(prev => ({ ...prev, [c.id]: 'error' }));
    }
  }

  async function handleBlastPoints() {
    if (blastState === 'sending' || customers.length === 0) return;
    setBlastState('sending');
    let sent = 0, skipped = 0;
    // Rate limit: 1 email cada 200ms para no saturar
    for (const c of customers) {
      if (!c.email) { skipped++; continue; }
      try {
        await sendCrmEmail({
          type: 'points_summary',
          to: c.email,
          customerName: c.nombre,
          restaurantName: store.restaurante?.nombre || 'el restaurante',
          puntos: c.puntos || 0,
        });
        sent++;
        setPtState(prev => ({ ...prev, [c.id]: 'sent' }));
      } catch {
        skipped++;
        setPtState(prev => ({ ...prev, [c.id]: 'error' }));
      }
      await new Promise(r => setTimeout(r, 200)); // rate limiting
    }
    setBlastResult({ sent, skipped });
    setBlastState('done');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Email CRM — ACTIVO */}
      <div style={{ background: '#F0FDF4', border: '1px solid rgba(29,158,117,0.3)', borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>✉️</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#064E3B' }}>Email CRM — Activo</div>
            <div style={{ fontSize: 11, color: '#047857', marginTop: 1 }}>Usa Resend · No requiere configuración adicional</div>
          </div>
          <span style={{ marginLeft: 'auto', padding: '2px 8px', background: TEAL, color: 'white', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>✓ Disponible</span>
        </div>
        <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, marginBottom: 12 }}>
          Enviá un resumen de puntos a todos tus clientes con email registrado. Cada cliente ve su balance actual y el nivel alcanzado (Bronze/Silver/Gold).
        </div>

        {/* Blast de puntos */}
        {customers.length === 0 ? (
          <div style={{ fontSize: 12, color: '#6B7280' }}>
            {loadingC ? 'Cargando clientes...' : 'No hay clientes con email y puntos registrados aún.'}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#374151' }}>
                <strong>{customers.length}</strong> clientes con email y puntos
              </div>
              <button
                onClick={handleBlastPoints}
                disabled={blastState === 'sending' || blastState === 'done'}
                style={{
                  padding: '7px 16px', background: blastState === 'done' ? 'rgba(29,158,117,0.15)' : TEAL, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: blastState === 'done' ? TEAL : 'white', cursor: blastState !== 'idle' ? 'default' : 'pointer',
                  opacity: blastState === 'sending' ? 0.6 : 1,
                }}>
                {blastState === 'idle' && '✉ Enviar resumen de puntos a todos'}
                {blastState === 'sending' && '⏳ Enviando...'}
                {blastState === 'done' && `✓ ${blastResult.sent} enviados · ${blastResult.skipped} omitidos`}
              </button>
            </div>

            {/* Lista individual */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {customers.map(c => {
                const es = ptState[c.id] || 'idle';
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#FFF', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{c.email} · ★ {c.puntos} pts</div>
                    </div>
                    <button
                      onClick={() => handleSendPoints(c)}
                      disabled={es === 'sending' || es === 'sent'}
                      style={{
                        padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: es === 'sent' ? 'default' : 'pointer', border: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                        background: es === 'sent' ? 'rgba(29,158,117,0.12)' : es === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(29,158,117,0.10)',
                        color: es === 'sent' ? TEAL : es === 'error' ? '#EF4444' : TEAL,
                        opacity: es === 'sending' ? 0.6 : 1,
                      }}>
                      {es === 'sending' ? '⏳' : es === 'sent' ? '✓ Enviado' : es === 'error' ? '✗ Error' : '✉ Enviar'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* WhatsApp Marketing — próximamente */}
      <div style={{ padding: '14px 16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 6 }}>
          📱 WhatsApp Marketing — Próximamente
        </div>
        <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.6 }}>
          Esta función requiere un servidor <strong>Evolution API</strong> (open-source, ~$15 USD/mes en VPS 2GB RAM) conectado a tu WhatsApp Business.
          Incluye rate limiting automático (máx. 10/min) y opt-out con la palabra STOP.
        </div>
        <a
          href="mailto:soporte@mimenu.ar?subject=Quiero activar WhatsApp Marketing"
          style={{ display: 'inline-block', marginTop: 10, padding: '7px 14px', background: '#92400E', color: '#FFF', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
          Solicitar activación
        </a>
      </div>
    </div>
  );
}

// ─── Page principal ──────────────────────────────────────────────────────────
export default function Clientes() {
  const store = useStore();
  const [tab, setTab] = useState(0);

  const restaurantId = store.restaurantId;

  if (!restaurantId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: '#9CA3AF', fontSize: 13, fontFamily: FONT }}>
        Cargando...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: FONT }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
            Clientes
          </h1>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
            Fidelización y programa de puntos — {PESOS_POR_PUNTO_CONST} pesos = 1 punto
          </div>
        </div>
      </div>

      {/* Card contenedora */}
      <div style={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', padding: '0 16px' }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              style={{
                padding: '12px 14px',
                fontSize: 13, fontWeight: tab === i ? 700 : 400,
                color: tab === i ? TEAL : '#64748B',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === i ? `2px solid ${TEAL}` : '2px solid transparent',
                transition: 'all 0.15s',
                fontFamily: FONT,
                whiteSpace: 'nowrap',
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '16px 18px' }}>
          {tab === 0 && <TabDirectorio restaurantId={restaurantId} />}
          {tab === 1 && <TabTopClientes restaurantId={restaurantId} />}
          {tab === 2 && <TabCumpleanos restaurantId={restaurantId} />}
          {tab === 3 && <TabMarketing restaurantId={restaurantId} />}
        </div>
      </div>

    </div>
  );
}
