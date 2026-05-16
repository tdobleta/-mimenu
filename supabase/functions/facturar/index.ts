// supabase/functions/chat/index.ts
// Edge Function para el chatbot de mimenú.
// La Anthropic API key vive acá — nunca en el browser.
// Rate limiting: 20 mensajes/hora por usuario.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://mimenuar.netlify.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UPSTASH_URL   = Deno.env.get('UPSTASH_REDIS_REST_URL')!;
const UPSTASH_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!;

async function checkRateLimit(userId: string) {
  const key = `ratelimit:chat:${userId}`;
  try {
    const res = await fetch(`${UPSTASH_URL}/incr/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const { result: count } = await res.json();
    if (count === 1) {
      await fetch(`${UPSTASH_URL}/expire/${key}/3600`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      });
    }
    return { allowed: count <= 20, remaining: Math.max(0, 20 - count) };
  } catch {
    return { allowed: true, remaining: 20 };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // 1. Autenticar usuario
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // 2. Rate limiting
    const { allowed, remaining } = await checkRateLimit(user.id);
    if (!allowed) return new Response(JSON.stringify({ error: 'Límite de mensajes alcanzado. Reintentá en 1 hora.' }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': '3600' } });

    // 3. Parsear mensajes
    const { messages, system } = await req.json();
    if (!messages?.length) return new Response(JSON.stringify({ error: 'Sin mensajes' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // 4. Llamar a Anthropic
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: system || 'Sos el asistente de mimenú, un sistema POS para restaurantes. Respondé en español, de forma concisa y útil.',
        messages,
      }),
    });

    const data = await anthropicRes.json();

    return new Response(JSON.stringify({
      content: data.content,
      remaining_messages: remaining,
    }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[chat]', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
