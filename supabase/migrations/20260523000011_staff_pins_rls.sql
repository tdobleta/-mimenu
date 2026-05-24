-- Corrige la política RLS de staff_pins.
-- La migración anterior (20260523000010) dejó políticas permisivas (USING true)
-- que permiten a cualquier restaurante ver los PINs de otro.
-- Esta migración reemplaza todas las políticas por aislamiento real por branch_id.
--
-- Ejecutar en Supabase Dashboard → SQL Editor → Run

-- 1. Eliminar políticas permisivas anteriores
DROP POLICY IF EXISTS "staff_pins_select" ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_insert" ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_update" ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_delete" ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_permissive" ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_all"        ON staff_pins;

-- 2. Subquery reutilizable para branches del usuario autenticado
-- Lógica: el usuario puede ver branches que pertenecen a:
--   a) Restaurantes donde es owner (restaurants.owner_id = auth.uid())
--   b) Restaurantes donde es team member (team_members.email = auth.email())

CREATE POLICY "staff_pins_branch_isolation_select" ON staff_pins
  FOR SELECT
  USING (
    branch_id IN (
      SELECT b.id FROM branches b
      WHERE b.restaurant_id IN (
        SELECT id FROM restaurants WHERE owner_id = auth.uid()
        UNION
        SELECT restaurant_id FROM team_members
          WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  );

CREATE POLICY "staff_pins_branch_isolation_insert" ON staff_pins
  FOR INSERT
  WITH CHECK (
    branch_id IN (
      SELECT b.id FROM branches b
      WHERE b.restaurant_id IN (
        SELECT id FROM restaurants WHERE owner_id = auth.uid()
        UNION
        SELECT restaurant_id FROM team_members
          WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  );

CREATE POLICY "staff_pins_branch_isolation_update" ON staff_pins
  FOR UPDATE
  USING (
    branch_id IN (
      SELECT b.id FROM branches b
      WHERE b.restaurant_id IN (
        SELECT id FROM restaurants WHERE owner_id = auth.uid()
        UNION
        SELECT restaurant_id FROM team_members
          WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  )
  WITH CHECK (
    branch_id IN (
      SELECT b.id FROM branches b
      WHERE b.restaurant_id IN (
        SELECT id FROM restaurants WHERE owner_id = auth.uid()
        UNION
        SELECT restaurant_id FROM team_members
          WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  );

CREATE POLICY "staff_pins_branch_isolation_delete" ON staff_pins
  FOR DELETE
  USING (
    branch_id IN (
      SELECT b.id FROM branches b
      WHERE b.restaurant_id IN (
        SELECT id FROM restaurants WHERE owner_id = auth.uid()
        UNION
        SELECT restaurant_id FROM team_members
          WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  );

-- Verificación: correr esto después para confirmar que hay 4 policies:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'staff_pins';
