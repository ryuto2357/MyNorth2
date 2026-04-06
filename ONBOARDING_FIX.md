# 🔧 Quick Fix for Onboarding Errors

## Problems
Getting these errors when creating an account on `/onboarding`:

**Error 1:**
```
PGRST204: Could not find the 'gates_cleared_log' column of 'users' in the schema cache
```

**Error 2:**
```
PGRST204: Could not find the 'file_path' column of 'nodes' in the schema cache
```

## Root Cause
Missing columns in the database:

**Users table missing:**
- `pace_gap` - Gap between expected and actual pace
- `gates_cleared_log` - Array of {date, node_id} objects tracking game plan gates cleared

**Nodes table missing:**
- `file_path` - Path to markdown file in vault
- `tags` - Array of tags for categorization
- `metadata` - Additional JSON metadata

## ✅ Quick Solution (Recommended)

**If you have existing data and don't want to lose it:**

1. Open **Supabase SQL Editor** (your Supabase dashboard → SQL Editor)

2. Run this file: **`add_missing_columns.sql`**

   Or copy/paste this directly:
   ```sql
   -- Add to users table
   ALTER TABLE users ADD COLUMN IF NOT EXISTS pace_gap FLOAT DEFAULT 1.0;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS gates_cleared_log JSONB DEFAULT '[]'::jsonb;
   
   -- Add to nodes table
   ALTER TABLE nodes ADD COLUMN IF NOT EXISTS file_path VARCHAR(500);
   ALTER TABLE nodes ADD COLUMN IF NOT EXISTS tags TEXT[];
   ALTER TABLE nodes ADD COLUMN IF NOT EXISTS metadata JSONB;
   ```

3. **Done!** Your onboarding should now work.

## 🔄 Alternative: Fresh Database Setup

**If you want to start completely fresh:**

1. Run `drop.sql` in Supabase SQL Editor (⚠️ THIS DELETES ALL DATA)
2. Run `supabase_migrations.sql` in Supabase SQL Editor
3. Done!

## Verification

After applying the fix, verify the columns exist:

```sql
-- Check users table
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'users' 
  AND column_name IN ('pace_gap', 'gates_cleared_log', 'gate_pace');

-- Check nodes table  
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'nodes'
  AND column_name IN ('file_path', 'tags', 'metadata');
```

You should see all 6 columns listed.

## Files Involved

- ✅ `add_missing_columns.sql` - Quick fix (run this!)
- ✅ `supabase_migrations.sql` - Complete schema (updated with all fixes)
- ✅ `supabase_migrations_complete.sql` - Backup of complete schema

## What These Columns Do

### Users table:
- **`gates_cleared_log`**: Tracks which game plan gates (milestones) a student has cleared and when. Format: `[{date: "2024-01-15", node_id: "uuid"}, ...]`
- **`pace_gap`**: Measures the gap between expected pace and actual pace (1.0 = on track)
- **`gate_pace`**: Current pace through gates (0 = not started, higher = faster)

### Nodes table:
- **`file_path`**: Path to associated markdown file in vault system (e.g., `/vault/north_star/My_Goal.md`)
- **`tags`**: Array of tags for categorization and filtering (e.g., `['north_star', 'UTBK', 'priority']`)
- **`metadata`**: Flexible JSON storage for additional node data like familiarity scores, deadlines, origin source, etc.

These are used for:
- Progress tracking in counselor dashboard
- Task generation algorithm
- Student performance analytics
- Knowledge constellation visualization
- File vault integration for note-taking
