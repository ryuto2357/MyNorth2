-- ============================================================
-- Migration 003: Add disc_history to users
-- MyNorth App — Supabase
-- Idempotent: safe to run multiple times
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'disc_history'
  ) THEN
    ALTER TABLE users ADD COLUMN disc_history JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

COMMIT;
