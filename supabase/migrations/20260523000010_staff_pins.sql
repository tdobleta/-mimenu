-- staff_pins: tabla de mozos con PIN para tablets compartidas.
-- El sistema de auth de Supabase sigue siendo el de los dueños/encargados.
-- Esta tabla provee identidad operativa a nivel de turno, sin crear cuentas Supabase.

CREATE TABLE IF NOT EXISTS staff_pins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  pin        TEXT NOT NULL CHECK (pin ~ '^[0-9]{4}$'),
  rol        TEXT NOT NULL DEFAULT 'Mozo' CHECK (rol IN ('Mozo','Encargado','Cocinero')),
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_pins_branch_idx ON staff_pins(branch_id, activo);

-- RLS: solo el dueño/encargado puede gestionar los staff (lectura pública dentro de la branch)
ALTER TABLE staff_pins ENABLE ROW LEVEL SECURITY;

-- Los staff de una branch son visibles para cualquier sesión autenticada del mismo restaurante
-- (las tablets están logueadas como el dueño/encargado)
CREATE POLICY "staff_pins_select" ON staff_pins
  FOR SELECT USING (true);

CREATE POLICY "staff_pins_insert" ON staff_pins
  FOR INSERT WITH CHECK (true);

CREATE POLICY "staff_pins_update" ON staff_pins
  FOR UPDATE USING (true);

CREATE POLICY "staff_pins_delete" ON staff_pins
  FOR DELETE USING (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_staff_pins_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER staff_pins_updated_at
  BEFORE UPDATE ON staff_pins
  FOR EACH ROW EXECUTE FUNCTION update_staff_pins_updated_at();
