// Edge Function: mp-list-devices
// Lista las terminales MP Point asociadas a un Access Token.
// No requiere restaurant_settings — el token lo manda el frontend directamente.
// Sólo el dueño puede llamar esta función (auth verificado).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Autenticar el caller
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

    // 2. Leer access token del body
    const { accessToken } = await req.json();
    if (!accessToken?.startsWith('APP_USR-')) {
      return new Response(JSON.stringify({ error: 'Access Token inválido. Debe comenzar con APP_USR-' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Listar dispositivos en la API de MP Point
    const mpRes = await fetch(
      'https://api.mercadopago.com/point/integration-api/devices?limit=50&offset=0',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      const errMsg = mpData?.message || mpData?.error || 'Error en la API de Mercado Pago';
      return new Response(JSON.stringify({ error: errMsg }), {
        status: mpRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Mapear respuesta a formato simple
    const devices = (mpData?.devices || []).map((d: any) => ({
      id:     d.id,
      model:  d.pos_id ? `${d.id} (POS ${d.pos_id})` : d.id,
      status: d.status || 'unknown',
    }));

    return new Response(JSON.stringify({ devices }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
