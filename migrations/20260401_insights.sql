-- ============================================================
-- Migration: insights table (weekly/monthly reports)
-- MyNorth App — Supabase
-- Idempotent: safe to run multiple times
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type VARCHAR(10) NOT NULL, -- 'WEEKLY' or 'MONTHLY'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  narrative TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_insights_user_id ON insights(user_id);
CREATE INDEX IF NOT EXISTS idx_insights_period ON insights(period_type, period_start);

ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'insights' AND policyname = 'Users can view their own insights'
  ) THEN
    CREATE POLICY "Users can view their own insights"
      ON insights FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Counselors can view insights for students they are linked to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'insights' AND policyname = 'Counselors can view linked student insights'
  ) THEN
    CREATE POLICY "Counselors can view linked student insights"
      ON insights FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM supervisor_links sl
          WHERE sl.supervisor_id = auth.uid()
            AND sl.student_id = insights.user_id
            AND sl.status = 'ACTIVE'
        )
      );
  END IF;
END $$;

COMMIT;
