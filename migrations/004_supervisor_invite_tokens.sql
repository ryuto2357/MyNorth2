-- Migration: 004_supervisor_invite_tokens.sql
-- Token-based invite flow: student generates token, supervisor accepts via link

CREATE TABLE IF NOT EXISTS supervisor_invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_role TEXT NOT NULL CHECK (supervisor_role IN ('PARENT', 'COUNSELOR')),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64url'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: students can read/create their own tokens; service role can do anything
ALTER TABLE supervisor_invite_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_owns_token" ON supervisor_invite_tokens
  FOR ALL USING (student_id = auth.uid());
