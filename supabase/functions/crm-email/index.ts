// supabase/functions/crm-email/index.ts
// Emails de fidelización CRM via Resend.
// Tipos soportados:
//   - birthday       → Feliz cumpleaños + descuento especial
//   - points_summary → Resumen de puntos acumulados
//   - welcome        → Bienvenida en primera visita
//
// SECRETS necesarios (Dashboard → Project Settings → Edge Functions → Secrets):
//   RESEND_API_KEY = re_xxxxxxxx
//
// DEPLOY:
//   supabase functions deploy crm-email
//
// LLAMADA desde frontend:
//   supabase.functions.invoke('crm-email', {
//     body: {
//       type: 'birthday',
//       to: 'cliente@email.com',
//       customerName: 'Juan',
//       restaurantName: 'Mi Restaurante',
//       puntos: 350,
//       descuento: '10%',   // solo para birthday
//     }
//   })

import { Resend } from 'https://esm.sh/resend@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FROM_EMAIL = 'noreply@mimenu.app';

// ── Templates ─────────────────────────────────────────────────────────────────

function templateBirthday(customerName: string, restaurantName: string, descuento: string, puntos: number): string {
  const puntosSection = puntos > 0 ? `
    <div style="background:#F0FDF4;border-radius:10px;padding:14px 18px;margin:16px 0;text-align:center;">
      <div style="font-size:11px;color:#059669;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Puntos acumulados</div>
      <div style="font-size:28px;font-weight:800;color:#1D9E75;">★ ${puntos}</div>
      <div style="font-size:12px;color:#6B7280;margin-top:2px;">podés canjearlos en tu próxima visita</div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header festivo -->
    <div style="background:linear-gradient(135deg,#1D9E75 0%,#0EA472 100%);padding:32px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">🎂</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${restaurantName}</div>
      <div style="font-size:24px;font-weight:800;color:#FFF;line-height:1.2;">¡Feliz Cumpleaños, ${customerName}!</div>
    </div>

    <!-- Cuerpo -->
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
        En tu día especial, todo el equipo de <strong>${restaurantName}</strong> te desea
        lo mejor. ¡Gracias por elegirnos y ser parte de nuestra comunidad!
      </p>

      <!-- Descuento destacado -->
      <div style="background:linear-gradient(135deg,rgba(29,158,117,0.08),rgba(29,158,117,0.04));border:1.5px dashed #1D9E75;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
        <div style="font-size:11px;color:#1D9E75;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">🎁 Tu regalo de cumpleaños</div>
        <div style="font-size:36px;font-weight:800;color:#1D9E75;">${descuento} OFF</div>
        <div style="font-size:12px;color:#6B7280;margin-top:4px;">en tu próxima visita · válido este mes</div>
      </div>

      ${puntosSection}

      <p style="margin:16px 0 0;font-size:13px;color:#6B7280;line-height:1.5;">
        Presentá este email en el local o mencionalo al hacer tu pedido para aplicar el descuento.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background:#F8FAFC;text-align:center;border-top:1px solid #E5E7EB;">
      <p style="margin:0;font-size:13px;color:#374151;font-weight:600;">¡Te esperamos pronto! 🎉</p>
      <p style="margin:8px 0 0;font-size:11px;color:#D1D5DB;">Powered by mimenú · app.mimenu.ar</p>
    </div>
  </div>
</body>
</html>`;
}

function templatePointsSummary(customerName: string, restaurantName: string, puntos: number, visitas: number): string {
  const nivel = puntos >= 500 ? 'Gold ⭐' : puntos >= 200 ? 'Silver 🥈' : 'Bronze 🥉';
  const nivelColor = puntos >= 500 ? '#F59E0B' : puntos >= 200 ? '#94A3B8' : '#B45309';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1D9E75 0%,#16a085 100%);padding:28px 32px;text-align:center;">
      <div style="font-size:11px;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${restaurantName}</div>
      <div style="font-size:22px;font-weight:800;color:#FFF;">Tu resumen de puntos, ${customerName}</div>
    </div>

    <!-- Stats -->
    <div style="padding:24px 32px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <div style="background:#F0FDF4;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#059669;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Puntos</div>
          <div style="font-size:32px;font-weight:800;color:#1D9E75;">★ ${puntos}</div>
        </div>
        <div style="background:#F8FAFC;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Visitas</div>
          <div style="font-size:32px;font-weight:800;color:#0F172A;">${visitas}</div>
        </div>
      </div>

      <!-- Nivel -->
      <div style="background:#FFF9EC;border:1px solid ${nivelColor};border-radius:10px;padding:12px 16px;text-align:center;margin-bottom:20px;">
        <div style="font-size:14px;font-weight:700;color:${nivelColor};">Nivel ${nivel}</div>
        ${puntos < 500 ? `<div style="font-size:12px;color:#92600A;margin-top:4px;">Necesitás ${500-puntos} puntos más para llegar a Gold ⭐</div>` : '<div style="font-size:12px;color:#D97706;margin-top:4px;">¡Sos nuestro cliente más fiel! 🏆</div>'}
      </div>

      <!-- Cómo canjear -->
      <div style="background:#F8FAFC;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <div style="font-size:12px;font-weight:700;color:#0F172A;margin-bottom:8px;">¿Cómo usar tus puntos?</div>
        <div style="font-size:12px;color:#64748B;line-height:1.6;">
          Cada <strong>100 puntos = $100 de descuento</strong> en tu próxima visita.<br>
          Avisale al cajero que querés canjear puntos cuando hagas tu pedido.
        </div>
      </div>

      <p style="font-size:13px;color:#6B7280;line-height:1.5;margin:0;">
        ¡Gracias por seguir eligiendo <strong>${restaurantName}</strong>!
        Te esperamos pronto para que sigas sumando.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background:#F8FAFC;text-align:center;border-top:1px solid #E5E7EB;">
      <p style="margin:0;font-size:11px;color:#D1D5DB;">Powered by mimenú · app.mimenu.ar</p>
    </div>
  </div>
</body>
</html>`;
}

function templateWelcome(customerName: string, restaurantName: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1D9E75 0%,#16a085 100%);padding:28px 32px;text-align:center;">
      <div style="font-size:30px;margin-bottom:8px;">👋</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${restaurantName}</div>
      <div style="font-size:22px;font-weight:800;color:#FFF;">¡Bienvenido/a, ${customerName}!</div>
    </div>
    <div style="padding:24px 32px;">
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
        Gracias por registrarte en nuestro programa de fidelización.
        A partir de ahora, acumulás puntos en cada visita que podés canjear por descuentos.
      </p>
      <div style="background:#F0FDF4;border-radius:10px;padding:16px;text-align:center;margin:0 0 16px;">
        <div style="font-size:13px;font-weight:700;color:#1D9E75;">¿Cómo funciona?</div>
        <div style="font-size:13px;color:#374151;margin-top:8px;line-height:1.6;">
          Cada $100 en consumo = 1 punto<br>
          100 puntos = $100 de descuento
        </div>
      </div>
      <p style="font-size:13px;color:#6B7280;margin:0;">¡Nos vemos pronto! 🍽️</p>
    </div>
    <div style="padding:20px 32px;background:#F8FAFC;text-align:center;border-top:1px solid #E5E7EB;">
      <p style="margin:0;font-size:11px;color:#D1D5DB;">Powered by mimenú · app.mimenu.ar</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Handler principal ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { type, to, customerName, restaurantName, puntos = 0, visitas = 0, descuento = '10%' } = body;

    // Validación básica
    if (!to || !to.includes('@')) {
      return new Response(JSON.stringify({ error: 'Email inválido o no proporcionado' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!type || !['birthday', 'points_summary', 'welcome'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Tipo inválido. Usar: birthday | points_summary | welcome' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!customerName || !restaurantName) {
      return new Response(JSON.stringify({ error: 'customerName y restaurantName son requeridos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

    let subject: string;
    let html: string;

    if (type === 'birthday') {
      subject = `🎂 ¡Feliz cumpleaños, ${customerName}! Un regalo de ${restaurantName}`;
      html = templateBirthday(customerName, restaurantName, descuento, puntos);
    } else if (type === 'points_summary') {
      subject = `★ Tus puntos en ${restaurantName} — ¡tenés ${puntos} acumulados!`;
      html = templatePointsSummary(customerName, restaurantName, puntos, visitas);
    } else {
      subject = `¡Bienvenido/a al programa de fidelización de ${restaurantName}!`;
      html = templateWelcome(customerName, restaurantName);
    }

    const { error } = await resend.emails.send({
      from: `${restaurantName} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });

    if (error) throw new Error(JSON.stringify(error));

    return new Response(JSON.stringify({ ok: true, type, to }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[crm-email]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
