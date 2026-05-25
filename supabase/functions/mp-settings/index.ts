// Edge Function: mp-settings
// Configura Mercado Pago Point sin devolver el access token al navegador.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com/point/integration-api';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function hasValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function getUserRestaurant(supabase: any, user: any, restaurantId?: string) {
  if (restaurantId) {
    const { data: owned } = await supabase
      .from('restaurants')
      .select('id, nombre')
      .eq('id', restaurantId)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (owned) return owned;

    const { data: team } = await supabase
      .from('team_members')
      .select('restaurant_id')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!team) return null;

    const { data: rest } = await supabase
      .from('restaurants')
      .select('id, nombre')
      .eq('id', restaurantId)
      .maybeSingle();
    return rest;
  }

  const { data: owned } = await supabase
    .from('restaurants')
    .select('id, nombre')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (owned) return owned;

  const { data: team } = await supabase
    .from('team_members')
    .select('restaurant_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!team?.restaurant_id) return null;

  const { data: rest } = await supabase
    .from('restaurants')
    .select('id, nombre')
    .eq('id', team.restaurant_id)
    .maybeSingle();
  return rest;
}

function configResponse(settings: any, restaurant: any) {
  return {
    ok: true,
    restaurantId: restaurant.id,
    config: {
      mp_device_id: settings?.mp_device_id || '',
      mp_access_token: '',
    },
    credentials: {
      mp_access_token: hasValue(settings?.mp_access_token),
    },
  };
}

async function listDevices(accessToken: string) {
  const mpRes = await fetch(`${MP_API}/devices?limit=50&offset=0`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const mpData = await mpRes.json().catch(() => ({}));
  if (!mpRes.ok) {
    throw new Error(mpData?.message || mpData?.error || 'Error en la API de Mercado Pago');
  }
  return (mpData?.devices || []).map((d: any) => ({
    id: d.id,
    model: d.pos_id ? `${d.id} (POS ${d.pos_id})` : d.id,
    status: d.status || 'unknown',
  }));
}

async function testDevice(accessToken: string, deviceId: string) {
  const mpRes = await fetch(`${MP_API}/devices/${encodeURIComponent(deviceId)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const mpData = await mpRes.json().catch(() => ({}));
  if (!mpRes.ok) {
    throw new Error(mpData?.message || mpData?.error || 'Dispositivo no encontrado');
  }
  return mpData;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
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

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'load');
    const restaurant = await getUserRestaurant(supabase, user, body.restaurantId || body.restaurant_id);
    if (!restaurant?.id) return json({ error: 'Sin acceso a este restaurante' }, 403);

    const { data: settings } = await supabase
      .from('restaurant_settings')
      .select('mp_access_token, mp_device_id')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle();

    const formToken = hasValue(body.accessToken) ? String(body.accessToken).trim() : null;
    const storedToken = settings?.mp_access_token || null;
    const effectiveToken = formToken || storedToken;
    const effectiveDeviceId = hasValue(body.deviceId)
      ? String(body.deviceId).trim()
      : (settings?.mp_device_id || '');

    if (action === 'load') {
      return json(configResponse(settings, restaurant));
    }

    if (action === 'detect') {
      if (!effectiveToken) return json({ error: 'Falta Access Token de Mercado Pago' }, 422);
      const devices = await listDevices(effectiveToken);
      return json({ ok: true, devices });
    }

    if (action === 'test') {
      if (!effectiveToken || !effectiveDeviceId) {
        return json({ error: 'Faltan Access Token o Device ID' }, 422);
      }
      const device = await testDevice(effectiveToken, effectiveDeviceId);
      return json({ ok: true, device });
    }

    if (action === 'save') {
      const nextToken = formToken || storedToken || null;
      const nextDeviceId = hasValue(body.deviceId) ? String(body.deviceId).trim() : (settings?.mp_device_id || null);

      const { error: saveErr } = await supabase
        .from('restaurant_settings')
        .upsert({
          restaurant_id: restaurant.id,
          mp_access_token: nextToken,
          mp_device_id: nextDeviceId,
        }, { onConflict: 'restaurant_id' });
      if (saveErr) throw saveErr;

      return json(configResponse({
        mp_access_token: nextToken,
        mp_device_id: nextDeviceId,
      }, restaurant));
    }

    return json({ error: 'Accion invalida' }, 400);
  } catch (err: any) {
    console.error('[mp-settings]', err);
    return json({ error: err?.message || 'Error interno' }, 500);
  }
});
