// supabase/functions/invite-member/index.ts
// Edge Function para invitar trabajadores al restaurante.
//
// PROBLEMA QUE RESUELVE:
//   EquipoTab.jsx solo crea un registro en team_members pero NO crea
//   una cuenta Supabase Auth → el trabajador no puede hacer login.
//   Esta función usa service_role para crear la cuenta Auth y envía
//   un magic link seguro vía Resend.
//
// SECRETS necesarios (Dashboard → Project Settings → Edge Functions → Secrets):
//   RESEND_API_KEY = re_xxxxxxxx
//   (SUPABASE_SERVICE_ROLE_KEY y SUPABASE_URL ya están disponibles automáticamente)
//
// DEPLOY:
//   supabase functions deploy invite-member
//
// FLUJO:
//   1. Dueño ingresa email + nombre + rol en Configuración → Equipo
//   2. Front llama a esta función con Authorization: Bearer <session.access_token>
//   3. Función verifica que el caller es dueño/encargado del restaurante
//   4. Genera un magic link de invitación (admin.generateLink type:'invite', 24h)
//   5. Crea/actualiza team_members
//   6. Envía el link por email vía Resend (NO se envía contraseña en texto plano)
//   7. El trabajador hace clic → elige su propia contraseña → acceso activo
//   8. Devuelve { ok: true }
//
// SEGURIDAD:
//   - Nunca se genera ni almacena una contraseña en texto plano
//   - El magic link expira en 24h (configurable en Supabase Auth settings)
//   - El usuario elige su propia contraseña al activar la cuenta

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) => jsonResponse(req, body, status);
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    // ── 1. Inicializar cliente admin ──────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── 2. Autenticar el caller ───────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: 'No autorizado' }, 401);

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) return json({ error: 'No autorizado' }, 401);

    // ── 3. Leer payload ───────────────────────────────────────────────────────
    const { email, nombre, rol, restaurantId } = await req.json();
    if (!email || !nombre || !rol || !restaurantId) {
      return json({ error: 'Faltan campos: email, nombre, rol, restaurantId' }, 400);
    }
    const emailClean = email.trim().toLowerCase();
    const rolesValidos = ['Encargado', 'Mozo', 'Cocinero'];
    if (!rolesValidos.includes(rol)) {
      return json({ error: `Rol inválido. Debe ser uno de: ${rolesValidos.join(', ')}` }, 400);
    }

    // ── 4. Verificar que el caller pertenece al restaurante ───────────────────
    const { data: restaurant } = await supabaseAdmin
      .from('restaurants')
      .select('id, nombre, owner_id')
      .eq('id', restaurantId)
      .single();

    if (!restaurant) return json({ error: 'Restaurante no encontrado' }, 404);

    // Verificar permisos solo por user_id. No usar email como criterio:
    // una cuenta nueva con el mismo email de un miembro legacy no debe ganar acceso.
    const esOwner = restaurant.owner_id === caller.id;
    // O encargado confirmado por user_id.
    let esEncargado = false;
    if (!esOwner) {
      const { data: callerMember } = await supabaseAdmin
        .from('team_members')
        .select('rol')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', caller.id)
        .single();
      esEncargado = callerMember?.rol === 'Encargado';
    }
    if (!esOwner && !esEncargado) return json({ error: 'Sin permiso' }, 403);

    // ── 5. Verificar que el email no está ya en el equipo ─────────────────────
    const { data: existingMember } = await supabaseAdmin
      .from('team_members')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('email', emailClean)
      .maybeSingle();

    if (existingMember) {
      return json({ error: 'Este email ya está en el equipo de este restaurante' }, 409);
    }

    // ── 6. Generar magic link de invitación (sin contraseña en texto plano) ──
    // admin.generateLink type:'invite' crea el usuario si no existe,
    // o envía un nuevo link de activación si ya existe.
    // El link expira en 24h (configurable en Supabase Auth settings).
    // El trabajador hace clic → elige su propia contraseña → acceso activo.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: emailClean,
      options: {
        redirectTo: 'https://app.mimenu.ar',
      },
    });
    if (linkError) throw linkError;

    const inviteLink = linkData.properties?.action_link;
    if (!inviteLink) throw new Error('No se pudo generar el link de invitación');

    // Obtener el user_id del usuario creado/encontrado
    const authUserId: string = linkData.user?.id || '';

    // ── 7. Crear registro en team_members ─────────────────────────────────────
    const { data: teamMember, error: memberError } = await supabaseAdmin
      .from('team_members')
      .upsert(
        { restaurant_id: restaurantId, email: emailClean, nombre: nombre.trim(), rol, user_id: authUserId || null },
        { onConflict: 'restaurant_id,email' }
      )
      .select('id, restaurant_id, email, nombre, rol, user_id')
      .single();
    if (memberError) throw memberError;

    // ── 8. Enviar email con magic link (Resend) ───────────────────────────────
    // IMPORTANTE: Solo se envía el link — nunca credenciales en texto plano.
    // El link expira en 24h. Si el link venció, el dueño puede re-invitar.
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'mimenú <noreply@mimenu.app>',
          to: emailClean,
          subject: `Tu acceso a mimenú — ${restaurant.nombre}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#111827">
              <h2 style="color:#1D9E75;margin-bottom:8px">¡Hola, ${nombre.trim()}!</h2>
              <p style="color:#374151;margin-bottom:16px">
                <strong>${restaurant.nombre}</strong> te invitó como <strong>${rol}</strong> en mimenú POS.
              </p>
              <p style="color:#374151;margin-bottom:16px">
                Hacé clic en el botón para activar tu cuenta y elegir tu contraseña.
                El link es válido por <strong>24 horas</strong>.
              </p>
              <p style="margin-bottom:20px;text-align:center">
                <a href="${inviteLink}" style="display:inline-block;background:#1D9E75;color:white;padding:13px 28px;border-radius:8px;font-weight:600;text-decoration:none;font-size:15px">
                  Activar mi cuenta →
                </a>
              </p>
              <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px 16px;margin-bottom:16px">
                <p style="margin:0;font-size:12px;color:#6B7280">
                  Si el botón no funciona, copiá este link en tu navegador:<br/>
                  <span style="color:#1D9E75;word-break:break-all;font-size:11px">${inviteLink}</span>
                </p>
              </div>
              <p style="color:#9CA3AF;font-size:12px;margin:0">
                Si no esperabas esta invitación, podés ignorar este email.
              </p>
            </div>
          `,
        }),
      });
    } else {
      // Si no hay RESEND_API_KEY configurada, igual funciona — solo no envía email
      console.warn('[invite-member] RESEND_API_KEY no configurada — no se envió email');
    }

    return json({
      ok: true,
      mensaje: `Invitación enviada a ${emailClean}${resendKey ? '. Revisá el email para activar la cuenta.' : ' (sin email, Resend no configurado)'}`,
      member: teamMember,
      // En desarrollo, devolver el link para testear sin email
      ...(Deno.env.get('SUPABASE_ENV') === 'local' ? { inviteLink } : {}),
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[invite-member] Error:', msg);
    return json({ error: msg || 'Error interno' }, 500);
  }
});
