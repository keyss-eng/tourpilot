-- ============================================================
-- Migration 0003: Schema Hardening (Code Review DB-1, DB-2, DB-3, DB-5)
-- ============================================================


-- [DB-1] Partial unique index: at most one active tour per (project, page).
-- Drizzle ORM does not generate partial indexes — applied manually here.
-- This prevents a race where two active tours for the same context_key exist
-- when is_active deactivation and the new insert happen non-atomically.
CREATE UNIQUE INDEX IF NOT EXISTS `active_tour_uniq_idx`
  ON `tours` (`project_id`, `context_key`)
  WHERE `is_active` = 1;
--> statement-breakpoint

-- [DB-5] Per-tour and per-user analytics indexes (Drizzle generated these in
-- the schema but they were missing from earlier migrations).
CREATE INDEX IF NOT EXISTS `project_tour_idx`
  ON `analytics` (`project_id`, `tour_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_user_analytics_idx`
  ON `analytics` (`project_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_event_idx`
  ON `analytics` (`project_id`, `event_type`);
--> statement-breakpoint

-- [DB-3 / Audit] Audit log table — records all significant backend actions
-- (tour generation, progress updates, errors) for debugging and compliance.
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`          text    PRIMARY KEY NOT NULL,
  `project_id`  text    NOT NULL,
  `action`      text    NOT NULL,   -- 'generate' | 'view' | 'complete' | 'error'
  `entity_type` text    NOT NULL,   -- 'tour' | 'user_progress' | 'analytics'
  `entity_id`   text,               -- nullable — not all actions have a target entity
  `metadata`    text,               -- JSON blob for arbitrary context
  `created_at`  integer NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_project_time_idx`
  ON `audit_log` (`project_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_action_idx`
  ON `audit_log` (`project_id`, `action`);
--> statement-breakpoint

-- [DB-3 / Audit] Generation error table — captures Gemini / DB write failures
-- so you can diagnose recurring failures without trawling Worker logs.
CREATE TABLE IF NOT EXISTS `generation_errors` (
  `id`            text    PRIMARY KEY NOT NULL,
  `project_id`    text    NOT NULL,
  `context_key`   text    NOT NULL,
  `error_message` text    NOT NULL,
  `payload_hash`  text,              -- nullable — may not exist if hashing itself failed
  `created_at`    integer NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `gen_error_project_idx`
  ON `generation_errors` (`project_id`, `created_at`);
--> statement-breakpoint

-- [Monitoring] Convenience view: daily generation counts per project.
-- Used by a future analytics dashboard; does not affect storage.
CREATE VIEW IF NOT EXISTS `daily_generation_counts` AS
  SELECT
    `project_id`,
    DATE(`created_at` / 1000, 'unixepoch') AS `day`,
    COUNT(*)                               AS `generations`
  FROM `tours`
  GROUP BY `project_id`, `day`;
