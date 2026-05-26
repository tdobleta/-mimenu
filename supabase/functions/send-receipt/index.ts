// supabase/functions/send-receipt/index.ts
// Envía el recibo de una mesa cerrada por email al cliente via Resend.
//
// SECRETS necesarios (Dashboard → Project Settings → Edge Functions → Secrets):
//   RESEND_API_KEY = re_xxxxxxxx
//
// DEPLOY:
//   supabase functions deploy send-receipt
//
// LLAMADA desde frontend (fire-and-forget):
//   supabase.functions.invoke('send-receipt', {
//     body: { email, turn, items, restaurantName, restaurantPhone }
//   }).catch(() => {})
//
// No bloquea el cierre de mesa — se llama después de cerrar exitosamente.

import { Resend } from 'https://esm.sh/resend@3';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, getCorsHeaders } from '../_shared/http.ts';

// Cliente para validar JWT del usuario autenticado.
// SUPABASE_URL y SUPABASE_ANON_KEY están disponibles automáticamente en Edge Functions.
const supabaseAuth = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
);

function money(n: number): string {
  return '$' + (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtFecha(isoStr: string): string {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return isoStr; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  // ── Verificación JWT ───────────────────────────────────────────────────────
  // La función solo puede ser llamada por usuarios autenticados (mozos/dueños).
  // El cliente Supabase JS adjunta automáticamente el JWT al llamar via
  // supabase.functions.invoke(). Sin auth, rechazamos para evitar abuso de cuota.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token inválido' }), {
      status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
  // ── Fin verificación JWT ───────────────────────────────────────────────────

  try {
    const {
      email,
      turn,        // { mesa_num, mozo, metodo_pago, total_facturado, propina, descuento, closed_at }
      items,       // [{ menu_item_name, cantidad, precio, notas }]
      restaurantName,
      restaurantPhone,
    } = await req.json();

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Email inválido' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

    // ── Construir tabla de ítems ─────────────────────────────────
    const itemRows = (items || []).map((it: { menu_item_name: string; cantidad: number; precio: number; notas?: string }) => {
      const subtotal = (it.precio || 0) * (it.cantidad || 1);
      return `
        <tr>
          <td style="padding:8px 12px;font-size:14px;color:#111827;border-bottom:1px solid #F3F4F6;">
            ${it.menu_item_name || '—'}
            ${it.notas ? `<div style="font-size:12px;color:#6B7280;margin-top:2px;">${it.notas}</div>` : ''}
          </td>
          <td style="padding:8px 12px;font-size:14px;color:#374151;text-align:center;border-bottom:1px solid #F3F4F6;">${it.cantidad}</td>
          <td style="padding:8px 12px;font-size:14px;color:#374151;text-align:right;border-bottom:1px solid #F3F4F6;">${money(subtotal)}</td>
        </tr>`;
    }).join('');

    const subtotal    = (turn.total_facturado || 0) - (turn.propina || 0) + (turn.descuento || 0);
    const descuento   = turn.descuento  || 0;
    const propina     = turn.propina    || 0;
    const totalFinal  = turn.total_facturado || 0;

    // ── Template HTML del recibo ─────────────────────────────────
    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recibo - ${restaurantName}</title></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1D9E75 0%,#16a085 100%);padding:28px 32px;text-align:center;">
      <div style="font-size:26px;font-weight:800;color:white;letter-spacing:-0.5px;">${restaurantName}</div>
      ${restaurantPhone ? `<div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">${restaurantPhone}</div>` : ''}
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:12px;">${fmtFecha(turn.closed_at)}</div>
    </div>

    <!-- Info de la mesa -->
    <div style="padding:20px 32px;background:#F8FAFC;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-size:11px;color:#9CA3AF;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Mesa</div>
        <div style="font-size:18px;font-weight:700;color:#111827;">${turn.mesa_num || '—'}</div>
      </div>
      ${turn.mozo ? `<div>
        <div style="font-size:11px;color:#9CA3AF;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Atendido por</div>
        <div style="font-size:16px;font-weight:600;color:#374151;">${turn.mozo}</div>
      </div>` : ''}
      <div>
        <div style="font-size:11px;color:#9CA3AF;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Pago</div>
        <div style="font-size:14px;font-weight:600;color:#374151;">${turn.metodo_pago || '—'}</div>
      </div>
    </div>

    <!-- Tabla de ítems -->
    <div style="padding:0 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:0;">
        <thead>
          <tr style="background:#F9FAFB;">
            <th style="padding:10px 12px;font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;text-align:left;border-bottom:2px solid #E5E7EB;">Producto</th>
            <th style="padding:10px 12px;font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;text-align:center;border-bottom:2px solid #E5E7EB;">Cant.</th>
            <th style="padding:10px 12px;font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;text-align:right;border-bottom:2px solid #E5E7EB;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>

    <!-- Totales -->
    <div style="padding:20px 32px;border-top:2px solid #F3F4F6;">
      ${descuento > 0 ? `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:14px;color:#6B7280;">Subtotal</span>
        <span style="font-size:14px;color:#374151;">${money(subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:14px;color:#10B981;">Descuento</span>
        <span style="font-size:14px;color:#10B981;">-${money(descuento)}</span>
      </div>` : ''}
      ${propina > 0 ? `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:14px;color:#6B7280;">Propina</span>
        <span style="font-size:14px;color:#374151;">${money(propina)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding-top:12px;border-top:2px solid #E5E7EB;margin-top:4px;">
        <span style="font-size:18px;font-weight:700;color:#111827;">Total</span>
        <span style="font-size:24px;font-weight:800;color:#1D9E75;">${money(totalFinal)}</span>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:24px 32px;background:#F8FAFC;text-align:center;border-top:1px solid #E5E7EB;">
      <p style="margin:0;font-size:15px;color:#374151;font-weight:600;">¡Gracias por tu visita!</p>
      <p style="margin:6px 0 0;font-size:12px;color:#9CA3AF;">Este es tu comprobante de pago de ${restaurantName}.</p>
      <p style="margin:16px 0 0;font-size:11px;color:#D1D5DB;">Powered by mimenú · app.mimenu.ar</p>
    </div>
  </div>
</body>
</html>`;

    // ── Enviar via Resend ─────────────────────────────────────────
    const { error } = await resend.emails.send({
      from: `${restaurantName} <recibos@mimenu.app>`,
      to: email,
      subject: `Tu recibo de ${restaurantName} — ${money(totalFinal)}`,
      html,
    });

    if (error) throw new Error(JSON.stringify(error));

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[send-receipt]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
