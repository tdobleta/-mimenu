-- Migration: Agregar columnas nuevas a `turns`
-- Aplicar en: Supabase Dashboard → SQL Editor → pegar y ejecutar
-- Segura: IF NOT EXISTS → idempotente, sin downtime

-- Timestamp real de cuando la comanda fue enviada a cocina
-- (antes siempre era NULL → ControlCocina caía al fallback opened_at)
ALTER TABLE turns
  ADD COLUMN IF NOT EXISTS enviado_cocina_at TIMESTAMPTZ;

-- Desglose estructurado de pagos mixtos (efectivo + tarjeta, etc.)
-- Ejemplo: [{"metodo":"Efectivo","monto":5000},{"metodo":"Tarjeta","monto":3000}]
ALTER TABLE turns
  ADD COLUMN IF NOT EXISTS pagos_detalle JSONB;

-- Verificación post-migración (ejecutar por separado para confirmar):
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'turns'
--   AND column_name IN ('enviado_cocina_at', 'pagos_detalle');
