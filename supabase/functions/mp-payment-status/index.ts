// Edge Function: mp-payment-status
// Consulta el estado de un payment intent (para polling desde el frontend).
// Lee credenciales desde restaurant_settings.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { intentId, restaurantId } = await req.json();
    if (!intentId || !restaurantId) {
      return new Response(JSON.stringify({ error: 'Faltan intentId o restaurantId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Leer credenciales
    const { data: settings } = await supabase
      .from('restaurant_settings')
      .select('mp_access_token, mp_device_id')
      .eq('restaurant_id', restaurantId)
      .single();

    if (!settings?.mp_access_token || !settings?.mp_device_id) {
      return new Response(JSON.stringify({ error: 'Terminal no configurada' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Consultar estado del payment intent
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

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      return new Response(JSON.stringify({ error: mpData?.message || 'Error en MP' }), {
        status: mpRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Retornar estado simplificado
    // Posibles valores de state.type: OPEN, PROCESSING, FINISHED, ABANDONED, ERROR, CANCELED
    return new Response(JSON.stringify({
      ok:    true,
      state: mpData.state,           // { type: 'FINISHED', ... } cuando aprobado
      payment: mpData.payment || null,  // { id, type, installments } si terminó
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
