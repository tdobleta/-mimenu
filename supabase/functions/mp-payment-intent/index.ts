// Edge Function: mp-payment-intent
// Crea un payment intent en la terminal MP Point.
// Lee el access_token y device_id desde restaurant_settings (SERVICE_ROLE, bypassea RLS).
// El frontend NO ve las credenciales.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Autenticar caller
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

    // 2. Leer parámetros del body
    const { amount, description, turnId, restaurantId } = await req.json();
    if (!amount || !restaurantId) {
      return new Response(JSON.stringify({ error: 'Faltan amount o restaurantId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (amount < 1) {
      return new Response(JSON.stringify({ error: 'Monto inválido (mínimo $1)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Verificar que el caller pertenece al restaurante
    const { data: membership } = await supabase
      .from('restaurants')
      .select('id, nombre')
      .eq('id', restaurantId)
      .eq('owner_id', user.id)
      .maybeSingle();

    // También aceptar encargados
    let restaurantName = membership?.nombre;
    if (!membership) {
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('rol, restaurant_id')
        .eq('restaurant_id', restaurantId)
        .eq('email', user.email)
        .maybeSingle();
      if (!teamMember) {
        return new Response(JSON.stringify({ error: 'Sin acceso a este restaurante' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: rest } = await supabase.from('restaurants').select('nombre').eq('id', restaurantId).single();
      restaurantName = rest?.nombre || 'Restaurante';
    }

    // 4. Leer credenciales de restaurant_settings
    const { data: settings, error: settingsErr } = await supabase
      .from('restaurant_settings')
      .select('mp_access_token, mp_device_id')
      .eq('restaurant_id', restaurantId)
      .single();

    if (settingsErr || !settings?.mp_access_token || !settings?.mp_device_id) {
      return new Response(JSON.stringify({
        error: 'Terminal de pago no configurada. Ir a Configuración → Terminal de pago.',
      }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Crear payment intent en MP Point API
    const idempotencyKey = `mimenu_${turnId || restaurantId}_${Date.now()}`;
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
          amount,                       // en pesos (no centavos, API de MP usa pesos enteros)
          description: description || `Pago en ${restaurantName}`,
          payment: {
            installments: 1,
            type: 'credit_card',        // la terminal acepta cualquier tarjeta, no importa el tipo aquí
          },
          additional_info: {
            external_reference: `mimenu_${turnId || 'pos'}_${Date.now()}`,
          },
        }),
      },
    );

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      const errMsg = mpData?.message || mpData?.error || 'Error al crear el pago en Mercado Pago';
      return new Response(JSON.stringify({ error: errMsg }), {
        status: mpRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Retornar intent id (el frontend lo usa para polling)
    return new Response(JSON.stringify({
      ok: true,
      intentId: mpData.id,
      state:    mpData.state,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
