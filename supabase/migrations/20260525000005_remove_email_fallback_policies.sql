-- Remove remaining email-based RLS fallbacks.
--
-- The canonical authorization model is:
--   restaurants.owner_id = auth.uid()
--   OR team_members.user_id = auth.uid()
--
-- Never grant tenant access because an auth user merely owns the same email
-- string as a legacy team_members row.

-- staff_pins: direct table grants are revoked by the PIN hash migration, but
-- keep the policies correct for future grants and for defense in depth.
DROP POLICY IF EXISTS "staff_pins_branch_isolation_select" ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_branch_isolation_insert" ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_branch_isolation_update" ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_branch_isolation_delete" ON staff_pins;

CREATE POLICY "staff_pins_branch_isolation_select" ON staff_pins FOR SELECT
  USING (branch_id IN (
    SELECT b.id FROM branches b
    WHERE b.restaurant_id = get_user_restaurant_id()
  ));

CREATE POLICY "staff_pins_branch_isolation_insert" ON staff_pins FOR INSERT
  WITH CHECK (branch_id IN (
    SELECT b.id FROM branches b
    WHERE b.restaurant_id = get_user_restaurant_id()
  ));

CREATE POLICY "staff_pins_branch_isolation_update" ON staff_pins FOR UPDATE
  USING (branch_id IN (
    SELECT b.id FROM branches b
    WHERE b.restaurant_id = get_user_restaurant_id()
  ))
  WITH CHECK (branch_id IN (
    SELECT b.id FROM branches b
    WHERE b.restaurant_id = get_user_restaurant_id()
  ));

CREATE POLICY "staff_pins_branch_isolation_delete" ON staff_pins FOR DELETE
  USING (branch_id IN (
    SELECT b.id FROM branches b
    WHERE b.restaurant_id = get_user_restaurant_id()
  ));


-- CRM
DROP POLICY IF EXISTS "customers_own_restaurant" ON customers;
DROP POLICY IF EXISTS "customer_visits_own_restaurant" ON customer_visits;

CREATE POLICY "customers_own_restaurant" ON customers FOR ALL
  USING (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());

CREATE POLICY "customer_visits_own_restaurant" ON customer_visits FOR ALL
  USING (customer_id IN (
    SELECT c.id FROM customers c
    WHERE c.restaurant_id = get_user_restaurant_id()
  ))
  WITH CHECK (customer_id IN (
    SELECT c.id FROM customers c
    WHERE c.restaurant_id = get_user_restaurant_id()
  ));


-- Facturas
DROP POLICY IF EXISTS "facturas_own_restaurant" ON facturas;

CREATE POLICY "facturas_own_restaurant" ON facturas FOR ALL
  USING (restaurant_id = get_user_restaurant_id())
  WITH CHECK (restaurant_id = get_user_restaurant_id());


-- Verification:
-- SELECT policyname, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('staff_pins', 'customers', 'customer_visits', 'facturas')
-- ORDER BY tablename, policyname;
