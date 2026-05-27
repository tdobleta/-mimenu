-- ============================================================
-- Mercado Pago Point payment intents registry
--
-- Stores server-created MP Point intents so creation is idempotent and status
-- polling can be scoped to the tenant that created the intent.
-- ============================================================

CREATE TABLE IF NOT EXISTS mp_payment_intents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  turn_id         UUID REFERENCES turns(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  mp_intent_id    TEXT NOT NULL UNIQUE,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description     TEXT DEFAULT '',
  status          TEXT DEFAULT '',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  request_payload  JSONB NOT NULL DEFAULT '{}'::JSONB,
  response_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_status_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_payment_intents_restaurant_created
  ON mp_payment_intents(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mp_payment_intents_turn
  ON mp_payment_intents(turn_id)
  WHERE turn_id IS NOT NULL;

ALTER TABLE mp_payment_intents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mp_payment_intents FROM authenticated;
GRANT ALL ON TABLE public.mp_payment_intents TO service_role;

-- Verification:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'mp_payment_intents';
