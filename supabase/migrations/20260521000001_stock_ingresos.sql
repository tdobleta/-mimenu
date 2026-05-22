-- ============================================================
-- Tabla para registrar ingresos / compras de stock
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_ingresos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  stock_item_id UUID        NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  cantidad      NUMERIC     NOT NULL CHECK (cantidad > 0),
  costo_unit    NUMERIC,                         -- para cálculo de inversión
  proveedor     TEXT,
  notas         TEXT,
  usuario       TEXT,                            -- email del operador
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para queries por sucursal (más frecuente)
CREATE INDEX IF NOT EXISTS idx_stock_ingresos_branch_fecha
  ON stock_ingresos(branch_id, fecha DESC);

-- RLS: solo usuarios autenticados del mismo restaurante pueden leer/escribir
ALTER TABLE stock_ingresos ENABLE ROW LEVEL SECURITY;

-- Política de lectura: cualquier usuario autenticado puede ver ingresos de su branch
CREATE POLICY IF NOT EXISTS "stock_ingresos_read"
  ON stock_ingresos FOR SELECT
  USING (auth.role() = 'authenticated');

-- Política de escritura: cualquier usuario autenticado puede insertar
CREATE POLICY IF NOT EXISTS "stock_ingresos_insert"
  ON stock_ingresos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Verificación post-migración:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'stock_ingresos';
-- → debe retornar: id, branch_id, stock_item_id, cantidad, costo_unit, proveedor, notas, usuario, fecha, created_at
