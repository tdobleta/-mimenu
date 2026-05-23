-- Migration: restaurant_settings
-- Tabla para credenciales y configuraciones sensibles por restaurante.
-- Reemplaza el localStorage para settings que necesitan persistir en el servidor
-- o que son usados por Edge Functions (MP Point, etc.).
--
-- IMPORTANTE: El row solo puede ser leído/escrito por el dueño (owner_id = auth.uid()).
-- Los Edge Functions que necesiten las credenciales usan SERVICE_ROLE_KEY.

CREATE TABLE IF NOT EXISTS restaurant_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID UNIQUE NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

  -- Mercado Pago Point (terminal de pago)
  mp_access_token TEXT,   -- Bearer token de la cuenta MP del restaurante
  mp_device_id    TEXT,   -- ID de la terminal física registrada en MP

  -- TusFacturasAPP (facturación AFIP)
  -- Nota: credentials se almacenan en restaurant_settings para que la Edge Function
  -- pueda emitir facturas sin exponer las claves al navegador.
  tusfacturas_usertoken   TEXT,
  tusfacturas_tokenclient TEXT,
  tusfacturas_apitoken    TEXT,
  tusfacturas_punto_venta TEXT DEFAULT '00001',

  -- WhatsApp (Evolution API)
  evolution_api_url       TEXT,   -- URL del servidor Evolution API (ej: http://192.168.1.x:8080)
  evolution_api_key       TEXT,   -- API key de la instancia
  evolution_instance_name TEXT,   -- nombre de la instancia registrada

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Trigger para updated_at automático ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurant_settings_updated_at ON restaurant_settings;
CREATE TRIGGER restaurant_settings_updated_at
  BEFORE UPDATE ON restaurant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;

-- Solo el dueño puede ver/modificar sus propias settings
CREATE POLICY "settings_owner_only" ON restaurant_settings
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- Función auxiliar para que las Edge Functions accedan via SERVICE_ROLE
-- (no necesita policy especial — SERVICE_ROLE bypassa RLS por diseño)

-- ── Índice ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_restaurant_settings_restaurant
  ON restaurant_settings(restaurant_id);
