-- Migration: delivery
-- Agrega soporte de pedidos de delivery como "mesa virtual" en el sistema de turns.
-- Sin dependencias externas — funciona desde el primer día con ingreso manual.

-- ── Columnas en turns ─────────────────────────────────────────────────────────

ALTER TABLE turns ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'salon'
  CHECK (tipo IN ('salon', 'pos', 'delivery'));

ALTER TABLE turns ADD COLUMN IF NOT EXISTS delivery_estado TEXT
  CHECK (delivery_estado IS NULL OR delivery_estado IN ('preparando','listo','en_camino','entregado'));

-- JSON libre para datos del pedido: { plataforma, direccion, telefono, repartidor, nota_interna }
ALTER TABLE turns ADD COLUMN IF NOT EXISTS delivery_data JSONB;

-- ── Índice para consultas rápidas por tipo ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_turns_tipo_branch
  ON turns(branch_id, tipo)
  WHERE tipo = 'delivery';

-- ── Verificación ──────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'turns' AND column_name IN ('tipo','delivery_estado','delivery_data');
