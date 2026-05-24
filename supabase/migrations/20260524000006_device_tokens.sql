-- ============================================================
-- supabase/migrations/20260524000006_device_tokens.sql
-- Fase 4: Tokens de dispositivo para pantallas de cocina.
--
-- PROBLEMA QUE RESUELVE:
--   CocinaDisplay.jsx llamaba a cocina-update Edge Function
--   usando la anon key en el header Authorization:
--     Authorization: Bearer {VITE_SUPABASE_ANON_KEY}
--   La anon key es pública (está en el bundle JS). Cualquier
--   persona que inspeccione el código puede llamar cocina-update
--   con cualquier turn_id y branch_id que conozca.
--
-- SOLUCIÓN:
--   Cada pantalla de cocina recibe un token único de 32 bytes
--   generado por PostgreSQL (gen_random_bytes). El token:
--   1. Se almacena en esta tabla con branch_id + nombre del dispositivo.
--   2. Se guarda en localStorage del dispositivo al navegar a la URL de setup.
--   3. Se envía en Authorization: Bearer {token} al llamar cocina-update.
--   4. La Edge Function valida el token contra esta tabla usando service_role.
--
-- FLUJO DE SETUP:
--   Dueño → Configuración → Cocina → "Nuevo dispositivo" → copia URL
--   URL: https://mimenuar.netlify.app/cocina?branch=UUID&token=HEX64
--   Al abrir esa URL, CocinaDisplay guarda el token en localStorage.
--   Las siguientes visitas usan localStorage (sin necesidad de la URL larga).
--
-- APLICAR:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================

CREATE TABLE IF NOT EXISTS device_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  -- Token de 32 bytes en hex (64 caracteres). Generado por PostgreSQL.
  -- UNIQUE garantiza que no hay colisiones; el índice hace el lookup O(log n).
  token      TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  -- Nombre del dispositivo, ej: "Monitor Cocina", "Tablet Bar"
  nombre     TEXT,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice explícito para el lookup de token (cocina-update lo busca por token + activo)
CREATE INDEX IF NOT EXISTS idx_device_tokens_token
  ON device_tokens (token)
  WHERE activo = true;

-- Índice para listar tokens por branch (DeviceTokensTab)
CREATE INDEX IF NOT EXISTS idx_device_tokens_branch
  ON device_tokens (branch_id, created_at DESC);

-- RLS: solo el dueño de la sucursal puede ver y gestionar sus tokens
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_tokens_owner" ON device_tokens
  FOR ALL
  TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));

-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- SELECT id, nombre, left(token,8)||'...' AS token_preview, activo, created_at
-- FROM device_tokens
-- ORDER BY created_at DESC;
-- → Debe retornar 0 filas (tabla vacía hasta que el dueño cree el primer token)
--
-- -- Test RLS: anon no puede leer
-- SET ROLE anon;
-- SELECT COUNT(*) FROM device_tokens; -- debe dar 0 o error de permiso
