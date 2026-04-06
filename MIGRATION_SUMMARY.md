# Database Migration Summary

**Generated:** 2026-04-06  
**Status:** Complete schema with all missing tables

## What Was Fixed

### Missing Tables Added
1. **`game_plan_nodes`** - For storing game plan nodes (used in task generation)
2. **`game_plan_links`** - For storing relationships between game plan nodes
3. **`node_interactions`** - For tracking user interactions with constellation nodes
4. **`supervisor_invite_tokens`** - For managing supervisor invitation tokens
5. **`insights`** - For storing weekly/monthly insights and analytics

### Missing Fields Added to Existing Tables

#### `users` table
- `role` VARCHAR(20) - User role (STUDENT/COUNSELOR/PARENT)
- `disc_profile` JSONB - DISC personality profile
- `patterns` JSONB - User behavior patterns
- `daily_minutes_log` JSONB - Daily activity log
- `user_corpus` JSONB - Cached user corpus
- `user_corpus_updated_at` TIMESTAMP - Corpus cache timestamp
- `demonstrated_capacity_minutes` INTEGER - User's demonstrated work capacity
- `stretch_factor` FLOAT - Workload stretch multiplier
- `i_gap` FLOAT - Inefficiency gap metric
- `gate_pace` FLOAT - Progress rate metric (default: 0, not 1.0)
- `pace_gap` FLOAT - Gap between expected and actual pace
- `gates_cleared_log` JSONB - Array of {date, node_id} objects tracking gates cleared
- `primary_blocker` VARCHAR(255) - Main obstacle description

#### `goals` table
- `category` VARCHAR(255) - Goal category
- `category_text` VARCHAR(255) - Category description
- `motivation_type` VARCHAR(50) - Type of motivation
- `deadline_horizon` VARCHAR(50) - Deadline timeframe
- `hours_initial` FLOAT - Initial hour estimate
- `hours_completed` FLOAT - Hours completed so far
- `hours_override` FLOAT - Manual override for hours
- `estimation_method` VARCHAR(50) - How hours were estimated
- `demonstrated_capacity_minutes` INTEGER - Capacity for this goal

#### `nodes` table
- `last_accessed_at` TIMESTAMP - When node was last accessed/viewed

#### `tasks` table
- `game_plan_node_id` UUID - Link to game plan node
- `completion_definition` TEXT - What completion looks like
- `completed_at` TIMESTAMP - When task was completed

## How to Use

### Option 1: Fresh Database (Recommended for clean slate)

1. **Drop all existing tables:**
   ```bash
   # In Supabase SQL Editor, run:
   cat drop.sql
   ```

2. **Create fresh schema:**
   ```bash
   # In Supabase SQL Editor, run:
   cat supabase_migrations.sql
   ```

### Option 2: Add Missing Columns Only (Preserve existing data)

**⚠️ Recommended if you already have data in your database**

1. **Run the quick fix:**
   ```bash
   # In Supabase SQL Editor, run:
   cat add_missing_columns.sql
   ```

This will add `pace_gap` and `gates_cleared_log` columns to the `users` table without losing data.

### Option 3: Full Migration (Add all missing tables and columns)

If you have existing data you want to keep:

1. Backup your database first!
2. Run only the CREATE TABLE statements for missing tables from `supabase_migrations.sql`
3. Run ALTER TABLE statements to add missing columns

## Files Updated

- ✅ **`drop.sql`** - Updated to drop all tables including new ones
- ✅ **`supabase_migrations.sql`** - Complete schema with all tables (includes gates_cleared_log fix)
- ✅ **`supabase_migrations_complete.sql`** - Same as above (backup copy)
- ✅ **`add_missing_columns.sql`** - Quick fix to add only missing columns (RECOMMENDED FOR EXISTING DATABASES)
- ✅ **`verify_migration.sql`** - Verification script to check migration success

## Storage Bucket

The application expects a storage bucket called `authority-files` for counselor file uploads.

**Create it in Supabase Dashboard:**
1. Go to Storage → Create bucket
2. Name: `authority-files`
3. Public: `false` (private)
4. Set RLS policies as needed

## Verification Checklist

After running the migration, verify:

- [ ] All 19 tables exist
- [ ] Trigger `on_auth_user_created` exists
- [ ] Function `match_vectors` exists
- [ ] Function `handle_new_user` exists
- [ ] RLS is enabled on all tables
- [ ] Storage bucket `authority-files` exists
- [ ] Reference hours data is seeded

## Tables Created (19 total)

1. `users` - User profiles and settings
2. `goals` - User goals with hours tracking
3. `nodes` - Constellation knowledge nodes
4. `links` - Constellation node relationships
5. `game_plan_nodes` - Game plan nodes for tasks
6. `game_plan_links` - Game plan node dependencies
7. `node_interactions` - Tracking node access/usage
8. `tasks` - Student tasks with scheduling
9. `chat_sessions` - Chat conversation sessions
10. `chat_messages` - Individual chat messages
11. `vectors` - RAG embeddings for context
12. `supervisor_links` - Parent/counselor connections
13. `supervisor_invite_tokens` - Invitation tokens
14. `relay_messages` - Messages between users
15. `reference_hours` - Goal hour estimates
16. `subscriptions` - Payment/subscription data
17. `crisis_alerts` - Mental health alerts
18. `insights` - Weekly/monthly analytics

## Notes

- All tables have RLS (Row Level Security) enabled
- Service role is needed for some operations (crisis alerts, insights)
- The schema supports multi-role (STUDENT, COUNSELOR, PARENT)
- Supervisor access is consent-based with 4 levels
- Vector search uses pgvector extension with HNSW indexing

## Breaking Changes

None - this is a complete fresh schema. If migrating from old schema, existing data in matching tables will be preserved if using Option 2.
