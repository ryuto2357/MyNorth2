-- ============================================================
-- Migration 002: Beta Schema Updates (P0.1 – P0.11)
-- MyNorth App — Supabase
-- Idempotent: safe to run multiple times
-- ============================================================

BEGIN;

-- ============================================================
-- P0.1 — Add role column to users
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'STUDENT';
  END IF;
END $$;

-- Add CHECK constraint for role (idempotent via name check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('STUDENT', 'COUNSELOR', 'PARENT'));
  END IF;
END $$;

-- Update handle_new_user() trigger to include role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, onboarding_complete)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'STUDENT'),
    false
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- P0.2 — Update tier values: FREE→TIER_1, PREMIUM→TIER_2, ACHIEVER→TIER_3
-- ============================================================

-- Migrate existing data first
UPDATE users SET tier = 'TIER_1' WHERE tier = 'FREE';
UPDATE users SET tier = 'TIER_2' WHERE tier = 'PREMIUM';
UPDATE users SET tier = 'TIER_3' WHERE tier = 'ACHIEVER';

-- Change default
ALTER TABLE users ALTER COLUMN tier SET DEFAULT 'TIER_1';

-- Add CHECK constraint for tier (drop old one if exists, then add)
DO $$
BEGIN
  -- Drop any existing tier check constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_tier_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_tier_check;
  END IF;

  ALTER TABLE users ADD CONSTRAINT users_tier_check
    CHECK (tier IN ('TIER_1', 'TIER_2', 'TIER_3'));
END $$;


-- ============================================================
-- P0.3 — Add capacity fields to users, drop inefficiency_score
-- ============================================================

-- Drop inefficiency_score if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'inefficiency_score'
  ) THEN
    ALTER TABLE users DROP COLUMN inefficiency_score;
  END IF;
END $$;

-- Add new capacity columns (each guarded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'demonstrated_capacity_minutes'
  ) THEN
    ALTER TABLE users ADD COLUMN demonstrated_capacity_minutes FLOAT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'i_gap'
  ) THEN
    ALTER TABLE users ADD COLUMN i_gap FLOAT DEFAULT 1.0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'stretch_factor'
  ) THEN
    ALTER TABLE users ADD COLUMN stretch_factor FLOAT DEFAULT 1.10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'disc_profile'
  ) THEN
    ALTER TABLE users ADD COLUMN disc_profile JSONB DEFAULT '{"task_people": 0.5, "fast_slow": 0.5}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'patterns'
  ) THEN
    ALTER TABLE users ADD COLUMN patterns JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'daily_minutes_log'
  ) THEN
    ALTER TABLE users ADD COLUMN daily_minutes_log JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;


-- ============================================================
-- P0.4 — Extend goals table
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'hours_initial'
  ) THEN
    ALTER TABLE goals ADD COLUMN hours_initial FLOAT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'hours_completed'
  ) THEN
    ALTER TABLE goals ADD COLUMN hours_completed FLOAT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'hours_override'
  ) THEN
    ALTER TABLE goals ADD COLUMN hours_override FLOAT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'estimation_method'
  ) THEN
    ALTER TABLE goals ADD COLUMN estimation_method VARCHAR(30);
  END IF;
END $$;


-- ============================================================
-- P0.5 — Extend tasks table
-- ============================================================
-- Status values: PENDING, COMPLETED, ATTEMPTED, SKIPPED (no constraint, flexible)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMP;
  END IF;
END $$;


-- ============================================================
-- P0.6 — Extend nodes table
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'last_accessed_at'
  ) THEN
    ALTER TABLE nodes ADD COLUMN last_accessed_at TIMESTAMP DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE nodes ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;


-- ============================================================
-- P0.7 — Create supervisor_links table
-- ============================================================

CREATE TABLE IF NOT EXISTS supervisor_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_role VARCHAR(20) NOT NULL,
  consent_level VARCHAR(30) DEFAULT 'METRICS_ONLY',
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, supervisor_id)
);

CREATE INDEX IF NOT EXISTS idx_supervisor_links_student_id ON supervisor_links(student_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_links_supervisor_id ON supervisor_links(supervisor_id);

ALTER TABLE supervisor_links ENABLE ROW LEVEL SECURITY;

-- Supervisors can read their own links
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'supervisor_links' AND policyname = 'Supervisors can view their own links'
  ) THEN
    CREATE POLICY "Supervisors can view their own links"
      ON supervisor_links FOR SELECT
      USING (auth.uid() = supervisor_id);
  END IF;
END $$;

-- Students can read their own links
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'supervisor_links' AND policyname = 'Students can view their own links'
  ) THEN
    CREATE POLICY "Students can view their own links"
      ON supervisor_links FOR SELECT
      USING (auth.uid() = student_id);
  END IF;
END $$;

-- Students can update their own links (e.g., change consent_level)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'supervisor_links' AND policyname = 'Students can update their own links'
  ) THEN
    CREATE POLICY "Students can update their own links"
      ON supervisor_links FOR UPDATE
      USING (auth.uid() = student_id);
  END IF;
END $$;


-- ============================================================
-- P0.8 — Create relay_messages table
-- ============================================================

CREATE TABLE IF NOT EXISTS relay_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id),
  to_user_id UUID NOT NULL REFERENCES users(id),
  from_role VARCHAR(20) NOT NULL,
  original_content TEXT NOT NULL,
  translated_content TEXT,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE relay_messages ENABLE ROW LEVEL SECURITY;

-- Sender can read their own sent messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'relay_messages' AND policyname = 'Sender can view their messages'
  ) THEN
    CREATE POLICY "Sender can view their messages"
      ON relay_messages FOR SELECT
      USING (auth.uid() = from_user_id);
  END IF;
END $$;

-- Recipient can read messages sent to them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'relay_messages' AND policyname = 'Recipient can view their messages'
  ) THEN
    CREATE POLICY "Recipient can view their messages"
      ON relay_messages FOR SELECT
      USING (auth.uid() = to_user_id);
  END IF;
END $$;

-- Sender can insert messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'relay_messages' AND policyname = 'Users can send messages'
  ) THEN
    CREATE POLICY "Users can send messages"
      ON relay_messages FOR INSERT
      WITH CHECK (auth.uid() = from_user_id);
  END IF;
END $$;


-- ============================================================
-- P0.9 — Create reference_hours table + seed data
-- ============================================================

CREATE TABLE IF NOT EXISTS reference_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_category VARCHAR(255) NOT NULL,
  subcategory VARCHAR(255),
  hours_novice FLOAT NOT NULL,
  hours_intermediate FLOAT NOT NULL,
  hours_advanced FLOAT NOT NULL,
  source TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(goal_category, subcategory)
);

-- No RLS needed — public read table

-- Seed data (ON CONFLICT to make idempotent)
INSERT INTO reference_hours (goal_category, subcategory, hours_novice, hours_intermediate, hours_advanced, source) VALUES
  -- UTBK-SNBT subcategories
  ('UTBK-SNBT', 'TPS',     300, 200, 100, 'Indonesian education research estimates'),
  ('UTBK-SNBT', 'TKA IPA', 400, 250, 120, 'Indonesian education research estimates'),
  ('UTBK-SNBT', 'TKA IPS', 350, 220, 110, 'Indonesian education research estimates'),

  -- English proficiency tests
  ('IELTS',  NULL, 600, 300, 100, 'Cambridge & British Council guidelines'),
  ('TOEFL',  NULL, 600, 300, 100, 'ETS preparation guidelines'),

  -- SAT
  ('SAT', NULL, 200, 100, 40, 'College Board & Khan Academy estimates'),

  -- Programming
  ('Programming', 'Python',  500, 250, 100, 'Industry training benchmarks'),
  ('Programming', 'Web Dev', 800, 400, 150, 'Industry training benchmarks')

ON CONFLICT (goal_category, subcategory) DO NOTHING;


-- ============================================================
-- P0.10 — Create subscriptions table
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL DEFAULT 'TIER_1',
  status VARCHAR(20) DEFAULT 'ACTIVE',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Users can view their own subscription'
  ) THEN
    CREATE POLICY "Users can view their own subscription"
      ON subscriptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- P0.11 — Multi-role RLS policies
-- ============================================================
-- These ADD new policies; existing self-access policies remain intact.

-- GOALS: Counselors and Parents can view linked students' goals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'goals' AND policyname = 'Supervisors can view linked student goals'
  ) THEN
    CREATE POLICY "Supervisors can view linked student goals"
      ON goals FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM supervisor_links sl
          WHERE sl.supervisor_id = auth.uid()
            AND sl.student_id = goals.user_id
            AND sl.status = 'ACTIVE'
            AND sl.consent_level IN ('GOALS_VISIBLE', 'FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS')
        )
      );
  END IF;
END $$;

-- TASKS: Counselors and Parents can view linked students' tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tasks' AND policyname = 'Supervisors can view linked student tasks'
  ) THEN
    CREATE POLICY "Supervisors can view linked student tasks"
      ON tasks FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM supervisor_links sl
          WHERE sl.supervisor_id = auth.uid()
            AND sl.student_id = tasks.user_id
            AND sl.status = 'ACTIVE'
            AND sl.consent_level IN ('GOALS_VISIBLE', 'FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS')
        )
      );
  END IF;
END $$;

-- NODES: Counselors only (not Parents) can view linked students' nodes
-- Requires higher consent: FULL_PLAN_ACCESS or BEHAVIORAL_PATTERNS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nodes' AND policyname = 'Counselors can view linked student nodes'
  ) THEN
    CREATE POLICY "Counselors can view linked student nodes"
      ON nodes FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM supervisor_links sl
          WHERE sl.supervisor_id = auth.uid()
            AND sl.student_id = nodes.user_id
            AND sl.status = 'ACTIVE'
            AND sl.supervisor_role = 'COUNSELOR'
            AND sl.consent_level IN ('FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS')
        )
      );
  END IF;
END $$;

-- USERS: Supervisors can view basic info of linked students
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Supervisors can view linked student info'
  ) THEN
    CREATE POLICY "Supervisors can view linked student info"
      ON users FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM supervisor_links sl
          WHERE sl.supervisor_id = auth.uid()
            AND sl.student_id = users.id
            AND sl.status = 'ACTIVE'
        )
      );
  END IF;
END $$;

COMMIT;
