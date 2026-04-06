-- Crisis Alert table for counselor notification during student crises
CREATE TABLE IF NOT EXISTS crisis_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counselor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  session_id  uuid REFERENCES chat_sessions(id) ON DELETE SET NULL,
  resolved    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for counselor dashboard query
CREATE INDEX IF NOT EXISTS idx_crisis_alerts_counselor
  ON crisis_alerts (counselor_id, resolved, created_at DESC);