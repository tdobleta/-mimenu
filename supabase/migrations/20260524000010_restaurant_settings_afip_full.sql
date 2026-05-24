-- ============================================================
-- supabase/migrations/20260524000010_restaurant_settings_afip_full.sql
-- Persistencia completa del config AFIP en restaurant_settings.
--
-- PROBLEMA:
--   La configuración AFIP (credenciales TusFacturasAPP, CUIT, punto de venta,
--   razón social, domicilio, etc.) solo se guardaba en localStorage.
--   Si el dueño limpia el caché o accede desde otro dispositivo, pierde TODO.
--
-- SOLUCIÓN:
--   Agregar columna afip_config JSONB a restaurant_settings.
--   FacturacionSetup.jsx lee de DB al cargar y escribe a DB al guardar.
--   localStorage queda como caché local (carga instantánea).
--
-- APLICAR:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================

ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS afip_config JSONB;

-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'restaurant_settings' AND column_name = 'afip_config';
-- -- debe retornar 'afip_config'
