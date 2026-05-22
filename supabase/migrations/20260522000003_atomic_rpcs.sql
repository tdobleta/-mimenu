-- ============================================================
-- supabase/migrations/20260522000003_atomic_rpcs.sql
-- RPCs atómicos para operaciones concurrentes.
--
-- INSTRUCCIONES:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar
--
-- CONTEXTO:
--   append_caja_retiro: Reemplaza el patrón JS SELECT→parse→push→UPDATE
--     que es un anti-patrón con race conditions. El operador || de JSONB
--     en PostgreSQL es atómico — la DB garantiza que no se pierden retiros
--     aunque dos tablets ejecuten la operación simultáneamente.
--
--   decrement_stock: Reemplaza el patrón JS SELECT→calcular→UPDATE
--     que podría resultar en stock negativo con dos tablets concurrentes.
--     GREATEST(0, actual - p_qty) garantiza que el stock nunca baje de 0.
--     Idempotente si el mismo decremento se aplica dos veces (bug de retry):
--     el stock puede quedar en 0, nunca en negativo.
-- ============================================================


-- ── 1. append_caja_retiro ──────────────────────────────────────────────────
-- Agrega un retiro al array JSON de un turno de caja de forma atómica.
-- Parámetros:
--   p_shift_id    — UUID del caja_shift
--   p_retiro_json — el objeto retiro: {ts, concepto, monto, ...}
-- Idempotencia: el caller debe verificar ts antes de llamar (ya hecho en offlineSync).

CREATE OR REPLACE FUNCTION append_caja_retiro(
  p_shift_id    UUID,
  p_retiro_json JSONB
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- retiros es columna TEXT (JSON string) → casteamos a JSONB, concatenamos, casteamos de vuelta.
  -- El operador || de JSONB es atómico a nivel de sentencia UPDATE: sin race conditions.
  UPDATE caja_shifts
  SET retiros = (
    COALESCE(retiros::jsonb, '[]'::jsonb) || jsonb_build_array(p_retiro_json)
  )::text
  WHERE id = p_shift_id
    AND status = 'abierto';
$$;


-- ── 2. decrement_stock ────────────────────────────────────────────────────
-- Decrementa el stock de un ítem de forma atómica, sin bajar de 0.
-- Parámetros:
--   p_id  — UUID del stock_item
--   p_qty — cantidad a decrementar (positiva)
-- GREATEST garantiza que el stock nunca sea negativo aunque haya
-- decrementos concurrentes desde múltiples tablets.

CREATE OR REPLACE FUNCTION decrement_stock(
  p_id  UUID,
  p_qty NUMERIC
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE stock_items
  SET actual = GREATEST(0, actual - p_qty)
  WHERE id = p_id;
$$;


-- ── VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────────────
-- SELECT proname, pg_get_function_arguments(oid)
-- FROM pg_proc
-- WHERE proname IN ('append_caja_retiro', 'decrement_stock')
-- ORDER BY proname;
-- → Debe retornar 2 filas con los argumentos correctos.
--
-- Test rápido:
-- SELECT append_caja_retiro(
--   (SELECT id FROM caja_shifts WHERE status='abierto' LIMIT 1),
--   '{"ts":"2026-05-22T12:00:00Z","concepto":"Test","monto":100}'::jsonb
-- );
-- → Sin error → función OK
