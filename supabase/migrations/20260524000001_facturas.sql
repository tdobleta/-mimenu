-- Historial de facturas electrónicas emitidas vía TusFacturasAPP / AFIP.
-- Cada vez que se emite una factura desde CloseTableModal, se guarda el CAE acá.
-- Ejecutar en Supabase Dashboard → SQL Editor → Run

CREATE TABLE IF NOT EXISTS facturas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id      UUID REFERENCES branches(id) ON DELETE SET NULL,
  turn_id        UUID REFERENCES turns(id) ON DELETE SET NULL,
  tipo           TEXT NOT NULL DEFAULT 'B' CHECK (tipo IN ('A','B','C','M')),
  numero         INTEGER,
  punto_venta    TEXT,
  cae            TEXT,
  vto_cae        DATE,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  condicion_iva_receptor TEXT DEFAULT 'Consumidor Final',
  pdf_url        TEXT,
  emitida_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice principal para listar facturas por restaurante ordenadas por fecha
CREATE INDEX IF NOT EXISTS idx_facturas_restaurant_date
  ON facturas(restaurant_id, emitida_at DESC);

-- Índice para buscar la factura de un turn específico
CREATE INDEX IF NOT EXISTS idx_facturas_turn
  ON facturas(turn_id)
  WHERE turn_id IS NOT NULL;

-- RLS: solo el owner del restaurante o sus team members pueden ver las facturas
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facturas_own_restaurant" ON facturas
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
      UNION
      SELECT restaurant_id FROM team_members
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
      UNION
      SELECT restaurant_id FROM team_members
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Verificación post-aplicación:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'facturas';
