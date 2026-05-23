-- CRM: clientes y visitas
-- Aplicar en Supabase Dashboard → SQL Editor → Run

CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  telefono        TEXT,
  email           TEXT,
  notas           TEXT,
  puntos          INTEGER DEFAULT 0 CHECK (puntos >= 0),
  nacimiento      DATE,
  whatsapp_optout BOOLEAN DEFAULT FALSE,   -- C3: obligatorio para compliance
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

-- RLS
ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_own_restaurant" ON customers
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
      UNION
      SELECT restaurant_id FROM team_members
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "customer_visits_own_restaurant" ON customer_visits
  USING (
    customer_id IN (
      SELECT c.id FROM customers c
      WHERE c.restaurant_id IN (
        SELECT id FROM restaurants WHERE owner_id = auth.uid()
        UNION
        SELECT restaurant_id FROM team_members
          WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  );

-- RPCs atómicos — nunca stock negativo
CREATE OR REPLACE FUNCTION increment_customer_points(p_id UUID, p_pts INTEGER)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE customers SET puntos = COALESCE(puntos, 0) + p_pts WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION decrement_customer_points(p_id UUID, p_pts INTEGER)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE customers SET puntos = GREATEST(0, COALESCE(puntos, 0) - p_pts) WHERE id = p_id;
$$;
