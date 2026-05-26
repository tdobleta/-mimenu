// Edge Function: afip-settings
// Guarda, carga y prueba la configuracion AFIP/TusFacturasAPP sin devolver
// secretos al navegador.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, serverErrorResponse } from '../_shared/http.ts';

const TUSFACTURAS_API = 'https://www.tusfacturas.app/app/api/v2';

const SECRET_KEYS = new Set(['usertoken', 'tokenclient', 'apitoken']);

function sanitizedAfipConfig(cfg: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cfg || {})) {
    if (!SECRET_KEYS.has(key)) out[key] = value;
  }
  return out;
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

function buildConfigResponse(settings: any, restaurant: any) {
  const rawCfg = settings?.afip_config || {};
  const cfg = {
    ...sanitizedAfipConfig(rawCfg),
    habilitado: Boolean(rawCfg.habilitado),
    punto_venta: settings?.tusfacturas_punto_venta || rawCfg.punto_venta || '00001',
    usertoken: '',
    tokenclient: '',
    apitoken: '',
  };

  return {
    ok: true,
    restaurantId: restaurant.id,
    config: cfg,
    credentials: {
      usertoken: hasValue(settings?.tusfacturas_usertoken || rawCfg.usertoken),
      tokenclient: hasValue(settings?.tusfacturas_tokenclient || rawCfg.tokenclient),
      apitoken: hasValue(settings?.tusfacturas_apitoken || rawCfg.apitoken),
    },
  };
}

async function testTusFacturas(creds: {
  usertoken?: string;
  tokenclient?: string;
  apitoken?: string;
}) {
  const res = await fetch(`${TUSFACTURAS_API}/estado_servicios/alertas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usertoken: creds.usertoken,
      tokenclient: creds.tokenclient,
      apitoken: creds.apitoken,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error !== 'N') {
    const msg = data.error_msg || data.message || `Error HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
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

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'load');
    const restaurant = await getUserRestaurant(supabase, user, body.restaurantId || body.restaurant_id);
    if (!restaurant?.id) return json({ error: 'Sin acceso a este restaurante' }, 403);

    const { data: settings } = await supabase
      .from('restaurant_settings')
      .select('afip_config, tusfacturas_usertoken, tusfacturas_tokenclient, tusfacturas_apitoken, tusfacturas_punto_venta')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle();

    if (action === 'load') {
      return json(buildConfigResponse(settings, restaurant));
    }

    if (action === 'test') {
      const cfg = body.config || {};
      const oldCfg = settings?.afip_config || {};
      const creds = {
        usertoken: hasValue(cfg.usertoken) ? cfg.usertoken : (settings?.tusfacturas_usertoken || oldCfg.usertoken),
        tokenclient: hasValue(cfg.tokenclient) ? cfg.tokenclient : (settings?.tusfacturas_tokenclient || oldCfg.tokenclient),
        apitoken: hasValue(cfg.apitoken) ? cfg.apitoken : (settings?.tusfacturas_apitoken || oldCfg.apitoken),
      };
      if (!creds.usertoken || !creds.tokenclient || !creds.apitoken) {
        return json({ error: 'Faltan credenciales TusFacturasAPP' }, 422);
      }
      await testTusFacturas(creds);
      return json({ ok: true });
    }

    if (action === 'save') {
      const cfg = body.config || {};
      const currentCfg = settings?.afip_config || {};
      const cleanCfg = {
        ...sanitizedAfipConfig(currentCfg),
        ...sanitizedAfipConfig(cfg),
        punto_venta: cfg.punto_venta || settings?.tusfacturas_punto_venta || currentCfg.punto_venta || '00001',
      };

      const nextSecrets = {
        tusfacturas_usertoken: hasValue(cfg.usertoken)
          ? String(cfg.usertoken).trim()
          : (settings?.tusfacturas_usertoken || currentCfg.usertoken || null),
        tusfacturas_tokenclient: hasValue(cfg.tokenclient)
          ? String(cfg.tokenclient).trim()
          : (settings?.tusfacturas_tokenclient || currentCfg.tokenclient || null),
        tusfacturas_apitoken: hasValue(cfg.apitoken)
          ? String(cfg.apitoken).trim()
          : (settings?.tusfacturas_apitoken || currentCfg.apitoken || null),
      };

      const { error: saveErr } = await supabase
        .from('restaurant_settings')
        .upsert({
          restaurant_id: restaurant.id,
          afip_config: cleanCfg,
          tusfacturas_punto_venta: String(cleanCfg.punto_venta || '00001'),
          ...nextSecrets,
        }, { onConflict: 'restaurant_id' });
      if (saveErr) throw saveErr;

      const savedSettings = {
        afip_config: cleanCfg,
        tusfacturas_punto_venta: String(cleanCfg.punto_venta || '00001'),
        ...nextSecrets,
      };
      return json(buildConfigResponse(savedSettings, restaurant));
    }

    return json({ error: 'Accion invalida' }, 400);
  } catch (err: any) {
    return serverErrorResponse(req, 'afip-settings', err, 'No se pudo procesar la configuracion fiscal. Reintenta o contacta soporte.');
  }
});
