# MyNorth Database Setup Guide

## Quick Reference Files

### 🧹 `drop.sql` — Clean slate reset
Use this when you want to delete ALL data and start fresh.

**In Supabase SQL Editor:**
1. Create new query
2. Copy + paste entire contents of `drop.sql`
3. Click **Run**

### 🏗️ `supabase_migrations.sql` — Build fresh database
Use this AFTER running drop.sql to recreate all tables with proper schema and RLS policies.

**In Supabase SQL Editor:**
1. Create new query
2. Copy + paste entire contents of `supabase_migrations.sql`
3. Click **Run**

---

## Full Reset Workflow

When you need a clean start:

```
1. Run drop.sql (deletes everything)
   ↓
2. Run supabase_migrations.sql (creates fresh schema)
   ↓
3. Restart dev server: npm run dev
   ↓
4. Go to http://localhost:3000 and test signup/onboarding
```

---

## What Each File Does

| File | Purpose |
|------|---------|
| `drop.sql` | Removes all tables, triggers, functions, and policies |
| `supabase_migrations.sql` | Creates all tables, sets up RLS, creates trigger for auto user profile |

---

## Environment Setup

Before running migrations, make sure you have `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GEMINI_API_KEY=AIzaSy...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

See `.env.local.example` for template.

---

## Troubleshooting

**"Could not find table in schema cache"**
→ Tables didn't create. Run `drop.sql` then `supabase_migrations.sql` again.

**"Row level security policy violation"**
→ RLS policies might be wrong. Drop and remigrate.

**"Foreign key constraint violated"**
→ Try running drop.sql to clean up, then remigrate fresh.
