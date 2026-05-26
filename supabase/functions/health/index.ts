// supabase/functions/health/index.ts
// Health check endpoint para monitoreo externo (UptimeRobot, BetterUptime, etc.)
//
// NO requiere autenticación — accesible públicamente.
// Verifica que los servicios críticos están operativos.
//
// DEPLOY:
//   supabase functions deploy health
//
// USO en UptimeRobot:
//   URL: https://<project-ref>.supabase.co/functions/v1/health
//   Expected status: 200
//   Expected keyword: "ok"
//
// TEST manual:
//   curl https://<project-ref>.supabase.co/functions/v1/health

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, getCorsHeaders } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  const checks: Record<string, { ok: boolean; msg?: string }> = {};
  let allOk = true;

  // ── Check 1: SUPABASE_SERVICE_ROLE_KEY está configurada ──────────────────────
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  checks.service_role_key = { ok: !!serviceKey };
  if (!serviceKey) allOk = false;

  // ── Check 2: Conectividad con DB ─────────────────────────────────────────────
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey || '');
    // Query minimal que no lee datos de usuarios (solo cuenta restaurants)
    const { error } = await supabaseAdmin
      .from('restaurants')
      .select('id', { count: 'exact', head: true });
    checks.database = { ok: !error, msg: error?.message };
    if (error) allOk = false;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    checks.database = { ok: false, msg };
    allOk = false;
  }

  // ── Check 3: RESEND_API_KEY presente (necesario para emails) ─────────────────
  const resendKey = Deno.env.get('RESEND_API_KEY');
  checks.resend_api_key = { ok: !!resendKey };
  // No falla allOk si Resend no está — es opcional para el POS core

  // ── Resultado ─────────────────────────────────────────────────────────────────
  const status = allOk ? 200 : 503;
  const body = {
    ok:    allOk,
    ts:    new Date().toISOString(),
    checks,
    // Versión de la función — cambiar al hacer deploy
    version: '1.0.0',
  };

  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
});
