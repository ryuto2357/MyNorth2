-- ============================================================================
-- VERIFICATION SCRIPT
-- ============================================================================
-- Run this after migration to verify all tables and functions exist
-- Copy results and check for any missing items
-- ============================================================================

-- Check all tables exist
SELECT 
  table_name,
  CASE 
    WHEN table_name IN (
      'users', 'goals', 'nodes', 'links', 'game_plan_nodes', 'game_plan_links',
      'node_interactions', 'tasks', 'chat_sessions', 'chat_messages', 'vectors',
      'supervisor_links', 'supervisor_invite_tokens', 'relay_messages',
      'reference_hours', 'subscriptions', 'crisis_alerts', 'insights'
    ) THEN '✅ Expected'
    ELSE '⚠️ Extra'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Expected count: 18 tables
SELECT 
  'Total Tables' as check_type,
  COUNT(*) as count,
  CASE WHEN COUNT(*) >= 18 THEN '✅ OK' ELSE '❌ Missing tables' END as status
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Check functions exist
SELECT 
  routine_name,
  CASE 
    WHEN routine_name IN ('handle_new_user', 'match_vectors') THEN '✅ Expected'
    ELSE '⚠️ Extra'
  END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Check trigger exists
SELECT 
  trigger_name,
  event_object_table,
  CASE 
    WHEN trigger_name = 'on_auth_user_created' THEN '✅ Expected'
    ELSE '⚠️ Extra'
  END as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY trigger_name;

-- Check RLS is enabled on all tables
SELECT 
  tablename as table_name,
  CASE 
    WHEN rowsecurity THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check reference data is seeded
SELECT 
  'Reference Hours' as check_type,
  COUNT(*) as count,
  CASE WHEN COUNT(*) >= 8 THEN '✅ Seeded' ELSE '❌ Missing seed data' END as status
FROM reference_hours;

-- Check for any missing critical columns in users table
SELECT 
  column_name,
  data_type,
  '✅ Present' as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN (
    'id', 'email', 'name', 'role', 'tier', 'onboarding_complete',
    'schedule', 'disc_profile', 'patterns', 'daily_minutes_log',
    'user_corpus', 'demonstrated_capacity_minutes', 'stretch_factor',
    'i_gap', 'gate_pace', 'primary_blocker'
  )
ORDER BY column_name;

-- Expected: 16 columns listed above

-- Check for missing critical columns in goals table
SELECT 
  column_name,
  data_type,
  '✅ Present' as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'goals'
  AND column_name IN (
    'id', 'user_id', 'title', 'category', 'category_text',
    'motivation_type', 'deadline_horizon', 'hours_initial',
    'hours_completed', 'hours_override', 'estimation_method',
    'demonstrated_capacity_minutes'
  )
ORDER BY column_name;

-- Check nodes table for last_accessed_at
SELECT 
  column_name,
  data_type,
  '✅ Present' as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'nodes'
  AND column_name = 'last_accessed_at';

-- Check tasks table for game_plan_node_id and completion_definition
SELECT 
  column_name,
  data_type,
  '✅ Present' as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tasks'
  AND column_name IN ('game_plan_node_id', 'completion_definition', 'completed_at')
ORDER BY column_name;

-- Final summary
SELECT 
  '====== VERIFICATION COMPLETE ======' as message,
  NOW() as checked_at;

-- If you see any ❌ or missing items, review the migration file and re-run
