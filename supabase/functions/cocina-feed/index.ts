// Edge Function: cocina-feed
// Devuelve comandas activas para una pantalla de cocina autenticada con device token.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function readDeviceToken(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const isDeviceToken = token.length === 64 && /^[0-9a-f]+$/.test(token);
  return isDeviceToken ? token : '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Metodo no permitido' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json(req, { error: 'Servidor mal configurado' }, 500);

    const deviceToken = readDeviceToken(req);
    if (!deviceToken) return json(req, { error: 'Token de dispositivo invalido o ausente' }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { branch_id } = await req.json().catch(() => ({}));
    if (!branch_id) return json(req, { error: 'branch_id es requerido' }, 400);

    const { data: device, error: deviceErr } = await supabaseAdmin
      .from('device_tokens')
      .select('id, branch_id, nombre, activo')
      .eq('token', deviceToken)
      .eq('activo', true)
      .single();

    if (deviceErr || !device) return json(req, { error: 'Token de dispositivo invalido o desactivado' }, 401);
    if (device.branch_id !== branch_id) return json(req, { error: 'El dispositivo no pertenece a esta sucursal' }, 403);

    const { data: turns, error: turnsErr } = await supabaseAdmin
      .from('turns')
      .select('id, branch_id, mesa_num, opened_at, cocina_estado, comanda_lista, enviado_cocina, status, mozo')
      .eq('branch_id', branch_id)
      .eq('status', 'abierta')
      .eq('enviado_cocina', true)
      .order('opened_at', { ascending: true })
      .limit(50);

    if (turnsErr) throw turnsErr;

    const turnIds = (turns || []).map((t: any) => t.id);
    let itemsByTurn = new Map<string, any[]>();
    if (turnIds.length) {
      const { data: items, error: itemsErr } = await supabaseAdmin
        .from('turn_items')
        .select('id, turn_id, menu_item_id, menu_item_name, cantidad, notas')
        .in('turn_id', turnIds)
        .order('created_at', { ascending: true });
      if (itemsErr) throw itemsErr;
      itemsByTurn = new Map();
      for (const item of items || []) {
        const arr = itemsByTurn.get(item.turn_id) || [];
        arr.push(item);
        itemsByTurn.set(item.turn_id, arr);
      }
    }

    return json(req, {
      ok: true,
      device: { id: device.id, nombre: device.nombre },
      comandas: (turns || []).map((turn: any) => ({
        turn,
        items: itemsByTurn.get(turn.id) || [],
      })),
      ts: Date.now(),
    });
  } catch (err) {
    console.error('[cocina-feed]', err);
    return json(req, { error: (err as Error)?.message || 'Error interno' }, 500);
  }
});
