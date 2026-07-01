-- ---------------------------------------------------------------------------
-- Migration 0004: Database Optimization (OPT-1 through OPT-11)
-- ---------------------------------------------------------------------------
-- This migration applies all schema changes for the database optimization
-- effort. It is safe to run multiple times due to IF NOT EXISTS guards.
-- ---------------------------------------------------------------------------

-- ═══════════════════════════════════════════════════════════════════════════
-- TOURS TABLE — New columns
-- ═══════════════════════════════════════════════════════════════════════════

-- [OPT-6] Version chain — tracks which tour replaced this one
ALTER TABLE tours ADD COLUMN replaced_by TEXT;

-- [OPT-6] Generation source tracking: 'sdk' | 'crawler' | 'partial_regen'
ALTER TABLE tours ADD COLUMN generation_source TEXT;

-- [OPT-10] Pre-computed step count — eliminates JSON.parse(steps_json).length
ALTER TABLE tours ADD COLUMN total_steps INTEGER;

-- Backfill total_steps for existing tours (SQLite json_array_length)
UPDATE tours SET total_steps = json_array_length(steps_json) WHERE total_steps IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- TOURS TABLE — Index changes
-- ═══════════════════════════════════════════════════════════════════════════

-- [OPT-8] Remove dead index — never queried without projectId
DROP INDEX IF EXISTS context_hash_idx;

-- [OPT-8] Covering index for fetchActiveTour query pattern
CREATE INDEX IF NOT EXISTS active_tour_lookup_idx ON tours(project_id, context_key, is_active);


-- ═══════════════════════════════════════════════════════════════════════════
-- USER_PROGRESS TABLE — New columns
-- ═══════════════════════════════════════════════════════════════════════════

-- [OPT-2] Full datetime on every status change
ALTER TABLE user_progress ADD COLUMN last_interaction_at INTEGER;

-- [OPT-7] Server-side resume point — survives browser data wipe
ALTER TABLE user_progress ADD COLUMN last_completed_step INTEGER DEFAULT 0;

-- [OPT-5] Status lifecycle audit trail (JSON array)
ALTER TABLE user_progress ADD COLUMN status_history TEXT;

-- [OPT-8] Status-based lookup index
CREATE INDEX IF NOT EXISTS user_status_idx ON user_progress(user_id, status);


-- ═══════════════════════════════════════════════════════════════════════════
-- USER_PROGRESS — Deduplicate existing rows (keep most recent per user+tour)
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Delete all duplicate rows, keeping only the one with the latest
-- updated_at (or created_at if updated_at is null) for each (user_id, tour_id) pair.
DELETE FROM user_progress
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, tour_id
        ORDER BY COALESCE(updated_at, created_at) DESC
      ) AS rn
    FROM user_progress
  ) ranked
  WHERE rn = 1
);


-- ═══════════════════════════════════════════════════════════════════════════
-- NEW TABLE: daily_generation_counts
-- [OPT-11] Tracks and enforces Gemini API usage per project per day
-- ═══════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS daily_generation_counts;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS daily_generation_counts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_count_idx ON daily_generation_counts(project_id, date_key);


-- ═══════════════════════════════════════════════════════════════════════════
-- Backfill: Set last_interaction_at from updated_at or created_at
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE user_progress
SET last_interaction_at = COALESCE(updated_at, created_at)
WHERE last_interaction_at IS NULL;
