-- ============================================================================
-- ADD MISSING COLUMNS TO EXISTING DATABASE
-- ============================================================================
-- Run this if you want to add missing columns without dropping the database
-- This is safer than drop.sql + complete migration if you have existing data
-- ============================================================================

-- Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS pace_gap FLOAT DEFAULT 1.0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gates_cleared_log JSONB DEFAULT '[]'::jsonb;

-- Fix gate_pace default value (it was set to 1.0, should be 0)
-- Update existing rows where gate_pace is null
UPDATE users SET gate_pace = 0 WHERE gate_pace IS NULL;

-- Add missing columns to nodes table
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS file_path VARCHAR(500);
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add comments for clarity
COMMENT ON COLUMN users.gates_cleared_log IS 'Array of {date, node_id} objects tracking game plan gates cleared';
COMMENT ON COLUMN users.pace_gap IS 'Gap between expected and actual pace';
COMMENT ON COLUMN users.gate_pace IS 'Current pace through gates (0 = not started)';
COMMENT ON COLUMN nodes.file_path IS 'Path to associated markdown file in vault (e.g., /vault/north_star/Goal_Name.md)';
COMMENT ON COLUMN nodes.tags IS 'Array of tags for categorization (e.g., [''north_star'', ''UTBK''])';
COMMENT ON COLUMN nodes.metadata IS 'Additional metadata stored as JSON';

-- Verify the columns were added
SELECT 
  'users table' as table_name,
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'users'
  AND column_name IN ('pace_gap', 'gates_cleared_log', 'gate_pace')
UNION ALL
SELECT 
  'nodes table' as table_name,
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'nodes'
  AND column_name IN ('file_path', 'tags', 'metadata')
ORDER BY table_name, column_name;

