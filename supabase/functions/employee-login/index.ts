import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@3.0.3';
import { corsResponse, jsonResponse, serverErrorResponse } from '../_shared/http.ts';

const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;
const MAX_LOGIN_FAILURES = 5;
const LOCK_SECONDS = 900;
const USERNAME_RE = /^[a-z0-9._-]{1,60}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

// Real bcrypt hash generated locally — used solely for timing equalization
// when the target user/restaurant does not exist, so bcrypt.compare always
// runs regardless of lookup outcome.
const DUMMY_BCRYPT_HASH =
  '$2b$10$P.Z1ZGEe3db.knYvNSe6Bu6UGGBtyfw49FqJVIMK4EqlgQYa3YJ9W';

// ── JWT helpers (HS256 via Web Crypto) ──────────────────────

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const segments =
    base64url(encodeUtf8(JSON.stringify(header))) +
    '.' +
    base64url(encodeUtf8(JSON.stringify(payload)));

  const key = await crypto.subtle.importKey(
    'raw',
    encodeUtf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encodeUtf8(segments));
  return segments + '.' + base64url(sig);
}

// ── Main handler ────────────────────────────────────────────

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    jsonResponse(req, body, status, headers);

  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const jwtSecret = Deno.env.get('EMPLOYEE_JWT_SECRET');
  if (!jwtSecret) {
    console.error('[employee-login] EMPLOYEE_JWT_SECRET is not configured');
    return json(
      { error: 'Error interno. Contacta soporte si el problema continua.', requestId: crypto.randomUUID() },
      500,
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action !== 'login') {
      return json({ error: 'Acción no válida' }, 400);
    }

    const restaurantCode = body.restaurant_code;
    const username = body.username;
    const password = body.password;

    if (
      typeof restaurantCode !== 'string' || !restaurantCode.trim() ||
      typeof username !== 'string' || !username.trim() ||
      typeof password !== 'string' || !password
    ) {
      return json({ error: 'Campos requeridos: restaurant_code, username, password' }, 400);
    }

    const slug = restaurantCode.trim().toLowerCase();
    const uname = username.trim().toLowerCase();

    if (!SLUG_RE.test(slug) || !USERNAME_RE.test(uname)) {
      return json({ error: 'Credenciales inválidas' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Resolve restaurant by slug ──────────────────────────

    const { data: restaurant, error: slugErr } = await supabase
      .from('restaurants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (slugErr) throw slugErr;

    if (!restaurant) {
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      return json({ error: 'Credenciales inválidas' }, 401);
    }

    // ── Rate-limit check ────────────────────────────────────

    const scope = `${restaurant.id}:${uname}`;

    const { data: lockout, error: lockErr } = await supabase.rpc(
      'check_employee_login_lockout',
      { p_scope: scope },
    );
    if (lockErr) throw lockErr;

    if (lockout?.locked) {
      const retryAfter = Number(lockout.retry_after_seconds || LOCK_SECONDS);
      return json(
        {
          error: 'Demasiados intentos. Esperá unos minutos.',
          retryAfterSeconds: retryAfter,
        },
        429,
        { 'Retry-After': String(retryAfter) },
      );
    }

    // ── Look up employee ────────────────────────────────────

    const { data: employee, error: empErr } = await supabase
      .from('employee_logins')
      .select('id, restaurant_id, username, password_hash, nombre, rol, permisos, activo')
      .eq('restaurant_id', restaurant.id)
      .eq('activo', true)
      .eq('username', uname)
      .maybeSingle();

    if (empErr) throw empErr;

    if (!employee) {
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      await supabase.rpc('record_employee_login_failure', {
        p_scope: scope,
        p_max_failures: MAX_LOGIN_FAILURES,
        p_lock_seconds: LOCK_SECONDS,
      });
      return json({ error: 'Credenciales inválidas' }, 401);
    }

    // ── Verify password ─────────────────────────────────────

    const passwordValid = await bcrypt.compare(password, employee.password_hash);

    if (!passwordValid) {
      await supabase.rpc('record_employee_login_failure', {
        p_scope: scope,
        p_max_failures: MAX_LOGIN_FAILURES,
        p_lock_seconds: LOCK_SECONDS,
      });
      return json({ error: 'Credenciales inválidas' }, 401);
    }

    // ── Success ─────────────────────────────────────────────

    await supabase.rpc('clear_employee_login_attempts', { p_scope: scope });

    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      {
        iss: 'mimenu',
        aud: 'mimenu-employee',
        typ: 'employee_session',
        sub: employee.id,
        restaurant_id: employee.restaurant_id,
        username: employee.username,
        nombre: employee.nombre,
        rol: employee.rol,
        permisos: employee.permisos,
        iat: now,
        exp: now + TOKEN_LIFETIME_SECONDS,
      },
      jwtSecret,
    );

    return json({
      ok: true,
      token,
      employee: {
        employee_id: employee.id,
        restaurant_id: employee.restaurant_id,
        username: employee.username,
        nombre: employee.nombre,
        rol: employee.rol,
        permisos: employee.permisos,
      },
    });
  } catch (err) {
    return serverErrorResponse(req, 'employee-login', err);
  }
});
