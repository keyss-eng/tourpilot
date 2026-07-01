-- [AUTH] accounts — dashboard login users (one account owns one project).
CREATE TABLE IF NOT EXISTS `accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `password_hash` text NOT NULL,
  `project_id` text NOT NULL,
  `role` text DEFAULT 'client' NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `account_email_idx` ON `accounts` (`email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_project_idx` ON `accounts` (`project_id`);
