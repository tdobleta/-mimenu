import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { money } from '@/lib/fmt';

const FONT_UI = "'DM Sans', system-ui, sans-serif";

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function CloseDetailModal({ turn, onClose }) {
  const [items, setItems] = useState(null);
  const [itemsError, setItemsError] = useState(false);
  const [discountReason, setDiscountReason] = useState(null);

  useEffect(() => {
    if (!turn?.id) return;

    // Fetch turn_items
    supabase
      .from('turn_items')
      .select('*')
      .eq('turn_id', turn.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error('[CloseDetailModal] error fetching turn_items:', error);
          setItemsError(true);
        } else {
          setItems(data || []);
        }
      });

    // Fetch discount reason from business_operations (best-effort)
    if (turn.descuento > 0) {
      supabase
        .from('business_operations')
        .select('payload')
        .eq('turn_id', turn.id)
        .eq('operation_type', 'CLOSE_TABLE')
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data }) => {
          const reason = data?.[0]?.payload?.pricing?.discount_reason;
          if (reason) setDiscountReason(reason);
        })
        .catch(() => {}); // best-effort — ignore errors
    }
  }, [turn?.id, turn?.descuento]);

  const subtotalFromItems = items
    ? items.reduce((sum, it) => sum + (it.cantidad || 1) * (it.precio || 0), 0)
    : null;

  const pagos = parsePagosDetalle(turn.pagos_detalle);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,15,35,0.5)', backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 18, padding: 0,
          width: 440, maxWidth: '95vw', maxHeight: '85vh',
          fontFamily: FONT_UI,
          boxShadow: '0 24px 48px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>
              Mesa {turn.mesa_num}
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 20, color: '#9CA3AF', lineHeight: 1, padding: 4,
              }}
            >
              &times;
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
            Cerrada: {fmtDate(turn.closed_at)}
          </div>
          {turn.mozo ? (
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              Mozo: {turn.mozo}
            </div>
          ) : null}
        </div>

        {/* Scrollable body */}
        <div style={{ padding: '16px 24px 20px', overflowY: 'auto', flex: 1 }}>

          {/* Items */}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Items
          </div>
          {items === null && !itemsError && (
            <div style={{ fontSize: 13, color: '#9CA3AF', padding: '8px 0' }}>Cargando items...</div>
          )}
          {itemsError && (
            <div style={{ fontSize: 13, color: '#EF4444', padding: '8px 0' }}>
              No se pudieron cargar los items del pedido.
            </div>
          )}
          {items && items.length === 0 && (
            <div style={{ fontSize: 13, color: '#9CA3AF', padding: '8px 0' }}>Sin items registrados.</div>
          )}
          {items && items.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {items.map((it, i) => (
                <div key={it.id || i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '5px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                  fontSize: 13, color: '#374151',
                }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500 }}>{it.menu_item_name}</span>
                    {it.cantidad > 1 && (
                      <span style={{ color: '#6B7280', marginLeft: 6 }}>x{it.cantidad}</span>
                    )}
                    {it.notas ? (
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{it.notas}</div>
                    ) : null}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 70, fontWeight: 500 }}>
                    {money((it.cantidad || 1) * (it.precio || 0))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
            {subtotalFromItems !== null && (
              <Row label="Subtotal" value={money(subtotalFromItems)} />
            )}

            {(turn.descuento || 0) > 0 && (
              <>
                <Row
                  label="Descuento"
                  value={`-${money(turn.descuento)}`}
                  valueColor="#EF4444"
                />
                {discountReason && (
                  <div style={{ fontSize: 12, color: '#9CA3AF', paddingLeft: 4, marginTop: -2 }}>
                    Motivo: {discountReason}
                  </div>
                )}
              </>
            )}

            {(turn.propina || 0) > 0 && (
              <Row label="Propina" value={`+${money(turn.propina)}`} valueColor="#1D9E75" />
            )}

            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '8px 0 4px', borderTop: '1px solid #E2E8F0', marginTop: 4,
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Total</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                {money(turn.total_facturado || 0)}
              </span>
            </div>
          </div>

          {/* Payment */}
          <div style={{ marginTop: 16, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Pago
            </div>
            <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
              {turn.metodo_pago || 'No especificado'}
            </div>
            {pagos && pagos.length > 1 && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {pagos.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280' }}>
                    <span>{p.metodo}</span>
                    <span>{money(p.monto)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 16px', borderTop: '1px solid #E2E8F0' }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '10px 0', border: '1px solid #E2E8F0',
              borderRadius: 12, fontSize: 13, fontWeight: 600,
              color: '#374151', background: '#FFFFFF', cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: '#6B7280' }}>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor || '#374151' }}>{value}</span>
    </div>
  );
}

function parsePagosDetalle(raw) {
  if (!raw) return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch { /* ignore */ }
  return null;
}
