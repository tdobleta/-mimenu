-- ============================================================
-- E1A Migration 1/2: Restaurant slug
--
-- Adds a human-friendly slug/code to restaurants for employee
-- login identification (e.g. "felisa", "cafe-olivos").
--
-- Nullable initially — existing restaurants will set their slug
-- via Configuracion UI in a future task.
-- ============================================================

-- Add nullable slug column
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS slug text;

-- Unique partial index — allows multiple NULLs (standard Postgres behavior)
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_slug_unique
  ON restaurants (slug)
  WHERE slug IS NOT NULL;

-- Format constraint: lowercase alphanumeric + hyphens, 3-30 chars,
-- no leading/trailing hyphen.
-- Examples: "felisa", "cafe-olivos", "la-parrilla-23"
-- Rejects: "Felisa" (uppercase), "-bad" (leading hyphen), "ab" (too short)
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');
