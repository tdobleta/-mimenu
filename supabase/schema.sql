-- ============================================================
-- supabase/schema.sql
-- Schema completo de mimenú — actualizado 14/05/2026
-- Incluye todas las migraciones aplicadas hasta la fecha
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

  RETURN COALESCE(v_role, 'Mozo');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── TABLAS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id),
  nombre      text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id         uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  nombre                text NOT NULL,
  direccion             text DEFAULT '',
  acepta_reservas_online boolean DEFAULT false,
  created_at            timestamptz DEFAULT now()
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
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  opciones    jsonb DEFAULT '[]',
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS turns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  mesa_num         integer NOT NULL,
  mozo             text DEFAULT '',
  status           text DEFAULT 'abierta' CHECK (status IN ('abierta', 'cerrada')),
  opened_at        bigint NOT NULL DEFAULT extract(epoch from now()) * 1000,
  closed_at        bigint,
  total_facturado  numeric(12,2) DEFAULT 0,
  metodo_pago      text DEFAULT '',
  enviado_cocina   boolean DEFAULT false,
  comanda_lista    boolean DEFAULT false,
  cocina_estado    text DEFAULT 'nueva' CHECK (cocina_estado IN ('nueva', 'preparando', 'lista')),
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

CREATE TABLE IF NOT EXISTS caja_shifts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  apertura        bigint NOT NULL,
  cierre          bigint,
  monto_apertura  numeric(12,2) DEFAULT 0,
  monto_cierre    numeric(12,2) DEFAULT 0,
  total_ventas    numeric(12,2) DEFAULT 0,
  status          text DEFAULT 'abierto' CHECK (status IN ('abierto', 'cerrado')),
  created_at      timestamptz DEFAULT now()
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
  menu_item_id    text NOT NULL,
  branch_id       text NOT NULL,
  ingrediente_id  text NOT NULL,
  cantidad        numeric(10,3) NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_precios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id  text NOT NULL UNIQUE,
  branch_id      text NOT NULL,
  costo          numeric(12,2) NOT NULL DEFAULT 0,
  proveedor      text DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_egresos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id            text NOT NULL,
  ingrediente_id       text NOT NULL,
  ingrediente_nombre   text NOT NULL DEFAULT '',
  cantidad             numeric(10,3) NOT NULL,
  unidad               text DEFAULT '',
  motivo               text DEFAULT '',
  origen               text DEFAULT 'manual',
  ts                   bigint NOT NULL DEFAULT extract(epoch from now()) * 1000,
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
  notas       text DEFAULT '',
  status      text DEFAULT 'pendiente',
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
  ts             bigint NOT NULL DEFAULT extract(epoch from now()) * 1000,
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
CREATE INDEX IF NOT EXISTS idx_branches_restaurant     ON branches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_branch       ON menu_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_turns_branch            ON turns(branch_id);
CREATE INDEX IF NOT EXISTS idx_turns_status            ON turns(status);
CREATE INDEX IF NOT EXISTS idx_turns_cocina_estado     ON turns(cocina_estado) WHERE status = 'abierta';
CREATE INDEX IF NOT EXISTS idx_turn_items_turn         ON turn_items(turn_id);
CREATE INDEX IF NOT EXISTS idx_turn_items_branch       ON turn_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_team_members_restaurant ON team_members(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user       ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_branch      ON stock_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_egresos_branch    ON stock_egresos(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_egresos_ts        ON stock_egresos(ts DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_branch     ON reservations(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_restaurant   ON audit_logs(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ts           ON audit_logs(ts DESC);

-- ── RLS ───────────────────────────────────────────────────────
-- Ver migration_rls_completo_v3.sql para las políticas completas
-- Todas las tablas tienen RLS habilitado con políticas multi-tenant

-- ── STORAGE ───────────────────────────────────────────────────
-- Bucket: menu-images (público) para imágenes de platos
-- Ver migration_menu_images.sql
