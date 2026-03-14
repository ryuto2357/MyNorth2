-- ============================================
-- CLEANUP SCRIPT - Drop all MyNorth tables
-- ============================================
-- Run this in Supabase SQL Editor when you want to clean slate reset

-- Drop trigger and function first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Drop all tables (CASCADE handles foreign key dependencies)
DROP TABLE IF EXISTS vectors CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS links CASCADE;
DROP TABLE IF EXISTS nodes CASCADE;
DROP TABLE IF EXISTS goals CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Done! All tables and policies are now removed.
-- You can now run supabase_migrations.sql to recreate everything fresh.
