-- [BILLING] plans — subscription tiers editable at runtime (no redeploy).
CREATE TABLE IF NOT EXISTS `plans` (
  `name` text PRIMARY KEY NOT NULL,
  `monthly_limit` integer,
  `price` integer DEFAULT 0 NOT NULL,
  `overage_per_mau` integer DEFAULT 0 NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
-- Seed the default tiers (monthly_limit NULL = unlimited).
INSERT OR IGNORE INTO `plans` (`name`, `monthly_limit`, `price`, `overage_per_mau`, `created_at`) VALUES
  ('free',     500,   0,      0,  '2026-06-25T00:00:00.000Z'),
  ('starter',  5000,  199900, 50, '2026-06-25T00:00:00.000Z'),
  ('growth',   25000, 499900, 50, '2026-06-25T00:00:00.000Z'),
  ('pro',      NULL,  999900, 0,  '2026-06-25T00:00:00.000Z');
