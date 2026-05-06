-- ============================================================
-- mimenú — Schema completo para Supabase
-- Versión: 1.0.0
-- Multi-tenant con Row Level Security real a nivel de motor
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- FUNCIÓN HELPER: restaurant_id del usuario autenticado
-- SECURITY DEFINER = bypasea RLS en las tablas que consulta
-- Necesario para evitar recursión circular en team_members
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_restaurant_id()
RETURNS UUID AS $$
DECLARE
  r_id UUID;
BEGIN
  -- Primero: chequear si es dueño
  SELECT id INTO r_id
    FROM restaurants
   WHERE owner_id = auth.uid()
   LIMIT 1;
  IF r_id IS NOT NULL THEN RETURN r_id; END IF;

  -- Segundo: chequear si es miembro de equipo
  SELECT restaurant_id INTO r_id
    FROM team_members
   WHERE user_id = auth.uid()
   LIMIT 1;

  RETURN r_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- TABLA: restaurants
-- Una fila = una empresa gastronómica
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_email     TEXT,
  nombre          TEXT NOT NULL,
  direccion       TEXT,
  telefono        TEXT,
  emailjs_config  TEXT,            -- JSON: {serviceId, templateId, publicKey}
  plan            TEXT DEFAULT 'trial',
  onboarding_completado BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

CREATE POLICY restaurant_select ON restaurants
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id = get_user_restaurant_id()
  );

CREATE POLICY restaurant_insert ON restaurants
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY restaurant_update ON restaurants
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY restaurant_delete ON restaurants
  FOR DELETE USING (owner_id = auth.uid());

-- ============================================================
-- TABLA: branches
-- Un local físico del restaurante
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id         UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  nombre                TEXT NOT NULL,
  direccion             TEXT,
  metodo_conexion       TEXT DEFAULT 'ninguno',
  fudo_api_key          TEXT,
  fudo_api_secret       TEXT,
  mp_access_token       TEXT,
  mp_account_name       TEXT,
  acepta_reservas_online BOOLEAN DEFAULT true,
  mesas                 INTEGER DEFAULT 8,
  franjas               TEXT[],    -- ej: ['12:00','13:00','20:00','21:00']
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branches_restaurant ON branches(restaurant_id);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY branches_all ON branches
  FOR ALL USING (restaurant_id = get_user_restaurant_id());

-- ============================================================
-- TABLA: team_members
-- Equipo del restaurante con roles
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  nombre        TEXT,
  rol           TEXT NOT NULL CHECK (rol IN ('Dueno','Encargado','Mozo','Cocinero')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_restaurant ON team_members(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_team_email     ON team_members(email);
CREATE INDEX IF NOT EXISTS idx_team_user_id   ON team_members(user_id);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_members_all ON team_members
  FOR ALL USING (restaurant_id = get_user_restaurant_id());

-- ============================================================
-- TABLA: menu_items
-- Carta del restaurante, por sucursal
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  categoria   TEXT DEFAULT 'Principales',
  precio      NUMERIC(12,2) DEFAULT 0,
  activo      BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_branch   ON menu_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_activo   ON menu_items(branch_id, activo);
CREATE INDEX IF NOT EXISTS idx_menu_categoria ON menu_items(branch_id, categoria);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY menu_items_all ON menu_items
  FOR ALL USING (
    branch_id IN (SELECT id FROM branches WHERE restaurant_id = get_user_restaurant_id())
  );

-- ============================================================
-- TABLA: caja_shifts
-- Turno de caja (apertura/cierre)
-- ============================================================
CREATE TABLE IF NOT EXISTS caja_shifts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id             UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  tipo_turno            TEXT CHECK (tipo_turno IN ('manana','tarde','noche','general')),
  nombre_turno          TEXT,
  fondo_inicial         NUMERIC(12,2) DEFAULT 0,
  abierto_at            BIGINT,       -- Date.now() timestamp
  cerrado_at            BIGINT,
  status                TEXT DEFAULT 'abierto' CHECK (status IN ('abierto','cerrado')),
  retiros               TEXT DEFAULT '[]',   -- JSON array
  arqueo_efectivo       NUMERIC(12,2),
  diferencia_caja       NUMERIC(12,2),
  motivo_diferencia     TEXT,
  total_facturado_turno NUMERIC(12,2) DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_branch  ON caja_shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_caja_status  ON caja_shifts(branch_id, status);

ALTER TABLE caja_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY caja_shifts_all ON caja_shifts
  FOR ALL USING (
    branch_id IN (SELECT id FROM branches WHERE restaurant_id = get_user_restaurant_id())
  );

-- ============================================================
-- TABLA: turns
-- Cada vez que se abre una mesa = un Turn
-- Es la tabla central de toda la operación
-- ============================================================
CREATE TABLE IF NOT EXISTS turns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id        UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  caja_shift_id    UUID REFERENCES caja_shifts(id) ON DELETE SET NULL,
  mesa_num         INTEGER,
  mozo             TEXT,
  status           TEXT DEFAULT 'abierta' CHECK (status IN ('abierta','cerrada','anulada')),
  opened_at        BIGINT,
  closed_at        BIGINT,
  anulado_at       BIGINT,
  total_facturado  NUMERIC(12,2) DEFAULT 0,
  metodo_pago      TEXT,
  descuento        NUMERIC(12,2) DEFAULT 0,
  propina          NUMERIC(12,2) DEFAULT 0,
  motivo_anulacion TEXT,
  enviado_cocina   BOOLEAN DEFAULT false,
  comanda_lista    BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turns_branch       ON turns(branch_id);
CREATE INDEX IF NOT EXISTS idx_turns_status       ON turns(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_turns_opened       ON turns(branch_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_turns_closed       ON turns(branch_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_turns_caja         ON turns(caja_shift_id);
CREATE INDEX IF NOT EXISTS idx_turns_cocina       ON turns(branch_id, status, enviado_cocina);

ALTER TABLE turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY turns_all ON turns
  FOR ALL USING (
    branch_id IN (SELECT id FROM branches WHERE restaurant_id = get_user_restaurant_id())
  );

-- ============================================================
-- TABLA: turn_items
-- Ítems de cada comanda
-- ============================================================
CREATE TABLE IF NOT EXISTS turn_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  turn_id         UUID NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id),
  menu_item_id    UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  menu_item_name  TEXT,
  cantidad        INTEGER DEFAULT 1,
  precio          NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turn_items_turn   ON turn_items(turn_id);
CREATE INDEX IF NOT EXISTS idx_turn_items_branch ON turn_items(branch_id);

ALTER TABLE turn_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY turn_items_all ON turn_items
  FOR ALL USING (
    branch_id IN (SELECT id FROM branches WHERE restaurant_id = get_user_restaurant_id())
  );

-- ============================================================
-- TABLA: reservations
-- Reservas del restaurante
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  telefono    TEXT,
  email       TEXT,
  personas    INTEGER DEFAULT 2,
  mesa        TEXT DEFAULT '-',
  canal       TEXT DEFAULT 'Manual',
  estado      TEXT DEFAULT 'confirmada',
  fecha       TEXT,    -- 'YYYY-MM-DD' string para compatibilidad
  hora        TEXT,    -- 'HH:MM' string
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_branch ON reservations(branch_id);
CREATE INDEX IF NOT EXISTS idx_reservations_fecha  ON reservations(branch_id, fecha);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservations_all ON reservations
  FOR ALL USING (
    branch_id IN (SELECT id FROM branches WHERE restaurant_id = get_user_restaurant_id())
  );

-- Reservas online (formulario público) — allow insert sin auth
CREATE POLICY reservations_public_insert ON reservations
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- TABLA: stock_items
-- Inventario de insumos por sucursal
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  unidad      TEXT DEFAULT 'kg',
  actual      NUMERIC(12,3) DEFAULT 0,
  minimo      NUMERIC(12,3) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_branch ON stock_items(branch_id);

ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_items_all ON stock_items
  FOR ALL USING (
    branch_id IN (SELECT id FROM branches WHERE restaurant_id = get_user_restaurant_id())
  );

-- ============================================================
-- TABLA: alerts
-- Alertas internas del sistema
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES branches(id) ON DELETE CASCADE,
  tipo          TEXT,
  mensaje       TEXT,
  leida         BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_restaurant ON alerts(restaurant_id);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY alerts_all ON alerts
  FOR ALL USING (restaurant_id = get_user_restaurant_id());

-- ============================================================
-- TABLA: audit_logs
-- Log de auditoría — INMUTABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  usuario_email   TEXT,
  usuario_rol     TEXT,
  categoria       TEXT,
  accion          TEXT NOT NULL,
  detalle         TEXT,
  sucursal_nombre TEXT,
  ts              BIGINT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_restaurant ON audit_logs(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_ts         ON audit_logs(restaurant_id, ts DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_select ON audit_logs
  FOR SELECT USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY audit_insert ON audit_logs
  FOR INSERT WITH CHECK (restaurant_id = get_user_restaurant_id());

-- Audit logs son inmutables: no update, no delete para usuarios normales
-- Solo admin puede borrar

-- ============================================================
-- REALTIME: habilitar para tablas operativas
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE turns;
ALTER PUBLICATION supabase_realtime ADD TABLE turn_items;
ALTER PUBLICATION supabase_realtime ADD TABLE caja_shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER restaurants_updated_at
  BEFORE UPDATE ON restaurants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER stock_items_updated_at
  BEFORE UPDATE ON stock_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
