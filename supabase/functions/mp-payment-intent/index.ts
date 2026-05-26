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

    const { amount, description, turnId, restaurantId } = await req.json();
    if (!amount || !restaurantId) return json({ error: 'Faltan amount o restaurantId' }, 400);
    if (Number(amount) < 1) return json({ error: 'Monto invalido (minimo $1)' }, 400);

    const restaurant = await getUserRestaurant(supabase, user, restaurantId);
    if (!restaurant) return json({ error: 'Sin acceso a este restaurante' }, 403);

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

    const idempotencyKey = `mimenu_${turnId || restaurant.id}_${Date.now()}`;
    const mpRes = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${encodeURIComponent(settings.mp_device_id)}/payment-intents`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.mp_access_token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          amount: Math.round(Number(amount)),
          description: description || `Pago en ${restaurant.nombre || 'Restaurante'}`,
          payment: {
            installments: 1,
            type: 'credit_card',
          },
          additional_info: {
            external_reference: `mimenu_${turnId || 'pos'}_${Date.now()}`,
          },
        }),
      },
    );

    const mpData = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      return json({ error: mpData?.message || mpData?.error || 'Error al crear el pago en Mercado Pago' }, mpRes.status);
    }

    return json({
      ok: true,
      intentId: mpData.id,
      state: mpData.state,
    });
  } catch (err: any) {
    return serverErrorResponse(req, 'mp-payment-intent', err, 'No se pudo iniciar el pago en la terminal. Reintenta o contacta soporte.');
  }
});
