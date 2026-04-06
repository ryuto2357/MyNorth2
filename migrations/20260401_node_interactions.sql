-- Node Interactions Memory — cross-session record of Morgan referencing constellation nodes
-- Created: 2026-04-01

CREATE TABLE IF NOT EXISTS node_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('VIEWED', 'DISCUSSED', 'APPLIED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_node_interactions_user_id ON node_interactions(user_id);
CREATE INDEX idx_node_interactions_node_id ON node_interactions(node_id);