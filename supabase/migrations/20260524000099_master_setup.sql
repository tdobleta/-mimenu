-- ============================================================
-- mimenú POS — SCRIPT MAESTRO DE SETUP
-- Versión: 2026-05-24
--
-- INSTRUCCIONES:
--   Supabase Dashboard → SQL Editor → pegar TODO → Run
--   Es idempotente: seguro de ejecutar múltiples veces.
--   Aplica en un solo paso todas las migraciones del repo.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- BLOQUE 1: FUNCIONES AUXILIARES Y RLS CORE
-- ════════════════════════════════════════════════════════════

-- Helper: restaurante del usuario autenticado (dueño o miembro confirmado)
-- NOTA: el Paso 3 por email fue eliminado por vulnerabilidad de secuestro de tenant.
CREATE OR REPLACE FUNCTION get_user_restaurant_id()
RETURNS uuid AS $$
DECLARE v_restaurant_id uuid;
BEGIN
  -- Paso 1: el usuario es dueño del restaurante
  SELECT id INTO v_restaurant_id FROM restaurants
  WHERE owner_id = auth.uid() LIMIT 1;
  IF v_restaurant_id IS NOT NULL THEN RETURN v_restaurant_id; END IF;

  -- Paso 2: el usuario es miembro confirmado (user_id asignado via invite-member)
  SELECT restaurant_id INTO v_restaurant_id FROM team_members
  WHERE user_id = auth.uid() LIMIT 1;
  RETURN v_restaurant_id;
  -- Paso 3 ELIMINADO: fallback por email con user_id IS NULL era vector de secuestro.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Helper: ¿el usuario autenticado es dueño de esta sucursal?
CREATE OR REPLACE FUNCTION user_owns_branch(p_branch_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = p_branch_id
      AND b.restaurant_id = get_user_restaurant_id()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- Helper: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- BLOQUE 2: COLUMNAS NUEVAS EN TABLAS EXISTENTES
-- ════════════════════════════════════════════════════════════

-- turns: timestamp de envío a cocina
ALTER TABLE turns ADD COLUMN IF NOT EXISTS enviado_cocina_at TIMESTAMPTZ;

-- turns: desglose de pagos mixtos (efectivo + tarjeta, etc.)
ALTER TABLE turns ADD COLUMN IF NOT EXISTS pagos_detalle JSONB;

-- turns: tipo de pedido (salón, pos, delivery)
ALTER TABLE turns ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'salon'
  CHECK (tipo IN ('salon', 'pos', 'delivery'));

-- turns: estado delivery
ALTER TABLE turns ADD COLUMN IF NOT EXISTS delivery_estado TEXT
  CHECK (delivery_estado IS NULL OR delivery_estado IN ('preparando','listo','en_camino','entregado'));

-- turns: datos del pedido delivery (plataforma, dirección, etc.)
ALTER TABLE turns ADD COLUMN IF NOT EXISTS delivery_data JSONB;

-- turn_items: client_uid para idempotencia offline
ALTER TABLE turn_items ADD COLUMN IF NOT EXISTS client_uid TEXT;

-- stock_egresos: client_uid para idempotencia de decrementos
ALTER TABLE stock_egresos ADD COLUMN IF NOT EXISTS client_uid TEXT;


-- ════════════════════════════════════════════════════════════
-- BLOQUE 3: TABLAS NUEVAS
-- ════════════════════════════════════════════════════════════

-- ── restaurant_settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID UNIQUE NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  mp_access_token TEXT,
  mp_device_id    TEXT,
  tusfacturas_usertoken   TEXT,
  tusfacturas_tokenclient TEXT,
  tusfacturas_apitoken    TEXT,
  tusfacturas_punto_venta TEXT DEFAULT '00001',
  evolution_api_url       TEXT,
  evolution_api_key       TEXT,
  evolution_instance_name TEXT,
  afip_config     JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS restaurant_settings_updated_at ON restaurant_settings;
CREATE TRIGGER restaurant_settings_updated_at
  BEFORE UPDATE ON restaurant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_owner_only" ON restaurant_settings;
CREATE POLICY "settings_owner_only" ON restaurant_settings
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()))
  WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));


-- ── staff_pins ────────────────────────────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION update_staff_pins_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS staff_pins_updated_at ON staff_pins;
CREATE TRIGGER staff_pins_updated_at
  BEFORE UPDATE ON staff_pins
  FOR EACH ROW EXECUTE FUNCTION update_staff_pins_updated_at();

ALTER TABLE staff_pins ENABLE ROW LEVEL SECURITY;

-- RLS con aislamiento real por branch_id (corrige políticas permisivas anteriores)
DROP POLICY IF EXISTS "staff_pins_select"                    ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_insert"                    ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_update"                    ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_delete"                    ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_permissive"                ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_all"                       ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_branch_isolation_select"   ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_branch_isolation_insert"   ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_branch_isolation_update"   ON staff_pins;
DROP POLICY IF EXISTS "staff_pins_branch_isolation_delete"   ON staff_pins;

CREATE POLICY "staff_pins_branch_isolation_select" ON staff_pins FOR SELECT
  USING (branch_id IN (
    SELECT b.id FROM branches b WHERE b.restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
      UNION
      SELECT restaurant_id FROM team_members
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  ));

CREATE POLICY "staff_pins_branch_isolation_insert" ON staff_pins FOR INSERT
  WITH CHECK (branch_id IN (
    SELECT b.id FROM branches b WHERE b.restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
      UNION
      SELECT restaurant_id FROM team_members
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  ));

CREATE POLICY "staff_pins_branch_isolation_update" ON staff_pins FOR UPDATE
  USING (branch_id IN (
    SELECT b.id FROM branches b WHERE b.restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
      UNION
      SELECT restaurant_id FROM team_members
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  ))
  WITH CHECK (branch_id IN (
    SELECT b.id FROM branches b WHERE b.restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
      UNION
      SELECT restaurant_id FROM team_members
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  ));

CREATE POLICY "staff_pins_branch_isolation_delete" ON staff_pins FOR DELETE
  USING (branch_id IN (
    SELECT b.id FROM branches b WHERE b.restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
      UNION
      SELECT restaurant_id FROM team_members
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  ));


-- ── device_tokens ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  nombre     TEXT,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_token
  ON device_tokens (token) WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_device_tokens_branch
  ON device_tokens (branch_id, created_at DESC);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_tokens_owner" ON device_tokens;
CREATE POLICY "device_tokens_owner" ON device_tokens FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── customers y customer_visits ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  telefono        TEXT,
  email           TEXT,
  notas           TEXT,
  puntos          INTEGER DEFAULT 0 CHECK (puntos >= 0),
  nacimiento      DATE,
  whatsapp_optout BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_visits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  turn_id          UUID REFERENCES turns(id) ON DELETE SET NULL,
  fecha            TIMESTAMPTZ DEFAULT NOW(),
  total_gastado    NUMERIC DEFAULT 0,
  puntos_ganados   INTEGER DEFAULT 0,
  puntos_canjeados INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tel        ON customers(restaurant_id, telefono);
CREATE INDEX IF NOT EXISTS idx_customers_nom        ON customers(restaurant_id, lower(nombre));
CREATE INDEX IF NOT EXISTS idx_customers_nacimiento ON customers(restaurant_id, nacimiento);
CREATE INDEX IF NOT EXISTS idx_visits_customer      ON customer_visits(customer_id, fecha DESC);

ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_own_restaurant"       ON customers;
DROP POLICY IF EXISTS "customer_visits_own_restaurant" ON customer_visits;

CREATE POLICY "customers_own_restaurant" ON customers
  USING (restaurant_id IN (
    SELECT id FROM restaurants WHERE owner_id = auth.uid()
    UNION
    SELECT restaurant_id FROM team_members
      WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));

CREATE POLICY "customer_visits_own_restaurant" ON customer_visits
  USING (customer_id IN (
    SELECT c.id FROM customers c WHERE c.restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
      UNION
      SELECT restaurant_id FROM team_members
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  ));


-- ── facturas ──────────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_facturas_restaurant_date
  ON facturas(restaurant_id, emitida_at DESC);
CREATE INDEX IF NOT EXISTS idx_facturas_turn
  ON facturas(turn_id) WHERE turn_id IS NOT NULL;

ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "facturas_own_restaurant" ON facturas;
CREATE POLICY "facturas_own_restaurant" ON facturas FOR ALL
  USING (restaurant_id IN (
    SELECT id FROM restaurants WHERE owner_id = auth.uid()
    UNION
    SELECT restaurant_id FROM team_members
      WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ))
  WITH CHECK (restaurant_id IN (
    SELECT id FROM restaurants WHERE owner_id = auth.uid()
    UNION
    SELECT restaurant_id FROM team_members
      WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));


-- ── facturas_contingencia ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturas_contingencia (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  turn_id       UUID REFERENCES turns(id) ON DELETE SET NULL,
  mesa          TEXT,
  items         JSONB NOT NULL,
  total         NUMERIC NOT NULL,
  descuento     NUMERIC NOT NULL DEFAULT 0,
  tipo          TEXT NOT NULL DEFAULT 'B' CHECK (tipo IN ('A', 'B')),
  cliente_data  JSONB,
  error_mensaje TEXT,
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'procesado', 'descartado')),
  factura_id    UUID REFERENCES facturas(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  procesado_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_facturas_contingencia_branch
  ON facturas_contingencia (branch_id, estado, created_at DESC);

ALTER TABLE facturas_contingencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contingencia_owner" ON facturas_contingencia;
CREATE POLICY "contingencia_owner" ON facturas_contingencia FOR ALL TO authenticated
  USING     (user_owns_branch(branch_id))
  WITH CHECK (user_owns_branch(branch_id));


-- ── stock_ingresos (si no existe) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_ingresos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  cantidad      NUMERIC NOT NULL CHECK (cantidad > 0),
  costo_unit    NUMERIC,
  proveedor     TEXT,
  notas         TEXT,
  usuario       TEXT,
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_ingresos_branch_fecha
  ON stock_ingresos(branch_id, fecha DESC);

ALTER TABLE stock_ingresos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_ingresos_read"   ON stock_ingresos;
DROP POLICY IF EXISTS "stock_ingresos_insert" ON stock_ingresos;

CREATE POLICY "stock_ingresos_read" ON stock_ingresos FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "stock_ingresos_insert" ON stock_ingresos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');


-- ════════════════════════════════════════════════════════════
-- BLOQUE 4: ÍNDICES DE PERFORMANCE Y UNICIDAD
-- ════════════════════════════════════════════════════════════

-- Turno de caja: solo uno abierto por sucursal
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_caja_per_branch
  ON caja_shifts (branch_id) WHERE status = 'abierto';

-- turn_items: idempotencia offline (client_uid único cuando no es NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_turn_items_client_uid
  ON turn_items (client_uid) WHERE client_uid IS NOT NULL;

-- stock_egresos: idempotencia offline
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_egresos_client_uid
  ON stock_egresos (client_uid) WHERE client_uid IS NOT NULL;

-- turn_items: índices para Realtime server-side y queries frecuentes
CREATE INDEX IF NOT EXISTS idx_turn_items_branch
  ON turn_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_turn_items_branch_turn
  ON turn_items (branch_id, turn_id);

-- turns: solo un turno abierto por mesa (previene split-brain entre tablets)
CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_one_open_per_table
  ON turns(branch_id, mesa_num) WHERE status = 'abierta';

-- turns: índice para queries de delivery
CREATE INDEX IF NOT EXISTS idx_turns_tipo_branch
  ON turns(branch_id, tipo) WHERE tipo = 'delivery';

-- restaurant_settings
CREATE INDEX IF NOT EXISTS idx_restaurant_settings_restaurant
  ON restaurant_settings(restaurant_id);


-- ════════════════════════════════════════════════════════════
-- BLOQUE 5: RLS EN TABLAS EXISTENTES (ajustes de seguridad)
-- ════════════════════════════════════════════════════════════

-- turns: eliminar políticas anon permisivas (ya no necesarias con device tokens)
DROP POLICY IF EXISTS "turns_anon_select"   ON turns;
DROP POLICY IF EXISTS "turns_cocina_anon"   ON turns;

-- turn_items: eliminar políticas anon (reemplazadas por autenticación con device token)
DROP POLICY IF EXISTS "turn_items_anon_select" ON turn_items;


-- ════════════════════════════════════════════════════════════
-- BLOQUE 6: RPCs ATÓMICOS (CREATE OR REPLACE — idempotente)
-- ════════════════════════════════════════════════════════════

-- cerrar_mesa_atomico: versión con acumulación incremental en caja (fix race condition)
CREATE OR REPLACE FUNCTION cerrar_mesa_atomico(
  p_turn_id        uuid,
  p_total          numeric,
  p_propina        numeric,
  p_metodo         text,
  p_mozo           text,
  p_caja_shift_id  uuid    DEFAULT NULL,
  p_pagos_detalle  jsonb   DEFAULT NULL
)
RETURNS turns AS $$
DECLARE
  v_turn turns%ROWTYPE;
BEGIN
  SELECT * INTO v_turn FROM turns
  WHERE id = p_turn_id AND status = 'abierta'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno ya cerrado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE turns SET
    status          = 'cerrada',
    closed_at       = now(),
    total_facturado = p_total,
    propina         = p_propina,
    metodo_pago     = p_metodo,
    mozo            = p_mozo,
    caja_shift_id   = COALESCE(p_caja_shift_id, caja_shift_id),
    pagos_detalle   = COALESCE(p_pagos_detalle, pagos_detalle)
  WHERE id = p_turn_id
  RETURNING * INTO v_turn;

  -- FIX: acumulación incremental atómica — previene race condition con 2 tablets simultáneas
  IF p_caja_shift_id IS NOT NULL THEN
    UPDATE caja_shifts
    SET total_facturado_turno = total_facturado_turno + p_total + COALESCE(p_propina, 0)
    WHERE id = p_caja_shift_id;
  END IF;

  RETURN v_turn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- append_caja_retiro: agrega retiro al array JSONB de forma atómica
CREATE OR REPLACE FUNCTION append_caja_retiro(
  p_shift_id    UUID,
  p_retiro_json JSONB
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE caja_shifts
  SET retiros = (
    COALESCE(retiros::jsonb, '[]'::jsonb) || jsonb_build_array(p_retiro_json)
  )::text
  WHERE id = p_shift_id AND status = 'abierto';
$$;


-- decrement_stock: decrementa stock sin bajar de 0 (atómico, idempotente)
CREATE OR REPLACE FUNCTION decrement_stock(
  p_id  UUID,
  p_qty NUMERIC
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE stock_items
  SET actual = GREATEST(0, actual - p_qty)
  WHERE id = p_id;
$$;

-- increment_customer_points / decrement_customer_points
CREATE OR REPLACE FUNCTION increment_customer_points(p_id UUID, p_pts INTEGER)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE customers SET puntos = COALESCE(puntos, 0) + p_pts WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION decrement_customer_points(p_id UUID, p_pts INTEGER)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE customers SET puntos = GREATEST(0, COALESCE(puntos, 0) - p_pts) WHERE id = p_id;
$$;


-- ════════════════════════════════════════════════════════════
-- BLOQUE 7: GRANTS EXPLÍCITOS
-- (CREATE TABLE en Supabase SQL Editor no siempre hereda ALTER DEFAULT PRIVILEGES)
-- ════════════════════════════════════════════════════════════

GRANT ALL ON TABLE public.device_tokens         TO authenticated, service_role;
GRANT ALL ON TABLE public.facturas              TO authenticated, service_role;
GRANT ALL ON TABLE public.facturas_contingencia TO authenticated, service_role;
GRANT ALL ON TABLE public.restaurant_settings   TO authenticated, service_role;
GRANT ALL ON TABLE public.staff_pins            TO authenticated, service_role;
GRANT ALL ON TABLE public.customers             TO authenticated, service_role;
GRANT ALL ON TABLE public.customer_visits       TO authenticated, service_role;
GRANT ALL ON TABLE public.stock_ingresos        TO authenticated, service_role;

GRANT ALL ON TABLE public.branches              TO authenticated, service_role;
GRANT ALL ON TABLE public.restaurants           TO authenticated, service_role;
GRANT ALL ON TABLE public.turns                 TO authenticated, service_role;
GRANT ALL ON TABLE public.turn_items            TO authenticated, service_role;
GRANT ALL ON TABLE public.caja_shifts           TO authenticated, service_role;
GRANT ALL ON TABLE public.stock_items           TO authenticated, service_role;
GRANT ALL ON TABLE public.stock_recipes         TO authenticated, service_role;
GRANT ALL ON TABLE public.stock_egresos         TO authenticated, service_role;
GRANT ALL ON TABLE public.reservations          TO authenticated, service_role;
GRANT ALL ON TABLE public.team_members          TO authenticated, service_role;
GRANT ALL ON TABLE public.facturas              TO authenticated, service_role;

-- Futuros CREATE TABLE heredarán permisos automáticamente
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;


-- ════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-SETUP
-- Copiar y ejecutar por separado después del script principal:
-- ════════════════════════════════════════════════════════════

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'restaurant_settings','staff_pins','device_tokens',
--     'customers','customer_visits','facturas','facturas_contingencia','stock_ingresos'
--   )
-- ORDER BY table_name;
-- → Debe retornar exactamente 8 filas

-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'turns'
--   AND column_name IN ('enviado_cocina_at','pagos_detalle','tipo','delivery_estado','delivery_data');
-- → Debe retornar 5 filas

-- SELECT proname FROM pg_proc
-- WHERE proname IN ('cerrar_mesa_atomico','append_caja_retiro','decrement_stock',
--                   'get_user_restaurant_id','user_owns_branch',
--                   'increment_customer_points','decrement_customer_points');
-- → Debe retornar 7 filas
