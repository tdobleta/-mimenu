// Edge Function: mp-payment-intent
// Crea un payment intent en la terminal MP Point.
// Lee access_token y device_id desde restaurant_settings; el frontend no ve
// credenciales de Mercado Pago.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, serverErrorResponse } from '../_shared/http.ts';

async function getUserRestaurant(supabase: any, user: any, restaurantId: string) {
  const { data: owned } = await supabase
    .from('restaurants')
    .select('id, nombre')
    .eq('id', restaurantId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (owned) return owned;

  const { data: teamMember } = await supabase
    .from('team_members')
    .select('restaurant_id')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!teamMember) return null;

  const { data: rest } = await supabase
    .from('restaurants')
    .select('id, nombre')
    .eq('id', restaurantId)
    .maybeSingle();
  return rest;
}

function isIdempotencyKey(value: unknown) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 120 && /^[a-zA-Z0-9:_-]+$/.test(value);
}

async function assertBranchAndTurnScope(supabase: any, restaurantId: string, branchId?: string | null, turnId?: string | null) {
  if (branchId) {
    const { data: branch, error } = await supabase
      .from('branches')
      .select('id')
      .eq('id', branchId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (error) throw error;
    if (!branch) return false;
  }

  if (turnId) {
    const query = supabase
      .from('turns')
      .select('id, branch_id')
      .eq('id', turnId)
      .maybeSingle();
    const { data: turn, error } = await query;
    if (error) throw error;
    if (!turn) return false;
    if (branchId && turn.branch_id !== branchId) return false;

    const { data: branch, error: branchErr } = await supabase
      .from('branches')
      .select('id')
      .eq('id', turn.branch_id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (branchErr) throw branchErr;
    if (!branch) return false;
  }

  return true;
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) => jsonResponse(req, body, status);
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: 'No autorizado' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Sesion invalida' }, 401);

    const { amount, description, turnId, restaurantId, branchId, idempotencyKey } = await req.json();
    if (!amount || !restaurantId) return json({ error: 'Faltan amount o restaurantId' }, 400);
    if (Number(amount) < 1) return json({ error: 'Monto invalido (minimo $1)' }, 400);
    if (idempotencyKey && !isIdempotencyKey(idempotencyKey)) return json({ error: 'Idempotency key invalida' }, 400);

    const restaurant = await getUserRestaurant(supabase, user, restaurantId);
    if (!restaurant) return json({ error: 'Sin acceso a este restaurante' }, 403);

    const scoped = await assertBranchAndTurnScope(supabase, restaurant.id, branchId || null, turnId || null);
    if (!scoped) return json({ error: 'La mesa o sucursal no pertenece a este restaurante' }, 403);

    const stableKey = idempotencyKey || `mp_${restaurant.id}_${turnId || 'pos'}_${crypto.randomUUID()}`;
    const { data: existingIntent, error: existingErr } = await supabase
      .from('mp_payment_intents')
      .select('mp_intent_id, status, response_payload')
      .eq('restaurant_id', restaurant.id)
      .eq('idempotency_key', stableKey)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existingIntent?.mp_intent_id) {
      return json({
        ok: true,
        intentId: existingIntent.mp_intent_id,
        state: existingIntent.response_payload?.state || existingIntent.status || null,
        reused: true,
      });
    }

    const { data: settings, error: settingsErr } = await supabase
      .from('restaurant_settings')
      .select('mp_access_token, mp_device_id')
      .eq('restaurant_id', restaurant.id)
      .single();

    if (settingsErr || !settings?.mp_access_token || !settings?.mp_device_id) {
      return json({
        error: 'Terminal de pago no configurada. Ir a Configuracion -> Terminal de pago.',
      }, 422);
    }

    const mpRes = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${encodeURIComponent(settings.mp_device_id)}/payment-intents`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.mp_access_token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': stableKey,
        },
        body: JSON.stringify({
          amount: Math.round(Number(amount)),
          description: description || `Pago en ${restaurant.nombre || 'Restaurante'}`,
          payment: {
            installments: 1,
            type: 'credit_card',
          },
          additional_info: {
            external_reference: `mimenu_${stableKey}`,
          },
        }),
      },
    );

    const mpData = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      return json({ error: mpData?.message || mpData?.error || 'Error al crear el pago en Mercado Pago' }, mpRes.status);
    }

    const { error: insertErr } = await supabase
      .from('mp_payment_intents')
      .upsert({
        restaurant_id: restaurant.id,
        branch_id: branchId || null,
        turn_id: turnId || null,
        idempotency_key: stableKey,
        mp_intent_id: mpData.id,
        amount: Math.round(Number(amount)),
        description: description || `Pago en ${restaurant.nombre || 'Restaurante'}`,
        status: mpData?.state?.type || '',
        created_by: user.id,
        request_payload: {
          amount: Math.round(Number(amount)),
          description: description || null,
          turnId: turnId || null,
          branchId: branchId || null,
        },
        response_payload: mpData,
      }, { onConflict: 'idempotency_key' });
    if (insertErr) throw insertErr;

    return json({
      ok: true,
      intentId: mpData.id,
      state: mpData.state,
      idempotencyKey: stableKey,
    });
  } catch (err: any) {
    return serverErrorResponse(req, 'mp-payment-intent', err, 'No se pudo iniciar el pago en la terminal. Reintenta o contacta soporte.');
  }
});
