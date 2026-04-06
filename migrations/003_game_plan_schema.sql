-- ============================================================
-- Migration 003: Game Plan Schema (Outcome-Based Engine)
-- MyNorth App — Supabase
-- ============================================================

BEGIN;

-- game_plan_nodes: the DAG nodes of the Game Plan
CREATE TABLE IF NOT EXISTS game_plan_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES game_plan_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  completion_definition TEXT NOT NULL,  -- "what does done look like?"
  gate_type TEXT NOT NULL CHECK (gate_type IN ('ACHIEVEMENT', 'MILESTONE', 'SKILL', 'TASK')),
  status TEXT NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED', 'UNLOCKED', 'ATTEMPTED', 'COMPLETED')),
  prerequisite_ids UUID[] DEFAULT '{}',
  order_index INTEGER DEFAULT 0,
  confidence TEXT DEFAULT 'HIGH' CHECK (confidence IN ('HIGH', 'LOW')),  -- LOW = speculative/no verified source
  source_url TEXT,  -- verified source Morgan used for this node
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- game_plan_links: edges between nodes
CREATE TABLE IF NOT EXISTS game_plan_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES game_plan_nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES game_plan_nodes(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('PARENT_OF', 'REQUIRES', 'BUILDS_ON')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add gate_pace to users table (replaces demonstrated_capacity_minutes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'gate_pace') THEN
    ALTER TABLE users ADD COLUMN gate_pace NUMERIC DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'pace_gap') THEN
    ALTER TABLE users ADD COLUMN pace_gap NUMERIC DEFAULT 1.0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'gates_cleared_log') THEN
    ALTER TABLE users ADD COLUMN gates_cleared_log JSONB DEFAULT '[]';
  END IF;
END $$;

-- Add completion_definition to tasks table (replaces duration_minutes as success metric)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tasks' AND COLUMN_NAME = 'completion_definition') THEN
    ALTER TABLE tasks ADD COLUMN completion_definition TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tasks' AND COLUMN_NAME = 'game_plan_node_id') THEN
    ALTER TABLE tasks ADD COLUMN game_plan_node_id UUID REFERENCES game_plan_nodes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_game_plan_nodes_goal_id ON game_plan_nodes(goal_id);
CREATE INDEX IF NOT EXISTS idx_game_plan_nodes_user_id ON game_plan_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_game_plan_nodes_status ON game_plan_nodes(status);
CREATE INDEX IF NOT EXISTS idx_game_plan_links_source ON game_plan_links(source_id);
CREATE INDEX IF NOT EXISTS idx_game_plan_links_target ON game_plan_links(target_id);

-- RLS
ALTER TABLE game_plan_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_plan_links ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to make it idempotent)
DROP POLICY IF EXISTS "Users can manage own game plan nodes" ON game_plan_nodes;
CREATE POLICY "Users can manage own game plan nodes"
  ON game_plan_nodes FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own game plan links" ON game_plan_links;
CREATE POLICY "Users can manage own game plan links"
  ON game_plan_links FOR ALL USING (
    EXISTS (SELECT 1 FROM game_plan_nodes WHERE id = source_id AND user_id = auth.uid())
  );

COMMIT;
