// supabase/functions/cocina-update/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VALID_ESTADOS = ['nueva', 'preparando', 'lista'];

function getCorsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const allowed = origin === 'https://mimenuar.netlify.app' || origin.startsWith('http://localhost:');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://mimenuar.netlify.app',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function getServiceRoleKey() {
  // Try sources in order — LEGACY JWT key is the one that bypasses RLS
  const legacyCustom = Deno.env.get('SERVICE_ROLE_KEY_LEGACY');
  if (legacyCustom) return legacyCustom;

  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;

  const v2 = Deno.env.get('SERVICE_ROLE_KEY_V2');
  if (v2) return v2;

  // Try SUPABASE_SECRET_KEYS (JSON format)
  try {
    const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS');
    if (secretKeysJson) {
      const parsed = JSON.parse(secretKeysJson);
      // It's a JSON dict of key_name -> key_value
      const firstKey = Object.values(parsed)[0];
      if (firstKey) return firstKey;
    }
  } catch {}

  return null;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const serviceKey = getServiceRoleKey();
    
    // Log which key source we're using (for debugging)
    const keySource = Deno.env.get('SERVICE_ROLE_KEY_LEGACY') ? 'LEGACY_CUSTOM'
      : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'LEGACY_DEFAULT'
      : Deno.env.get('SERVICE_ROLE_KEY_V2') ? 'V2'
      : Deno.env.get('SUPABASE_SECRET_KEYS') ? 'SECRET_KEYS_JSON'
      : 'NONE';
    console.log(`[cocina-update] Using key source: ${keySource}`);

    if (!serviceKey) {
      console.error('[cocina-update] No service role key found in any source');
      return new Response(JSON.stringify({ error: 'Server misconfigured — no service key', keySource }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { turn_id, branch_id, cocina_estado, comanda_lista } = await req.json();

    if (!turn_id || !branch_id) {
      return new Response(JSON.stringify({ error: 'turn_id y branch_id son requeridos' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (cocina_estado && !VALID_ESTADOS.includes(cocina_estado)) {
      return new Response(JSON.stringify({ error: 'cocina_estado inválido' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      serviceKey,
    );

    // Verify turn exists and belongs to branch
    const { data: turn, error: findError } = await supabaseAdmin
      .from('turns')
      .select('id, branch_id, status')
      .eq('id', turn_id)
      .eq('branch_id', branch_id)
      .eq('status', 'abierta')
      .single();

    if (findError || !turn) {
      console.error('[cocina-update] Turn not found:', { turn_id, branch_id, findError: findError?.message, keySource });
      return new Response(JSON.stringify({ 
        error: 'Turno no encontrado', 
        debug: { findError: findError?.message, keySource }
      }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Build update
    const updateData = {};
    if (cocina_estado) updateData.cocina_estado = cocina_estado;
    if (typeof comanda_lista === 'boolean') updateData.comanda_lista = comanda_lista;

    if (Object.keys(updateData).length === 0) {
      return new Response(JSON.stringify({ error: 'Nada que actualizar' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from('turns')
      .update(updateData)
      .eq('id', turn_id);

    if (updateError) {
      console.error('[cocina-update] Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Error al actualizar', debug: updateError.message }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[cocina-update] Unhandled:', err);
    return new Response(JSON.stringify({ error: 'Error interno', debug: err.message }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
