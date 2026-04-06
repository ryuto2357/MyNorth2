-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table (extends Supabase auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  age INTEGER,
  school VARCHAR(255),
  grade VARCHAR(10),
  tier VARCHAR(20) DEFAULT 'FREE',
  onboarding_complete BOOLEAN DEFAULT FALSE,
  inefficiency_score FLOAT DEFAULT 0.0,
  schedule JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- AUTO-CREATE USERS TRIGGER
-- ============================================
-- This trigger automatically creates a users record when a new auth user is created

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, onboarding_complete)
  VALUES (new.id, new.email, false);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create goals table
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  why TEXT,
  north_star VARCHAR(500),
  deadline DATE,
  priority_rank INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  familiarity_baseline INTEGER,
  hours_remaining FLOAT,
  days_effective INTEGER,
  completion_rate_history FLOAT,
  current_achievement VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);

-- Create nodes table (constellation nodes)
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  cluster_id VARCHAR(255),
  seniority_level INTEGER,
  label VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  familiarity_score INTEGER DEFAULT 0,
  position_x FLOAT,
  position_y FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nodes_user_id ON nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_nodes_goal_id ON nodes(goal_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id);

-- Create links table
CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  relation_type VARCHAR(50),
  strength FLOAT DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  duration_minutes INTEGER,
  scheduled_for DATE,
  scheduled_time VARCHAR(10),
  status VARCHAR(50) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_node_id ON tasks(node_id);

-- Create chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);

-- Create vectors table for RAG
CREATE TABLE IF NOT EXISTS vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(768),
  source_type VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vectors_user_id ON vectors(user_id);
-- Use HNSW index for efficient vector search
CREATE INDEX IF NOT EXISTS idx_vectors_embedding ON vectors USING hnsw (embedding vector_cosine_ops);

-- ============================================
-- VECTOR SEARCH RPC
-- ============================================

CREATE OR REPLACE FUNCTION match_vectors (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  match_user_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vectors.id,
    vectors.user_id,
    vectors.content,
    vectors.metadata,
    1 - (vectors.embedding <=> query_embedding) AS similarity
  FROM vectors
  WHERE vectors.user_id = match_user_id
    AND 1 - (vectors.embedding <=> query_embedding) > match_threshold
  ORDER BY vectors.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE vectors ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- USERS TABLE
CREATE POLICY "Users can view their own record"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own record"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- GOALS TABLE
CREATE POLICY "Users can view their own goals"
  ON goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own goals"
  ON goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals"
  ON goals FOR UPDATE
  USING (auth.uid() = user_id);

-- NODES TABLE
CREATE POLICY "Users can view their own nodes"
  ON nodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own nodes"
  ON nodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own nodes"
  ON nodes FOR UPDATE
  USING (auth.uid() = user_id);

-- LINKS TABLE
CREATE POLICY "Users can view their own links"
  ON links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nodes
      WHERE nodes.id = links.source_id
      AND nodes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own links"
  ON links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nodes
      WHERE nodes.id = links.source_id
      AND nodes.user_id = auth.uid()
    )
  );

-- TASKS TABLE
CREATE POLICY "Users can view their own tasks"
  ON tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
  ON tasks FOR UPDATE
  USING (auth.uid() = user_id);

-- CHAT_SESSIONS TABLE
CREATE POLICY "Users can view their own chat sessions"
  ON chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- CHAT_MESSAGES TABLE
CREATE POLICY "Users can view their own chat messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- VECTORS TABLE
CREATE POLICY "Users can view their own vectors"
  ON vectors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vectors"
  ON vectors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SUPERVISOR SYSTEM TABLES
-- ============================================================

-- Create supervisor_links table
CREATE TABLE IF NOT EXISTS supervisor_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_role VARCHAR(20) NOT NULL, -- 'PARENT' or 'COUNSELOR'
  consent_level VARCHAR(30) DEFAULT 'METRICS_ONLY', -- 'METRICS_ONLY', 'GOALS_VISIBLE', 'FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS'
  status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'ACTIVE', 'DENIED', 'CANCELLED'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, supervisor_id)
);

CREATE INDEX IF NOT EXISTS idx_supervisor_links_student_id ON supervisor_links(student_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_links_supervisor_id ON supervisor_links(supervisor_id);

ALTER TABLE supervisor_links ENABLE ROW LEVEL SECURITY;

-- supervisor_links RLS
CREATE POLICY "Supervisors can view their own links"
  ON supervisor_links FOR SELECT
  USING (auth.uid() = supervisor_id);

CREATE POLICY "Students can view their own links"
  ON supervisor_links FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can update their own links"
  ON supervisor_links FOR UPDATE
  USING (auth.uid() = student_id);

CREATE POLICY "Supervisors can insert link requests"
  ON supervisor_links FOR INSERT
  WITH CHECK (auth.uid() = supervisor_id);

-- Create relay_messages table
CREATE TABLE IF NOT EXISTS relay_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_role VARCHAR(20) NOT NULL,
  original_content TEXT NOT NULL,
  translated_content TEXT,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE relay_messages ENABLE ROW LEVEL SECURITY;

-- relay_messages RLS
CREATE POLICY "Sender can view their messages"
  ON relay_messages FOR SELECT
  USING (auth.uid() = from_user_id);

CREATE POLICY "Recipient can view their messages"
  ON relay_messages FOR SELECT
  USING (auth.uid() = to_user_id);

CREATE POLICY "Users can send messages"
  ON relay_messages FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- Create reference_hours table
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

-- Seed reference data
INSERT INTO reference_hours (goal_category, subcategory, hours_novice, hours_intermediate, hours_advanced, source) VALUES
  ('UTBK-SNBT', 'TPS',     300, 200, 100, 'Indonesian education research estimates'),
  ('UTBK-SNBT', 'TKA IPA', 400, 250, 120, 'Indonesian education research estimates'),
  ('UTBK-SNBT', 'TKA IPS', 350, 220, 110, 'Indonesian education research estimates'),
  ('IELTS',  NULL, 600, 300, 100, 'Cambridge & British Council guidelines'),
  ('TOEFL',  NULL, 600, 300, 100, 'ETS preparation guidelines'),
  ('SAT', NULL, 200, 100, 40, 'College Board & Khan Academy estimates'),
  ('Programming', 'Python',  500, 250, 100, 'Industry training benchmarks'),
  ('Programming', 'Web Dev', 800, 400, 150, 'Industry training benchmarks')
ON CONFLICT (goal_category, subcategory) DO NOTHING;

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL DEFAULT 'FREE',
  status VARCHAR(20) DEFAULT 'ACTIVE',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Create crisis_alerts table
CREATE TABLE IF NOT EXISTS crisis_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counselor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crisis_alerts_counselor ON crisis_alerts (counselor_id, resolved, created_at DESC);

-- ============================================================
-- CROSS-ROLE RLS POLICIES
-- ============================================================

-- GOALS: Supervisors can view linked students' goals
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

-- TASKS: Supervisors can view linked students' tasks
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

-- NODES: Counselors only can view linked students' nodes
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

-- USERS: Supervisors can view basic info of linked students
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
