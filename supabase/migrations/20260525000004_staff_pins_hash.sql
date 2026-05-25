-- Staff PIN hardening.
-- Los PINs dejan de viajar/leerse en claro desde el navegador. La validacion
-- pasa por Edge Function staff-pin-auth y se guarda hash con salt.

ALTER TABLE staff_pins
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

ALTER TABLE staff_pins
  ALTER COLUMN pin DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_pins_pin_check'
      AND conrelid = 'staff_pins'::regclass
  ) THEN
    ALTER TABLE staff_pins DROP CONSTRAINT staff_pins_pin_check;
  END IF;
END $$;

ALTER TABLE staff_pins
  ADD CONSTRAINT staff_pins_pin_legacy_check
  CHECK (pin IS NULL OR pin ~ '^[0-9]{4}$');

-- Evitar que el cliente autenticado lea o escriba PINs/hashes directo.
-- La app usa Edge Function con service_role para crear, cambiar y verificar PIN.
REVOKE SELECT ON TABLE public.staff_pins FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.staff_pins FROM authenticated;

GRANT SELECT (id, branch_id, nombre, rol, activo, created_at, updated_at)
  ON public.staff_pins TO authenticated;

GRANT ALL ON TABLE public.staff_pins TO service_role;
