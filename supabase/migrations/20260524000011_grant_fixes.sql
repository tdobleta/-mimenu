-- ============================================================
-- supabase/migrations/20260524000011_grant_fixes.sql
-- Agrega GRANTs explícitos a tablas nuevas que pueden carecer
-- de permisos si fueron creadas con SQL manual en Supabase.
--
-- PROBLEMA:
--   En Supabase, CREATE TABLE en SQL Editor no siempre hereda
--   los ALTER DEFAULT PRIVILEGES del schema public. Resultado:
--   el rol 'authenticated' recibe "permission denied" aunque
--   la RLS policy esté correctamente configurada.
--
-- SÍNTOMA en producción:
--   Configuración → Cocina → "+ Nuevo dispositivo"
--   → "Error al crear dispositivo: permission denied for table device_tokens"
--
-- SOLUCIÓN:
--   GRANT explícito sobre cada tabla afectada. Es idempotente
--   (ejecutar múltiples veces no causa problemas).
--
-- APLICAR:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================

-- Tablas creadas en migraciones 000001-000010 que pueden carecer de GRANTs:
GRANT ALL ON TABLE public.device_tokens         TO authenticated, service_role;
GRANT ALL ON TABLE public.facturas              TO authenticated, service_role;
GRANT ALL ON TABLE public.facturas_contingencia TO authenticated, service_role;
GRANT ALL ON TABLE public.restaurant_settings   TO authenticated, service_role;
GRANT ALL ON TABLE public.staff_pins            TO authenticated, service_role;

-- Tablas preexistentes (por si también tienen el problema):
GRANT ALL ON TABLE public.branches              TO authenticated, service_role;
GRANT ALL ON TABLE public.restaurants           TO authenticated, service_role;
GRANT ALL ON TABLE public.turns                 TO authenticated, service_role;
GRANT ALL ON TABLE public.turn_items            TO authenticated, service_role;
GRANT ALL ON TABLE public.caja_shifts           TO authenticated, service_role;
GRANT ALL ON TABLE public.stock_items           TO authenticated, service_role;
GRANT ALL ON TABLE public.stock_recipes         TO authenticated, service_role;
GRANT ALL ON TABLE public.stock_egresos         TO authenticated, service_role;
GRANT ALL ON TABLE public.stock_ingresos        TO authenticated, service_role;
GRANT ALL ON TABLE public.stock_precios         TO authenticated, service_role;
GRANT ALL ON TABLE public.customers             TO authenticated, service_role;
GRANT ALL ON TABLE public.customer_visits       TO authenticated, service_role;
GRANT ALL ON TABLE public.reservations          TO authenticated, service_role;
GRANT ALL ON TABLE public.team_members          TO authenticated, service_role;

-- Asegurar que los futuros CREATE TABLE en public hereden los permisos:
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name = 'device_tokens'
--   AND grantee IN ('authenticated', 'service_role');
-- → Debe mostrar INSERT, SELECT, UPDATE, DELETE para ambos roles
