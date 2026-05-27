// Edge Function: staff-pin-auth
// Lista staff operativos y valida/gestiona PINs sin exponerlos al navegador.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, serverErrorResponse } from '../_shared/http.ts';

const VALID_ROLES = ['Mozo', 'Encargado', 'Cocinero'];
const MAX_PIN_FAILURES = 5;
const PIN_LOCK_SECONDS = 5 * 60;

function isPin(value: unknown) {
  return typeof value === 'string' && /^[0-9]{4}$/.test(value);
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function clientIpHashInput(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const firstForwarded = forwarded.split(',')[0]?.trim();
  return firstForwarded
    || req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || 'unknown';
}

async function hashPin(pin: string) {
  const salt = randomHex(16);
  const hash = await sha256Hex(`${salt}:${pin}`);
  return `sha256:${salt}:${hash}`;
}

async function verifyHash(pin: string, encoded: string | null | undefined) {
  if (!encoded) return false;
  const parts = encoded.split(':');
  if (parts.length !== 3 || parts[0] !== 'sha256') return false;
  const [, salt, expected] = parts;
  const actual = await sha256Hex(`${salt}:${pin}`);
  return actual === expected;
}

async function getBranchAccess(supabase: any, user: any, branchId: string) {
  const { data: branch } = await supabase
    .from('branches')
    .select('id, restaurant_id')
    .eq('id', branchId)
    .maybeSingle();
  if (!branch) return null;

  const { data: owned } = await supabase
    .from('restaurants')
    .select('id')
    .eq('id', branch.restaurant_id)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (owned) return { branch, canManage: true };

  const { data: member } = await supabase
    .from('team_members')
    .select('rol')
    .eq('restaurant_id', branch.restaurant_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) return null;
  return { branch, canManage: member.rol === 'Encargado' };
}

function publicStaff(row: any) {
  return {
    id: row.id,
    nombre: row.nombre,
    rol: row.rol,
    activo: row.activo,
    branch_id: row.branch_id,
    created_at: row.created_at,
  };
}

function missingPinHash(error: any) {
  const msg = String(error?.message || error?.details || '');
  return msg.includes('pin_hash') || (msg.includes('column') && msg.includes('does not exist'));
}

async function buildPinAttemptScope(req: Request, user: any, branchId: string) {
  const ip = clientIpHashInput(req);
  return sha256Hex(`staff-pin:${user.id}:${branchId}:${ip}`);
}

async function checkLockout(supabase: any, branchId: string, staffId: string, userId: string, ipHash: string) {
  const { data, error } = await supabase.rpc('check_staff_pin_lockout', {
    p_branch_id: branchId,
    p_staff_pin_id: staffId,
    p_actor_user_id: userId,
    p_ip_hash: ipHash,
  });
  if (error) throw error;
  return data || { locked: false };
}

async function recordFailure(supabase: any, branchId: string, staffId: string, userId: string, ipHash: string) {
  const { data, error } = await supabase.rpc('record_staff_pin_failure', {
    p_branch_id: branchId,
    p_staff_pin_id: staffId,
    p_actor_user_id: userId,
    p_ip_hash: ipHash,
    p_max_attempts: MAX_PIN_FAILURES,
    p_lock_seconds: PIN_LOCK_SECONDS,
  });
  if (error) throw error;
  return data || { locked: false, remaining_attempts: MAX_PIN_FAILURES - 1 };
}

async function clearFailures(supabase: any, branchId: string, staffId: string, userId: string, ipHash: string) {
  const { error } = await supabase.rpc('clear_staff_pin_attempts', {
    p_branch_id: branchId,
    p_staff_pin_id: staffId,
    p_actor_user_id: userId,
    p_ip_hash: ipHash,
  });
  if (error) throw error;
}

function pinLockedResponse(req: Request, lockout: any) {
  const retryAfter = Number(lockout?.retry_after_seconds || PIN_LOCK_SECONDS);
  return jsonResponse(req, {
    error: 'PIN bloqueado temporalmente por demasiados intentos. Espera unos minutos y volve a intentar.',
    retryAfterSeconds: retryAfter,
    lockedUntil: lockout?.locked_until || null,
  }, 429, { 'Retry-After': String(retryAfter) });
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) => jsonResponse(req, body, status);
  if (req.method === 'OPTIONS') return corsResponse(req);
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: 'No autorizado' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Sesion invalida' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');
    const branchId = body.branchId || body.branch_id;
    if (!branchId) return json({ error: 'branchId requerido' }, 400);

    const access = await getBranchAccess(supabase, user, branchId);
    if (!access) return json({ error: 'Sin acceso a esta sucursal' }, 403);

    if (action === 'list') {
      const { data, error } = await supabase
        .from('staff_pins')
        .select('id, branch_id, nombre, rol, activo, created_at')
        .eq('branch_id', branchId)
        .order('nombre');
      if (error) throw error;
      return json({ ok: true, staff: (data || []).map(publicStaff) });
    }

    if (action === 'verify') {
      const staffId = body.staffId || body.staff_id;
      const pin = String(body.pin || '');
      if (!staffId || !isPin(pin)) return json({ error: 'PIN invalido' }, 400);

      let { data: member, error } = await supabase
        .from('staff_pins')
        .select('id, branch_id, nombre, rol, activo, pin, pin_hash')
        .eq('id', staffId)
        .eq('branch_id', branchId)
        .eq('activo', true)
        .maybeSingle();
      const hashColumnAvailable = !missingPinHash(error);
      if (missingPinHash(error)) {
        const retry = await supabase
          .from('staff_pins')
          .select('id, branch_id, nombre, rol, activo, pin')
          .eq('id', staffId)
          .eq('branch_id', branchId)
          .eq('activo', true)
          .maybeSingle();
        member = retry.data;
        error = retry.error;
      }
      if (error) throw error;
      if (!member) return json({ error: 'Mozo no encontrado o inactivo' }, 404);

      const ipHash = await buildPinAttemptScope(req, user, branchId);
      const lockout = await checkLockout(supabase, branchId, member.id, user.id, ipHash);
      if (lockout?.locked) return pinLockedResponse(req, lockout);

      const ok = await verifyHash(pin, member.pin_hash) || (member.pin === pin);
      if (!ok) {
        const failure = await recordFailure(supabase, branchId, member.id, user.id, ipHash);
        if (failure?.locked) return pinLockedResponse(req, failure);
        return json({
          error: 'PIN incorrecto',
          remainingAttempts: Number(failure?.remaining_attempts ?? 0),
        }, 401);
      }

      await clearFailures(supabase, branchId, member.id, user.id, ipHash);

      if (hashColumnAvailable && (!member.pin_hash || member.pin)) {
        const nextHash = await hashPin(pin);
        await supabase
          .from('staff_pins')
          .update({ pin_hash: nextHash, pin: null })
          .eq('id', member.id);
      }

      return json({ ok: true, staff: publicStaff(member) });
    }

    if (!access.canManage) return json({ error: 'Sin permiso para gestionar PINs' }, 403);

    if (action === 'save') {
      const staffId = body.staffId || body.staff_id || null;
      const nombre = String(body.nombre || '').trim();
      const rol = String(body.rol || 'Mozo');
      const pin = String(body.pin || '');

      if (!nombre) return json({ error: 'Nombre requerido' }, 400);
      if (!VALID_ROLES.includes(rol)) return json({ error: 'Rol invalido' }, 400);
      if (!staffId && !isPin(pin)) return json({ error: 'PIN de 4 digitos requerido' }, 400);
      if (staffId && pin && !isPin(pin)) return json({ error: 'PIN invalido' }, 400);

      const payload: Record<string, unknown> = { branch_id: branchId, nombre, rol, activo: true };
      if (pin) {
        payload.pin_hash = await hashPin(pin);
        payload.pin = null;
      }

      const query = staffId
        ? supabase.from('staff_pins').update(payload).eq('id', staffId).eq('branch_id', branchId)
        : supabase.from('staff_pins').insert(payload);

      let { data, error } = await query
        .select('id, branch_id, nombre, rol, activo, created_at')
        .single();
      if (missingPinHash(error) && pin) {
        const legacyPayload = { branch_id: branchId, nombre, rol, activo: true, pin };
        const legacyQuery = staffId
          ? supabase.from('staff_pins').update(legacyPayload).eq('id', staffId).eq('branch_id', branchId)
          : supabase.from('staff_pins').insert(legacyPayload);
        const retry = await legacyQuery
          .select('id, branch_id, nombre, rol, activo, created_at')
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;
      return json({ ok: true, staff: publicStaff(data) });
    }

    if (action === 'toggle') {
      const staffId = body.staffId || body.staff_id;
      const activo = Boolean(body.activo);
      if (!staffId) return json({ error: 'staffId requerido' }, 400);
      const { data, error } = await supabase
        .from('staff_pins')
        .update({ activo })
        .eq('id', staffId)
        .eq('branch_id', branchId)
        .select('id, branch_id, nombre, rol, activo, created_at')
        .single();
      if (error) throw error;
      return json({ ok: true, staff: publicStaff(data) });
    }

    if (action === 'delete') {
      const staffId = body.staffId || body.staff_id;
      if (!staffId) return json({ error: 'staffId requerido' }, 400);
      const { error } = await supabase
        .from('staff_pins')
        .delete()
        .eq('id', staffId)
        .eq('branch_id', branchId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Accion invalida' }, 400);
  } catch (err: any) {
    return serverErrorResponse(req, 'staff-pin-auth', err, 'No se pudo procesar la operacion de staff. Reintenta o contacta soporte.');
  }
});
