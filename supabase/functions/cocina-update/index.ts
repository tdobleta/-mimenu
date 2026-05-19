// supabase/functions/cocina-update/index.ts
// Edge Function para que la pantalla pública de cocina pueda actualizar estados.
// Usa SERVICE_ROLE_KEY porque la cocina pública no tiene sesión de usuario.
// Valida branch_id + turn_id para evitar actualizaciones arbitrarias.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://mimenuar.netlify.app',
  'Access-Control-Allow-Headers': 'content-type',
};

// Permitir también localhost en desarrollo
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  if (origin === 'https://mimenuar.netlify.app' || origin.startsWith('http://localhost:')) {
    return { ...CORS, 'Access-Control-Allow-Origin': origin };
  }
  return CORS;
}

const VALID_ESTADOS = ['nueva', 'preparando', 'lista'];

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { turn_id, branch_id, cocina_estado, comanda_lista } = await req.json();

    // Validación de inputs
    if (!turn_id || !branch_id) {
      return new Response(JSON.stringify({ error: 'turn_id y branch_id son requeridos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (cocina_estado && !VALID_ESTADOS.includes(cocina_estado)) {
      return new Response(JSON.stringify({ error: 'cocina_estado inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verificar que el turn existe y pertenece a esa branch (previene actualizaciones arbitrarias)
    const { data: turn, error: findError } = await supabaseAdmin
      .from('turns')
      .select('id, branch_id, status')
      .eq('id', turn_id)
      .eq('branch_id', branch_id)
      .eq('status', 'abierta')
      .single();

    if (findError || !turn) {
      return new Response(JSON.stringify({ error: 'Turno no encontrado o ya cerrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Construir update
    const updateData: Record<string, unknown> = {};
    if (cocina_estado) updateData.cocina_estado = cocina_estado;
    if (typeof comanda_lista === 'boolean') updateData.comanda_lista = comanda_lista;

    if (Object.keys(updateData).length === 0) {
      return new Response(JSON.stringify({ error: 'Nada que actualizar' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from('turns')
      .update(updateData)
      .eq('id', turn_id);

    if (updateError) {
      console.error('[cocina-update]', updateError);
      return new Response(JSON.stringify({ error: 'Error al actualizar' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[cocina-update]', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
