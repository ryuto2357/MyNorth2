-- ============================================
-- CLEANUP SCRIPT - Drop all MyNorth tables
-- ============================================
-- Run this in Supabase SQL Editor when you want to clean slate reset

-- Drop trigger and function first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS match_vectors(vector(768), float, int, uuid);

-- Drop all tables (CASCADE handles foreign key dependencies)
DROP TABLE IF EXISTS insights CASCADE;
DROP TABLE IF EXISTS node_interactions CASCADE;
DROP TABLE IF EXISTS game_plan_links CASCADE;
DROP TABLE IF EXISTS game_plan_nodes CASCADE;
DROP TABLE IF EXISTS supervisor_invite_tokens CASCADE;
DROP TABLE IF EXISTS crisis_alerts CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS reference_hours CASCADE;
DROP TABLE IF EXISTS relay_messages CASCADE;
DROP TABLE IF EXISTS supervisor_links CASCADE;
DROP TABLE IF EXISTS vectors CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS links CASCADE;
DROP TABLE IF EXISTS nodes CASCADE;
DROP TABLE IF EXISTS goals CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop extensions (optional - only if you want to completely reset)
-- DROP EXTENSION IF EXISTS vector CASCADE;
-- DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;

-- Done! All tables, policies, and functions are now removed.
-- You can now run supabase_migrations.sql to recreate everything fresh.
