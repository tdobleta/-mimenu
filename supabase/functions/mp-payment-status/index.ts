// Edge Function: mp-payment-status
// Consulta el estado de un payment intent para polling del frontend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, serverErrorResponse } from '../_shared/http.ts';

async function canAccessRestaurant(supabase: any, user: any, restaurantId: string) {
  const { data: owned } = await supabase
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (owned) return true;

  const { data: teamMember } = await supabase
    .from('team_members')
    .select('restaurant_id')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', user.id)
    .maybeSingle();
  return Boolean(teamMember);
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

    const { intentId, restaurantId } = await req.json();
    if (!intentId || !restaurantId) return json({ error: 'Faltan intentId o restaurantId' }, 400);

    const allowed = await canAccessRestaurant(supabase, user, restaurantId);
    if (!allowed) return json({ error: 'Sin acceso a este restaurante' }, 403);

    const { data: storedIntent, error: storedErr } = await supabase
      .from('mp_payment_intents')
      .select('id, mp_intent_id')
      .eq('restaurant_id', restaurantId)
      .eq('mp_intent_id', intentId)
      .maybeSingle();
    if (storedErr) throw storedErr;
    if (!storedIntent) return json({ error: 'Intent no encontrado para este restaurante' }, 404);

    const { data: settings } = await supabase
      .from('restaurant_settings')
      .select('mp_access_token, mp_device_id')
      .eq('restaurant_id', restaurantId)
      .single();

    if (!settings?.mp_access_token || !settings?.mp_device_id) {
      return json({ error: 'Terminal no configurada' }, 422);
    }

    const mpRes = await fetch(
      `https://api.mercadopago.com/point/integration-api/devices/${encodeURIComponent(settings.mp_device_id)}/payment-intents/${encodeURIComponent(intentId)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${settings.mp_access_token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const mpData = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      return json({ error: mpData?.message || 'Error en MP' }, mpRes.status);
    }

    await supabase
      .from('mp_payment_intents')
      .update({
        status: mpData?.state?.type || '',
        last_status_payload: mpData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', storedIntent.id);

    return json({
      ok: true,
      state: mpData.state,
      payment: mpData.payment || null,
    });
  } catch (err: any) {
    return serverErrorResponse(req, 'mp-payment-status', err, 'No se pudo consultar el estado del pago. Reintenta o verifica la terminal.');
  }
});
