// supabase/functions/cocina-update/index.ts
//
// Actualiza cocina_estado y/o comanda_lista en un turn.
// Requiere autenticación mediante device token (32-byte hex, 64 chars).
//
// AUTENTICACIÓN:
//   El header Authorization debe contener el device token del dispositivo:
//     Authorization: Bearer {device_token_hex}
//   El token se valida contra la tabla device_tokens (branch_id + activo=true).
//
// SEGURIDAD:
//   - Usa SUPABASE_SERVICE_ROLE_KEY (env var estándar de Supabase) para bypassear RLS.
//   - Valida que el turn pertenece al branch del device token (defensa en profundidad).
//   - El anon key (que era público) ya NO funciona — solo device tokens válidos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VALID_ESTADOS = ['nueva', 'preparando', 'lista'];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowed =
    origin === 'https://mimenuar.netlify.app' ||
    origin.startsWith('http://localhost:');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://mimenuar.netlify.app',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // ── 1. Service role key ─────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      console.error('[cocina-update] SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados');
      return new Response(
        JSON.stringify({ error: 'Servidor mal configurado — contactar soporte' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // ── 2. Validar device token ─────────────────────────────────────────
    // Authorization: Bearer {token_hex_64_chars}
    // El token tiene exactamente 64 caracteres hex (32 bytes = encode(gen_random_bytes(32),'hex'))
    // Los JWTs tienen puntos (header.payload.signature), los device tokens no.
    const authHeader  = req.headers.get('Authorization') || '';
    const deviceToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    // Formato válido: 64 caracteres hexadecimales, sin puntos (no es un JWT)
    const isDeviceToken = deviceToken.length === 64 && /^[0-9a-f]+$/.test(deviceToken);

    if (!isDeviceToken) {
      console.warn('[cocina-update] Token inválido o ausente — esperando device token hex64');
      return new Response(
        JSON.stringify({ error: 'Token de dispositivo inválido o ausente. Configurá el dispositivo desde Configuración → Cocina.' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // Lookup del device token en la tabla (índice en token WHERE activo=true)
    const { data: device, error: tokenError } = await supabaseAdmin
      .from('device_tokens')
      .select('id, branch_id, nombre, activo')
      .eq('token', deviceToken)
      .eq('activo', true)
      .single();

    if (tokenError || !device) {
      console.warn('[cocina-update] Token no encontrado o desactivado:', deviceToken.slice(0, 8) + '...');
      return new Response(
        JSON.stringify({ error: 'Token de dispositivo inválido o desactivado' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // ── 3. Parsear body ─────────────────────────────────────────────────
    const { turn_id, branch_id, cocina_estado, comanda_lista } = await req.json();

    if (!turn_id || !branch_id) {
      return new Response(
        JSON.stringify({ error: 'turn_id y branch_id son requeridos' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // El branch_id del request debe coincidir con el branch_id del device token.
    // Previene que un display de cocina de otro restaurante afecte el nuestro.
    if (branch_id !== device.branch_id) {
      console.warn('[cocina-update] branch_id mismatch:', { requestBranch: branch_id, deviceBranch: device.branch_id });
      return new Response(
        JSON.stringify({ error: 'El dispositivo no tiene permiso sobre esta sucursal' }),
        { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    if (cocina_estado && !VALID_ESTADOS.includes(cocina_estado)) {
      return new Response(
        JSON.stringify({ error: `cocina_estado inválido. Válidos: ${VALID_ESTADOS.join(', ')}` }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // ── 4. Verificar que el turn existe, pertenece al branch y está abierto ──
    const { data: turn, error: findError } = await supabaseAdmin
      .from('turns')
      .select('id, branch_id, status')
      .eq('id', turn_id)
      .eq('branch_id', branch_id)
      .eq('status', 'abierta')
      .single();

    if (findError || !turn) {
      console.warn('[cocina-update] Turn no encontrado:', { turn_id, branch_id, error: findError?.message });
      return new Response(
        JSON.stringify({ error: 'Turno no encontrado o ya cerrado' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // ── 5. Construir y aplicar el update ───────────────────────────────
    const updateData: Record<string, unknown> = {};
    if (cocina_estado) updateData.cocina_estado = cocina_estado;
    if (typeof comanda_lista === 'boolean') updateData.comanda_lista = comanda_lista;

    if (Object.keys(updateData).length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nada que actualizar' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // Doble filtro id + branch_id: aunque el device token ya validó el branch,
    // este WHERE extra previene any accidental update cross-branch.
    const { error: updateError } = await supabaseAdmin
      .from('turns')
      .update(updateData)
      .eq('id', turn_id)
      .eq('branch_id', branch_id);

    if (updateError) {
      console.error('[cocina-update] Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Error al actualizar', debug: updateError.message }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[cocina-update] OK — device="${device.nombre}" turn=${turn_id.slice(0,8)}... estado=${cocina_estado}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[cocina-update] Unhandled:', err);
    return new Response(
      JSON.stringify({ error: 'Error interno', debug: (err as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
