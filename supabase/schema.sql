-- ============================================================
-- supabase/schema.sql
-- Schema completo de mimenú — actualizado 18/05/2026
-- Fuente de verdad: Supabase Dashboard + entidades JSONC + store.jsx
-- ============================================================

-- ── FUNCIONES BASE ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_restaurant_id()
RETURNS uuid AS $$
DECLARE
  v_restaurant_id uuid;
BEGIN
  SELECT id INTO v_restaurant_id
  FROM restaurants
  WHERE owner_id = auth.uid()
  LIMIT 1;

  IF v_restaurant_id IS NOT NULL THEN
    RETURN v_restaurant_id;
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM team_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  RETURN v_restaurant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
DECLARE
  v_role text;
  v_restaurant_id uuid;
BEGIN
  v_restaurant_id := get_user_restaurant_id();
  IF v_restaurant_id IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM restaurants
    WHERE id = v_restaurant_id AND owner_id = auth.uid()
  ) THEN RETURN 'Dueno'; END IF;

  SELECT rol INTO v_role
  FROM team_members
  WHERE user_id = auth.uid()
    AND restaurant_id = v_restaurant_id
  LIMIT 1;

  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── TABLAS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurants (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                uuid NOT NULL REFERENCES auth.users(id),
  owner_email             text DEFAULT '',
  nombre                  text NOT NULL,
  direccion               text DEFAULT '',
  telefono                text DEFAULT '',
  onboarding_completado   boolean DEFAULT false,
  created_at              timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id           uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  nombre                  text NOT NULL,
  direccion               text DEFAULT '',
  mesas                   integer DEFAULT 8,
  franjas                 jsonb DEFAULT '["12:00","13:00","20:00","21:00"]',
  metodo_conexion         text DEFAULT 'mimenú POS',
  acepta_reservas_online  boolean DEFAULT false,
  slug                    text UNIQUE,
  created_at              timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES auth.users(id),
  email          text NOT NULL,
  nombre         text DEFAULT '',
  rol            text NOT NULL CHECK (rol IN ('Encargado', 'Mozo', 'Cocinero')),
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  precio      numeric(12,2) NOT NULL DEFAULT 0,
  categoria   text DEFAULT 'Principales',
  activo      boolean DEFAULT true,
  imagen_url  text DEFAULT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  menu_item_id  uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  opciones      jsonb DEFAULT '[]',
  created_at    timestamptz DEFAULT now()
);

-- caja_shifts va antes de turns porque turns.caja_shift_id la referencia
CREATE TABLE IF NOT EXISTS caja_shifts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id             uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  tipo_turno            text CHECK (tipo_turno IN ('manana', 'tarde', 'noche', 'general')),
  nombre_turno          text DEFAULT '',
  fondo_inicial         numeric(12,2) DEFAULT 0,
  abierto_at            timestamptz NOT NULL DEFAULT now(),
  cerrado_at            timestamptz,
  status                text DEFAULT 'abierto' CHECK (status IN ('abierto', 'cerrado')),
  retiros               text DEFAULT '[]',
  arqueo_efectivo       numeric(12,2),
  diferencia_caja       numeric(12,2),
  motivo_diferencia     text DEFAULT '',
  total_facturado_turno numeric(12,2) DEFAULT 0,
  created_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS turns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  caja_shift_id    uuid REFERENCES caja_shifts(id),
  mesa_num         integer NOT NULL,
  mozo             text DEFAULT '',
  status           text DEFAULT 'abierta' CHECK (status IN ('abierta', 'cerrada', 'anulada')),
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  anulado_at       timestamptz,
  total_facturado  numeric(12,2) DEFAULT 0,
  propina          numeric(12,2) DEFAULT 0,
  descuento        numeric(12,2) DEFAULT 0,
  metodo_pago      text DEFAULT '',
  motivo_anulacion text DEFAULT '',
  enviado_cocina      boolean DEFAULT false,
  comanda_lista       boolean DEFAULT false,
  cocina_estado       text DEFAULT 'nueva' CHECK (cocina_estado IN ('nueva', 'preparando', 'lista')),
  comanda_entregada   boolean DEFAULT false,
  comanda_entregada_at timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS turn_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id          uuid NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  branch_id        uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  menu_item_id     uuid REFERENCES menu_items(id),
  menu_item_name   text NOT NULL,
  cantidad         integer NOT NULL DEFAULT 1,
  precio           numeric(12,2) NOT NULL DEFAULT 0,
  notas            text DEFAULT '',
  modificadores    jsonb DEFAULT '[]',
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  unidad      text DEFAULT 'kg',
  actual      numeric(10,3) DEFAULT 0,
  minimo      numeric(10,3) DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_recipes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id    uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  branch_id       uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  ingrediente_id  uuid REFERENCES stock_items(id) ON DELETE CASCADE,
  cantidad        numeric(10,3) NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_precios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id  uuid NOT NULL UNIQUE REFERENCES stock_items(id) ON DELETE CASCADE,
  branch_id      uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  costo          numeric(12,2) NOT NULL DEFAULT 0,
  proveedor      text DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_egresos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id            uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  ingrediente_id       uuid REFERENCES stock_items(id),
  ingrediente_nombre   text NOT NULL DEFAULT '',
  cantidad             numeric(10,3) NOT NULL,
  unidad               text DEFAULT '',
  motivo               text DEFAULT '',
  origen               text DEFAULT 'manual',
  ts                   timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  email       text DEFAULT '',
  telefono    text DEFAULT '',
  fecha       text NOT NULL,
  hora        text NOT NULL,
  personas    integer DEFAULT 1,
  mesa        text DEFAULT '-',
  canal       text DEFAULT 'Manual',
  notas       text DEFAULT '',
  estado      text DEFAULT 'confirmada',
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id      uuid REFERENCES branches(id),
  usuario        text NOT NULL,
  rol            text DEFAULT '',
  categoria      text DEFAULT '',
  accion         text NOT NULL,
  detalle        text DEFAULT '',
  sucursal       text DEFAULT '',
  ts             timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id      uuid REFERENCES branches(id),
  tipo           text NOT NULL,
  mensaje        text NOT NULL,
  leida          boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

-- ── ÍNDICES ───────────────────────────────────────────────────

-- Índices base (existentes)
CREATE INDEX IF NOT EXISTS idx_branches_restaurant       ON branches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_branch         ON menu_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_turns_branch              ON turns(branch_id);
CREATE INDEX IF NOT EXISTS idx_turns_status              ON turns(status);
CREATE INDEX IF NOT EXISTS idx_turns_cocina_estado       ON turns(cocina_estado) WHERE status = 'abierta';
CREATE INDEX IF NOT EXISTS idx_turn_items_turn           ON turn_items(turn_id);
CREATE INDEX IF NOT EXISTS idx_turn_items_branch         ON turn_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_team_members_restaurant   ON team_members(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user         ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_branch        ON stock_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_egresos_branch      ON stock_egresos(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_egresos_ts          ON stock_egresos(ts DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_branch       ON reservations(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_restaurant     ON audit_logs(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ts             ON audit_logs(ts DESC);

-- Índices compuestos para escalar a 100+ usuarios concurrentes
CREATE INDEX IF NOT EXISTS idx_turns_branch_status_closed  ON turns(branch_id, status, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_turns_branch_abierta        ON turns(branch_id, status) WHERE status = 'abierta';
CREATE INDEX IF NOT EXISTS idx_turn_items_turn_branch      ON turn_items(turn_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email_rest     ON team_members(email, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_caja_shifts_branch_status   ON caja_shifts(branch_id, status) WHERE status = 'abierto';
CREATE INDEX IF NOT EXISTS idx_reservations_branch_fecha   ON reservations(branch_id, fecha);

-- ── FUNCIONES ANALYTICS ───────────────────────────────────────

CREATE OR REPLACE FUNCTION get_top_products(
  p_branch_id uuid, p_desde timestamptz, p_hasta timestamptz, p_limit int DEFAULT 10
)
RETURNS TABLE(nombre text, unidades bigint, monto numeric) AS $$
  SELECT
    ti.menu_item_name AS nombre,
    SUM(ti.cantidad)::bigint AS unidades,
    SUM(ti.cantidad * ti.precio) AS monto
  FROM turn_items ti
  JOIN turns t ON t.id = ti.turn_id
  WHERE t.branch_id = p_branch_id
    AND t.status = 'cerrada'
    AND t.closed_at BETWEEN p_desde AND p_hasta
  GROUP BY ti.menu_item_name
  ORDER BY unidades DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_facturacion_range(
  p_branch_id uuid, p_desde timestamptz, p_hasta timestamptz
)
RETURNS TABLE(total numeric, ticket_promedio numeric, cantidad bigint) AS $$
  SELECT
    COALESCE(SUM(total_facturado), 0) AS total,
    CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(total_facturado) / COUNT(*), 2) ELSE 0 END AS ticket_promedio,
    COUNT(*)::bigint AS cantidad
  FROM turns
  WHERE branch_id = p_branch_id
    AND status = 'cerrada'
    AND closed_at BETWEEN p_desde AND p_hasta;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── FUNCIÓN CIERRE ATÓMICO ────────────────────────────────────

CREATE OR REPLACE FUNCTION cerrar_mesa_atomico(
  p_turn_id uuid,
  p_total numeric,
  p_propina numeric,
  p_metodo text,
  p_mozo text,
  p_caja_shift_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_turn turns%ROWTYPE;
  v_nuevo_total numeric;
BEGIN
  SELECT * INTO v_turn
  FROM turns
  WHERE id = p_turn_id AND status = 'abierta'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'turno_ya_cerrado');
  END IF;

  UPDATE turns SET
    status          = 'cerrada',
    closed_at       = now(),
    total_facturado = p_total,
    propina         = p_propina,
    metodo_pago     = p_metodo,
    mozo            = p_mozo
  WHERE id = p_turn_id;

  IF p_caja_shift_id IS NOT NULL THEN
    SELECT COALESCE(SUM(total_facturado + propina), 0) INTO v_nuevo_total
    FROM turns
    WHERE caja_shift_id = p_caja_shift_id AND status = 'cerrada';

    UPDATE caja_shifts
    SET total_facturado_turno = v_nuevo_total
    WHERE id = p_caja_shift_id;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RLS ───────────────────────────────────────────────────────
-- Ver migration_rls_completo_v3.sql para las políticas completas
-- Todas las tablas tienen RLS habilitado con políticas multi-tenant

-- ── STORAGE ───────────────────────────────────────────────────
-- Bucket: menu-images (público) para imágenes de platos
-- Ver migration_menu_images.sql
