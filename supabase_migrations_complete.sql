-- ============================================================================
-- MyNorth Complete Database Schema
-- ============================================================================
-- This is a complete migration file that includes ALL tables needed for MyNorth
-- Generated: 2026-04-06
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE (extends Supabase auth)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  age INTEGER,
  school VARCHAR(255),
  grade VARCHAR(10),
  role VARCHAR(20) DEFAULT 'STUDENT', -- 'STUDENT', 'COUNSELOR', 'PARENT'
  tier VARCHAR(20) DEFAULT 'FREE', -- 'FREE', 'PREMIUM', 'ACHIEVER', 'TIER_1'
  onboarding_complete BOOLEAN DEFAULT FALSE,
  inefficiency_score FLOAT DEFAULT 0.0,
  
  -- JSONB fields
  schedule JSONB,
  disc_profile JSONB,
  patterns JSONB,
  daily_minutes_log JSONB, -- Array of numbers
  
  -- User corpus cache
  user_corpus JSONB,
  user_corpus_updated_at TIMESTAMP,
  
  -- Capacity and performance metrics
  demonstrated_capacity_minutes INTEGER DEFAULT 0,
  stretch_factor FLOAT DEFAULT 1.1,
  i_gap FLOAT DEFAULT 1.0,
  gate_pace FLOAT DEFAULT 0,
  pace_gap FLOAT DEFAULT 1.0,
  primary_blocker VARCHAR(255),
  gates_cleared_log JSONB DEFAULT '[]'::jsonb, -- Array of {date, node_id} objects
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================================
-- AUTO-CREATE USERS TRIGGER
-- ============================================================================

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

-- ============================================================================
-- GOALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  why TEXT,
  north_star VARCHAR(500),
  deadline DATE,
  priority_rank INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  
  -- Categorization
  category VARCHAR(255),
  category_text VARCHAR(255),
  motivation_type VARCHAR(50),
  deadline_horizon VARCHAR(50),
  
  -- Hours tracking
  familiarity_baseline INTEGER,
  hours_initial FLOAT,
  hours_completed FLOAT DEFAULT 0,
  hours_remaining FLOAT,
  hours_override FLOAT,
  estimation_method VARCHAR(50),
  
  -- Performance metrics
  days_effective INTEGER,
  completion_rate_history FLOAT,
  current_achievement VARCHAR(255),
  demonstrated_capacity_minutes INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);

-- ============================================================================
-- NODES TABLE (Constellation Nodes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  cluster_id VARCHAR(255),
  seniority_level INTEGER DEFAULT 0,
  label VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'ACTIVE', -- 'ACTIVE', 'WITHERING', 'ARCHIVED'
  familiarity_score INTEGER DEFAULT 0,
  
  -- File vault integration
  file_path VARCHAR(500),
  tags TEXT[],
  metadata JSONB,
  
  -- Graph positioning
  position_x FLOAT,
  position_y FLOAT,
  
  -- Tracking
  last_accessed_at TIMESTAMP DEFAULT NOW(),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nodes_user_id ON nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_nodes_goal_id ON nodes(goal_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_last_accessed ON nodes(last_accessed_at DESC);

-- ============================================================================
-- LINKS TABLE (Constellation Links)
-- ============================================================================

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

-- ============================================================================
-- GAME PLAN NODES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS game_plan_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  label VARCHAR(500) NOT NULL,
  description TEXT,
  seniority_level INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  familiarity_score INTEGER DEFAULT 0,
  estimated_hours FLOAT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_plan_nodes_user_id ON game_plan_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_game_plan_nodes_goal_id ON game_plan_nodes(goal_id);
CREATE INDEX IF NOT EXISTS idx_game_plan_nodes_status ON game_plan_nodes(status);

-- ============================================================================
-- GAME PLAN LINKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS game_plan_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES game_plan_nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES game_plan_nodes(id) ON DELETE CASCADE,
  relation_type VARCHAR(50) DEFAULT 'prerequisite',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_plan_links_source ON game_plan_links(source_id);
CREATE INDEX IF NOT EXISTS idx_game_plan_links_target ON game_plan_links(target_id);

-- ============================================================================
-- NODE INTERACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS node_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL, -- 'VIEWED', 'DISCUSSED', 'APPLIED'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_node_interactions_user_id ON node_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_node_interactions_node_id ON node_interactions(node_id);
CREATE INDEX IF NOT EXISTS idx_node_interactions_created_at ON node_interactions(created_at DESC);

-- ============================================================================
-- TASKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  game_plan_node_id UUID REFERENCES game_plan_nodes(id) ON DELETE SET NULL,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  completion_definition TEXT,
  duration_minutes INTEGER,
  scheduled_for DATE,
  scheduled_time VARCHAR(10),
  status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'COMPLETED', 'ATTEMPTED', 'CANCELLED'
  completed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_node_id ON tasks(node_id);
CREATE INDEX IF NOT EXISTS idx_tasks_game_plan_node_id ON tasks(game_plan_node_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_for ON tasks(scheduled_for);

-- ============================================================================
-- CHAT SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_goal_id ON chat_sessions(goal_id);

-- ============================================================================
-- CHAT MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'user', 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- ============================================================================
-- VECTORS TABLE (RAG/Embeddings)
-- ============================================================================

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

-- ============================================================================
-- VECTOR SEARCH RPC FUNCTION
-- ============================================================================

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

-- ============================================================================
-- SUPERVISOR LINKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS supervisor_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_role VARCHAR(20) NOT NULL, -- 'PARENT', 'COUNSELOR'
  consent_level VARCHAR(30) DEFAULT 'METRICS_ONLY', -- 'METRICS_ONLY', 'GOALS_VISIBLE', 'FULL_PLAN_ACCESS', 'BEHAVIORAL_PATTERNS'
  status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'ACTIVE', 'DENIED', 'CANCELLED'
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, supervisor_id)
);

CREATE INDEX IF NOT EXISTS idx_supervisor_links_student_id ON supervisor_links(student_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_links_supervisor_id ON supervisor_links(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_links_status ON supervisor_links(status);

-- ============================================================================
-- SUPERVISOR INVITE TOKENS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS supervisor_invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  supervisor_role VARCHAR(20) NOT NULL, -- 'PARENT', 'COUNSELOR'
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_invite_tokens_token ON supervisor_invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_supervisor_invite_tokens_student_id ON supervisor_invite_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_invite_tokens_expires_at ON supervisor_invite_tokens(expires_at);

-- ============================================================================
-- RELAY MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS relay_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_role VARCHAR(20) NOT NULL,
  original_content TEXT NOT NULL,
  translated_content TEXT,
  status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'DELIVERED', 'READ'
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_messages_from ON relay_messages(from_user_id);
CREATE INDEX IF NOT EXISTS idx_relay_messages_to ON relay_messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_relay_messages_status ON relay_messages(status);

-- ============================================================================
-- REFERENCE HOURS TABLE
-- ============================================================================

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

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL DEFAULT 'FREE',
  status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'CANCELLED', 'EXPIRED'
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- ============================================================================
-- CRISIS ALERTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS crisis_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counselor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crisis_alerts_student_id ON crisis_alerts(student_id);
CREATE INDEX IF NOT EXISTS idx_crisis_alerts_counselor ON crisis_alerts(counselor_id, resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crisis_alerts_resolved ON crisis_alerts(resolved);

-- ============================================================================
-- INSIGHTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type VARCHAR(20) NOT NULL, -- 'WEEKLY', 'MONTHLY'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Metrics
  tasks_completed INTEGER DEFAULT 0,
  tasks_attempted INTEGER DEFAULT 0,
  total_minutes INTEGER DEFAULT 0,
  completion_rate FLOAT DEFAULT 0,
  
  -- Insights text
  summary TEXT,
  achievements TEXT[],
  concerns TEXT[],
  recommendations TEXT[],
  
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_insights_user_id ON insights(user_id);
CREATE INDEX IF NOT EXISTS idx_insights_period ON insights(period_type, period_start DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Enable on all tables
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_plan_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_plan_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_invite_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crisis_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - USERS TABLE
-- ============================================================================

CREATE POLICY "Users can view their own record"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own record"
  ON users FOR UPDATE
  USING (auth.uid() = id);

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

-- ============================================================================
-- RLS POLICIES - GOALS TABLE
-- ============================================================================

CREATE POLICY "Users can view their own goals"
  ON goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own goals"
  ON goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals"
  ON goals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own goals"
  ON goals FOR DELETE
  USING (auth.uid() = user_id);

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

-- ============================================================================
-- RLS POLICIES - NODES TABLE
-- ============================================================================

CREATE POLICY "Users can view their own nodes"
  ON nodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own nodes"
  ON nodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own nodes"
  ON nodes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own nodes"
  ON nodes FOR DELETE
  USING (auth.uid() = user_id);

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

-- ============================================================================
-- RLS POLICIES - LINKS TABLE
-- ============================================================================

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

CREATE POLICY "Users can delete their own links"
  ON links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM nodes
      WHERE nodes.id = links.source_id
      AND nodes.user_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS POLICIES - GAME PLAN NODES TABLE
-- ============================================================================

CREATE POLICY "Users can view their own game plan nodes"
  ON game_plan_nodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own game plan nodes"
  ON game_plan_nodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own game plan nodes"
  ON game_plan_nodes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own game plan nodes"
  ON game_plan_nodes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - GAME PLAN LINKS TABLE
-- ============================================================================

CREATE POLICY "Users can view their own game plan links"
  ON game_plan_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM game_plan_nodes
      WHERE game_plan_nodes.id = game_plan_links.source_id
      AND game_plan_nodes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own game plan links"
  ON game_plan_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM game_plan_nodes
      WHERE game_plan_nodes.id = game_plan_links.source_id
      AND game_plan_nodes.user_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS POLICIES - NODE INTERACTIONS TABLE
-- ============================================================================

CREATE POLICY "Users can view their own node interactions"
  ON node_interactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own node interactions"
  ON node_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - TASKS TABLE
-- ============================================================================

CREATE POLICY "Users can view their own tasks"
  ON tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
  ON tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks"
  ON tasks FOR DELETE
  USING (auth.uid() = user_id);

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

-- ============================================================================
-- RLS POLICIES - CHAT SESSIONS TABLE
-- ============================================================================

CREATE POLICY "Users can view their own chat sessions"
  ON chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - CHAT MESSAGES TABLE
-- ============================================================================

CREATE POLICY "Users can view their own chat messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - VECTORS TABLE
-- ============================================================================

CREATE POLICY "Users can view their own vectors"
  ON vectors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vectors"
  ON vectors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - SUPERVISOR LINKS TABLE
-- ============================================================================

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

-- ============================================================================
-- RLS POLICIES - SUPERVISOR INVITE TOKENS TABLE
-- ============================================================================

CREATE POLICY "Students can view their own invite tokens"
  ON supervisor_invite_tokens FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can create their own invite tokens"
  ON supervisor_invite_tokens FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can update their own invite tokens"
  ON supervisor_invite_tokens FOR UPDATE
  USING (auth.uid() = student_id);

-- ============================================================================
-- RLS POLICIES - RELAY MESSAGES TABLE
-- ============================================================================

CREATE POLICY "Sender can view their messages"
  ON relay_messages FOR SELECT
  USING (auth.uid() = from_user_id);

CREATE POLICY "Recipient can view their messages"
  ON relay_messages FOR SELECT
  USING (auth.uid() = to_user_id);

CREATE POLICY "Users can send messages"
  ON relay_messages FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- ============================================================================
-- RLS POLICIES - SUBSCRIPTIONS TABLE
-- ============================================================================

CREATE POLICY "Users can view their own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - CRISIS ALERTS TABLE
-- ============================================================================

CREATE POLICY "Students can view their own crisis alerts"
  ON crisis_alerts FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Counselors can view assigned crisis alerts"
  ON crisis_alerts FOR SELECT
  USING (auth.uid() = counselor_id);

CREATE POLICY "System can create crisis alerts"
  ON crisis_alerts FOR INSERT
  WITH CHECK (true); -- Handled by server-side logic with service role

CREATE POLICY "Counselors can update assigned crisis alerts"
  ON crisis_alerts FOR UPDATE
  USING (auth.uid() = counselor_id);

-- ============================================================================
-- RLS POLICIES - INSIGHTS TABLE
-- ============================================================================

CREATE POLICY "Users can view their own insights"
  ON insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can create insights"
  ON insights FOR INSERT
  WITH CHECK (true); -- Handled by server-side logic

-- ============================================================================
-- STORAGE BUCKET (for counselor file uploads)
-- ============================================================================
-- Note: This must be created in Supabase Dashboard or via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('authority-files', 'authority-files', false);
-- Then set appropriate RLS policies on storage.objects

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- All tables, indexes, functions, and RLS policies have been created.
-- You can now use the MyNorth application with a fresh database.
-- ============================================================================
