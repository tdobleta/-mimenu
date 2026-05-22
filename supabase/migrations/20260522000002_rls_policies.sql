-- ============================================================
-- supabase/migrations/20260522000002_rls_policies.sql
-- Row Level Security completo para mimenú POS (multi-tenant)
--
-- INSTRUCCIONES DE APLICACIÓN:
--   1. Supabase Dashboard → SQL Editor → pegar y ejecutar
--   2. Verificar con las queries del final
--
-- DISEÑO:
--   - Usuarios autenticados: acceso solo a datos de su restaurante
--   - Anónimos: SELECT en turns/turn_items (para display público de cocina)
--   - Edge Functions con service_role: bypasean RLS (sin cambios necesarios)
--   - cerrar_mesa_atomico SECURITY DEFINER: bypasea RLS (correcto)
-- ============================================================


-- ── 1. ACTUALIZAR get_user_restaurant_id ─────────────────────────────────
--    Agrega fallback por email para registros legacy (user_id = NULL)

CREATE OR REPLACE FUNCTION get_user_restaurant_id()
RETURNS uuid AS $$
DECLARE
  v_restaurant_id uuid;
BEGIN
  -- Paso 1: usuario es dueño del restaurante
  SELECT id INTO v_restaurant_id
  FROM restaurants
  WHERE owner_id = auth.uid()
  LIMIT 1;
  IF v_restaurant_id IS NOT NULL THEN RETURN v_restaurant_id; END IF;

  -- Paso 2: usuario es miembro del equipo (por user_id — vía invite-member)
  SELECT restaurant_id INTO v_restaurant_id
  FROM team_members
  WHERE user_id = auth.uid()
  LIMIT 1;
  IF v_restaurant_id IS NOT NULL THEN RETURN v_restaurant_id; END IF;

  -- Paso 3: fallback por email (registros previos a invite-member con user_id = NULL)
  SELECT restaurant_id INTO v_restaurant_id
  FROM team_members
  WHERE email = (auth.jwt() ->> 'email')
    AND user_id IS NULL
  LIMIT 1;

  RETURN v_restaurant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 2. HELPER: verifica si el usuario posee una sucursal ─────────────────

CREATE OR REPLACE FUNCTION user_owns_branch(p_branch_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = p_branch_id
      AND b.restaurant_id = get_user_restaurant_id()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- ── 3. HABILITAR RLS EN TODAS LAS TABLAS ─────────────────────────────────

ALTER TABLE restaurants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_shifts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE turns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE turn_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_recipes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_precios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_egresos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts           ENABLE ROW LEVEL SECURITY;
-- stock_ingresos: ya tiene ENABLE (del migration anterior), se replican policies


-- ── 4. POLÍTICAS: restaurants ─────────────────────────────────────────────
-- Dueño: CRUD completo de su restaurante
-- Trabajadores: solo SELECT (necesitan ver nombre, config, etc.)

DROP POLICY IF EXISTS "restaurants_owner"       ON restaurants;
DROP POLICY IF EXISTS "restaurants_member_read" ON restaurants;

CREATE POLICY "restaurants_owner" ON restaurants
  FOR ALL TO authenticated
  USING     (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "restaurants_member_read" ON restaurants
  FOR SELECT TO authenticated
  USING (id = get_user_restaurant_id());


-- ── 5. POLÍTICAS: branches ────────────────────────────────────────────────

DROP POLICY IF EXISTS "branches_restaurant" ON branches;

CREATE POLICY "branches_restaurant" ON branches
  FOR ALL TO authenticated
  USING     (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());


-- ── 6. POLÍTICAS: team_members ────────────────────────────────────────────

DROP POLICY IF EXISTS "team_members_restaurant" ON team_members;

CREATE POLICY "team_members_restaurant" ON team_members
  FOR ALL TO authenticated
  USING     (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());


-- ── 7. POLÍTICAS: menu_items ──────────────────────────────────────────────

DROP POLICY IF EXISTS "menu_items_branch" ON menu_items;

CREATE POLICY "menu_items_branch" ON menu_items
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── 8. POLÍTICAS: modifier_groups ────────────────────────────────────────

DROP POLICY IF EXISTS "modifier_groups_branch" ON modifier_groups;

CREATE POLICY "modifier_groups_branch" ON modifier_groups
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── 9. POLÍTICAS: caja_shifts ─────────────────────────────────────────────

DROP POLICY IF EXISTS "caja_shifts_branch" ON caja_shifts;

CREATE POLICY "caja_shifts_branch" ON caja_shifts
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── 10. POLÍTICAS: turns ──────────────────────────────────────────────────
-- Autenticados: su restaurante; Anónimos: SELECT (display público de cocina)
-- Los updates del display de cocina usan Edge Function con service_role

DROP POLICY IF EXISTS "turns_authenticated" ON turns;
DROP POLICY IF EXISTS "turns_anon_select"   ON turns;

CREATE POLICY "turns_authenticated" ON turns
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));

CREATE POLICY "turns_anon_select" ON turns
  FOR SELECT TO anon
  USING (true);


-- ── 11. POLÍTICAS: turn_items ─────────────────────────────────────────────

DROP POLICY IF EXISTS "turn_items_authenticated" ON turn_items;
DROP POLICY IF EXISTS "turn_items_anon_select"   ON turn_items;

CREATE POLICY "turn_items_authenticated" ON turn_items
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));

CREATE POLICY "turn_items_anon_select" ON turn_items
  FOR SELECT TO anon
  USING (true);


-- ── 12. POLÍTICAS: stock_items ────────────────────────────────────────────

DROP POLICY IF EXISTS "stock_items_branch" ON stock_items;

CREATE POLICY "stock_items_branch" ON stock_items
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── 13. POLÍTICAS: stock_recipes ──────────────────────────────────────────

DROP POLICY IF EXISTS "stock_recipes_branch" ON stock_recipes;

CREATE POLICY "stock_recipes_branch" ON stock_recipes
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── 14. POLÍTICAS: stock_precios ──────────────────────────────────────────

DROP POLICY IF EXISTS "stock_precios_branch" ON stock_precios;

CREATE POLICY "stock_precios_branch" ON stock_precios
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── 15. POLÍTICAS: stock_egresos ──────────────────────────────────────────

DROP POLICY IF EXISTS "stock_egresos_branch" ON stock_egresos;

CREATE POLICY "stock_egresos_branch" ON stock_egresos
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── 16. POLÍTICAS: stock_ingresos (reemplaza las débiles del migration anterior) ──

ALTER TABLE stock_ingresos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_ingresos_read"   ON stock_ingresos;
DROP POLICY IF EXISTS "stock_ingresos_insert" ON stock_ingresos;
DROP POLICY IF EXISTS "stock_ingresos_branch" ON stock_ingresos;

CREATE POLICY "stock_ingresos_branch" ON stock_ingresos
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── 17. POLÍTICAS: reservations ───────────────────────────────────────────

DROP POLICY IF EXISTS "reservations_branch" ON reservations;

CREATE POLICY "reservations_branch" ON reservations
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── 18. POLÍTICAS: audit_logs ─────────────────────────────────────────────

DROP POLICY IF EXISTS "audit_logs_restaurant" ON audit_logs;

CREATE POLICY "audit_logs_restaurant" ON audit_logs
  FOR ALL TO authenticated
  USING     (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());


-- ── 19. POLÍTICAS: alerts ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "alerts_restaurant" ON alerts;

CREATE POLICY "alerts_restaurant" ON alerts
  FOR ALL TO authenticated
  USING     (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());


-- ── VERIFICACIÓN POST-MIGRACIÓN ──────────────────────────────────────────

-- 1. Verificar que RLS está activo en todas las tablas:
--    SELECT tablename, rowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public'
--    ORDER BY tablename;
--    → Todas deben tener rowsecurity = true

-- 2. Ver todas las políticas creadas:
--    SELECT tablename, policyname, cmd, roles
--    FROM pg_policies
--    WHERE schemaname = 'public'
--    ORDER BY tablename, policyname;

-- 3. Test rápido de aislamiento (ejecutar como usuario autenticado):
--    SELECT COUNT(*) FROM turns;  → solo los del restaurante propio

-- 4. Test de onboarding (usuario nuevo sin restaurante):
--    INSERT INTO restaurants (owner_id, nombre) VALUES (auth.uid(), 'Test');  → debe funcionar

-- NOTA: cerrar_mesa_atomico usa SECURITY DEFINER → bypasea RLS correctamente.
-- NOTA: Edge Functions con service_role → bypasean RLS correctamente.
-- NOTA: Realtime channels respetan RLS por política de tabla.
