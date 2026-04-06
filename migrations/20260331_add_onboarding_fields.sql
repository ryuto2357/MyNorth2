-- Add new onboarding fields to users and goals tables

-- Add primary_blocker to users
ALTER TABLE IF EXISTS users 
ADD COLUMN IF NOT EXISTS primary_blocker VARCHAR(50);

-- Add onboarding fields to goals
ALTER TABLE IF EXISTS goals
ADD COLUMN IF NOT EXISTS category VARCHAR(50),
ADD COLUMN IF NOT EXISTS category_text VARCHAR(255),
ADD COLUMN IF NOT EXISTS motivation_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS deadline_horizon VARCHAR(50);

-- Add missing columns to nodes
ALTER TABLE IF EXISTS nodes
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Create index for faster filtering if needed
CREATE INDEX IF NOT EXISTS idx_users_primary_blocker ON users(primary_blocker);
CREATE INDEX IF NOT EXISTS idx_goals_category ON goals(category);
CREATE INDEX IF NOT EXISTS idx_nodes_metadata ON nodes USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_nodes_tags ON nodes USING gin (tags);
