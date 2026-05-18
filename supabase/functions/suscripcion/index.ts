// supabase/functions/suscripcion/index.ts
// Edge Function para gestión de suscripciones via MercadoPago.
// Maneja: crear suscripción, webhook de pagos, cancelar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://mimenuar.netlify.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!;
const MP_BASE  = 'https://api.mercadopago.com';

// ── Planes disponibles ────────────────────────────────────────
const PLANES = {
  basic: {
    nombre: 'Plan Básico',
    precio: 15000,          // $15.000 ARS/mes
    features: ['1 sucursal', 'hasta 20 mesas', 'soporte por email'],
  },
  pro: {
    nombre: 'Plan Pro',
    precio: 35000,          // $35.000 ARS/mes
    features: ['hasta 3 sucursales', 'mesas ilimitadas', 'analíticas avanzadas', 'soporte prioritario'],
  },
  enterprise: {
    nombre: 'Plan Enterprise',
    precio: 80000,          // $80.000 ARS/mes
    features: ['sucursales ilimitadas', 'facturación AFIP incluida', 'onboarding personalizado', 'soporte 24/7'],
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  // ── Webhook de MercadoPago (no requiere auth) ──────────────
  if (action === 'webhook') {
    return handleWebhook(req);
  }

  // ── Rutas autenticadas ─────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    switch (action) {
      case 'crear':   return await crearSuscripcion(req, supabase, user);
      case 'cancelar': return await cancelarSuscripcion(req, supabase, user);
      case 'estado':  return await estadoSuscripcion(supabase, user);
      case 'planes':  return new Response(JSON.stringify({ planes: PLANES }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      default:
        return new Response(JSON.stringify({ error: 'Acción no válida' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    console.error('[suscripcion]', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});

// ── Crear suscripción ─────────────────────────────────────────
async function crearSuscripcion(req: Request, supabase: any, user: any) {
  const { planId, restaurantId } = await req.json();
  const plan = PLANES[planId as keyof typeof PLANES];
  if (!plan) return new Response(JSON.stringify({ error: 'Plan no válido' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

  // Verificar que el restaurante pertenece al usuario
  const { data: ownedRestaurant } = await supabase.from('restaurants').select('id').eq('id', restaurantId).eq('owner_id', user.id).single();
  if (!ownedRestaurant) return new Response(JSON.stringify({ error: 'No autorizado para este restaurante' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });

  // Crear plan en MP si no existe
  const mpPlanRes = await fetch(`${MP_BASE}/preapproval_plan`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: `mimenú ${plan.nombre}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: plan.precio,
        currency_id: 'ARS',
      },
      back_url: `${Deno.env.get('APP_URL')}/configuracion?tab=suscripcion`,
    }),
  });
  const mpPlan = await mpPlanRes.json();

  // Crear suscripción del usuario
  const mpSubRes = await fetch(`${MP_BASE}/preapproval`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preapproval_plan_id: mpPlan.id,
      payer_email: user.email,
      back_url: `${Deno.env.get('APP_URL')}/configuracion?tab=suscripcion&status=success`,
      reason: `mimenú ${plan.nombre}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: plan.precio,
        currency_id: 'ARS',
      },
    }),
  });
  const mpSub = await mpSubRes.json();

  // Guardar en DB
  await supabase.from('suscripciones').upsert({
    restaurant_id: restaurantId,
    plan_id: planId,
    mp_preapproval_id: mpSub.id,
    status: 'pending',
    precio: plan.precio,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'restaurant_id' });

  return new Response(JSON.stringify({
    init_point: mpSub.init_point,  // URL donde el usuario paga
    suscripcion_id: mpSub.id,
  }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ── Cancelar suscripción ──────────────────────────────────────
async function cancelarSuscripcion(req: Request, supabase: any, user: any) {
  const { restaurantId } = await req.json();

  // Verificar que el restaurante pertenece al usuario
  const { data: ownedRestaurant } = await supabase.from('restaurants').select('id').eq('id', restaurantId).eq('owner_id', user.id).single();
  if (!ownedRestaurant) return new Response(JSON.stringify({ error: 'No autorizado para este restaurante' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const { data: sub } = await supabase
    .from('suscripciones')
    .select('mp_preapproval_id')
    .eq('restaurant_id', restaurantId)
    .single();

  if (!sub?.mp_preapproval_id) return new Response(JSON.stringify({ error: 'Sin suscripción activa' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });

  await fetch(`${MP_BASE}/preapproval/${sub.mp_preapproval_id}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  });

  await supabase.from('suscripciones').update({ status: 'cancelled' }).eq('restaurant_id', restaurantId);

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ── Estado de suscripción ─────────────────────────────────────
async function estadoSuscripcion(supabase: any, user: any) {
  const restaurantId = await getRestaurantId(supabase, user.id);

  const { data: sub } = await supabase
    .from('suscripciones')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .single();

  return new Response(JSON.stringify({ suscripcion: sub || null }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ── Webhook de MercadoPago ────────────────────────────────────
async function handleWebhook(req: Request) {
  // Validar firma de MercadoPago
  const xSignature = req.headers.get('x-signature') || '';
  const xRequestId = req.headers.get('x-request-id') || '';
  const webhookSecret = Deno.env.get('MP_WEBHOOK_SECRET');

  if (webhookSecret) {
    // Extraer ts y v1 del header x-signature: "ts=...,v1=..."
    const parts = Object.fromEntries(xSignature.split(',').map(p => { const [k,v] = p.split('='); return [k.trim(), v]; }));
    const ts = parts['ts'] || '';
    const v1 = parts['v1'] || '';

    // Reconstruir el string firmado
    const bodyText = JSON.stringify(await req.clone().json());
    const dataId = JSON.parse(bodyText)?.data?.id || '';
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (computed !== v1) {
      console.error('[suscripcion] Webhook firma inválida');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json();
  const { type, data } = body;

  if (type === 'subscription_preapproval') {
    const mpRes = await fetch(`${MP_BASE}/preapproval/${data.id}`, {
      headers: { 'Authorization': `Bearer ${MP_TOKEN}` },
    });
    const sub = await mpRes.json();

    await supabaseAdmin
      .from('suscripciones')
      .update({ status: sub.status, updated_at: new Date().toISOString() })
      .eq('mp_preapproval_id', data.id);
  }

  return new Response('ok', { status: 200 });
}

async function getRestaurantId(supabase: any, userId: string) {
  const { data } = await supabase.from('restaurants').select('id').eq('owner_id', userId).single();
  return data?.id;
}
