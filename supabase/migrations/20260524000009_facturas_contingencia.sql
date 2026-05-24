-- ============================================================
-- supabase/migrations/20260524000009_facturas_contingencia.sql
-- Sprint 7.6: Cola de contingencia fiscal offline para AFIP
--
-- PROBLEMA:
--   Si TusFacturasAPP cae durante el cobro (timeout, error 500, sin internet),
--   la factura se pierde silenciosamente. El cobro ya ocurrió (el turn está
--   cerrado y el dinero cobrado), pero no hay registro AFIP.
--   El dueño solo se entera cuando Fiscalía llama.
--
-- SOLUCIÓN:
--   Cuando emitirFacturaB/A falla, guardar todos los datos del comprobante
--   en facturas_contingencia con estado 'pendiente'. En Caja.jsx → tab
--   "Facturas AFIP" el dueño puede ver las pendientes y re-intentar.
--
-- APLICAR:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
-- ============================================================

CREATE TABLE IF NOT EXISTS facturas_contingencia (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  turn_id       UUID REFERENCES turns(id) ON DELETE SET NULL,
  -- Datos del comprobante (suficientes para re-emitir sin la mesa original)
  mesa          TEXT,
  items         JSONB NOT NULL,       -- [{ nombre, precio, qty }]
  total         NUMERIC NOT NULL,
  descuento     NUMERIC NOT NULL DEFAULT 0,
  tipo          TEXT NOT NULL DEFAULT 'B' CHECK (tipo IN ('A', 'B')),
  -- Datos del cliente (solo para Factura A)
  cliente_data  JSONB,               -- { cuit, razon_social, email, domicilio }
  -- Resultado
  error_mensaje TEXT,
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'procesado', 'descartado')),
  -- Cuando fue procesada exitosamente
  factura_id    UUID REFERENCES facturas(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  procesado_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_facturas_contingencia_branch
  ON facturas_contingencia (branch_id, estado, created_at DESC);

ALTER TABLE facturas_contingencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contingencia_owner" ON facturas_contingencia
  FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));

-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- SELECT COUNT(*) FROM facturas_contingencia; -- debe dar 0 (tabla vacía)
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'facturas_contingencia'; -- debe listar todas las columnas
