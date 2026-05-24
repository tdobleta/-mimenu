-- ============================================================
-- supabase/migrations/20260524000008_fix_rls_email_fallback.sql
-- Sprint 7.1: Eliminar vulnerabilidad de secuestro por email en RLS
--
-- VULNERABILIDAD ELIMINADA:
--   get_user_restaurant_id() tenía un Paso 3 que buscaba:
--     WHERE email = (auth.jwt() ->> 'email') AND user_id IS NULL
--   Un atacante que registrara el mismo email que un mozo existente
--   con user_id = NULL obtenía acceso CRUD completo al restaurante
--   de la víctima (mesas, cajas, stock, credenciales AFIP).
--
-- FIX:
--   Eliminar Paso 3 completamente. Solo se reconoce:
--   - Paso 1: owner_id = auth.uid() (dueño)
--   - Paso 2: team_members.user_id = auth.uid() (miembro confirmado)
--
-- IMPACTO EN USUARIOS EXISTENTES:
--   Mozos que tienen user_id IS NULL en team_members dejan de ver datos.
--   Solución: invitarlos formalmente via Edge Function invite-member
--   ANTES de aplicar esta migración. Consultar la lista con:
--     SELECT email, restaurant_id FROM team_members WHERE user_id IS NULL;
--
-- APLICAR:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_restaurant_id()
RETURNS uuid AS $$
DECLARE
  v_restaurant_id uuid;
BEGIN
  -- Paso 1: el usuario es dueño directo del restaurante
  SELECT id INTO v_restaurant_id
  FROM restaurants
  WHERE owner_id = auth.uid()
  LIMIT 1;
  IF v_restaurant_id IS NOT NULL THEN RETURN v_restaurant_id; END IF;

  -- Paso 2: el usuario es miembro del equipo con user_id confirmado
  -- (user_id se setea al aceptar la invitación via invite-member Edge Function)
  SELECT restaurant_id INTO v_restaurant_id
  FROM team_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  RETURN v_restaurant_id;

  -- PASO 3 ELIMINADO INTENCIONALMENTE:
  -- El fallback por email con user_id IS NULL era un vector de secuestro
  -- de tenant. Un atacante podía registrarse con el email de un mozo
  -- existente y obtener acceso completo al restaurante de otro dueño.
  -- No se restaura bajo ninguna circunstancia.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- -- Verificar que la función ya no tiene referencia a user_id IS NULL:
-- SELECT prosrc FROM pg_proc WHERE proname = 'get_user_restaurant_id';
-- → No debe contener "user_id IS NULL"
--
-- -- Ver mozos afectados que necesitan ser re-invitados:
-- SELECT email, restaurant_id, created_at
-- FROM team_members
-- WHERE user_id IS NULL
-- ORDER BY created_at;
-- → Invitar a cada uno via Configuración → Equipo → Invitar miembro
