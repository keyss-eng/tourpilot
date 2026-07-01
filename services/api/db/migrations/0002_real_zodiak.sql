CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `daily_generation_counts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`date_key` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generation_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`context_key` text NOT NULL,
	`error_message` text NOT NULL,
	`payload_hash` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP INDEX IF EXISTS `context_hash_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `user_tour_unique_idx`;--> statement-breakpoint
/*
 SQLite does not support "Changing existing column type" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html
                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE `tours` ADD `version_hash_with_fp` text;--> statement-breakpoint
ALTER TABLE `tours` ADD `structure_hash` text;--> statement-breakpoint
ALTER TABLE `tours` ADD `zone_hashes_json` text;--> statement-breakpoint
ALTER TABLE `tours` ADD `count_hash` text;--> statement-breakpoint
ALTER TABLE `tours` ADD `semantic_hash` text;--> statement-breakpoint
ALTER TABLE `tours` ADD `replaced_by` text;--> statement-breakpoint
ALTER TABLE `tours` ADD `generation_source` text;--> statement-breakpoint
ALTER TABLE `tours` ADD `total_steps` integer;--> statement-breakpoint
ALTER TABLE `user_progress` ADD `last_interaction_at` text;--> statement-breakpoint
ALTER TABLE `user_progress` ADD `last_completed_step` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `user_progress` ADD `status_history` text;--> statement-breakpoint
ALTER TABLE `user_progress` ADD `updated_at` text;--> statement-breakpoint
CREATE INDEX `audit_project_time_idx` ON `audit_log` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_log` (`project_id`,`action`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_count_idx` ON `daily_generation_counts` (`project_id`,`date_key`);--> statement-breakpoint
CREATE INDEX `gen_error_project_idx` ON `generation_errors` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `project_tour_idx` ON `analytics` (`project_id`,`tour_id`);--> statement-breakpoint
CREATE INDEX `project_user_analytics_idx` ON `analytics` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `project_event_idx` ON `analytics` (`project_id`,`event_type`);--> statement-breakpoint
CREATE INDEX `active_tour_lookup_idx` ON `tours` (`project_id`,`context_key`,`is_active`);--> statement-breakpoint
CREATE INDEX `structure_hash_idx` ON `tours` (`project_id`,`context_key`,`structure_hash`);--> statement-breakpoint
CREATE INDEX `count_hash_idx` ON `tours` (`project_id`,`context_key`,`count_hash`);--> statement-breakpoint
CREATE INDEX `semantic_hash_idx` ON `tours` (`project_id`,`context_key`,`semantic_hash`);--> statement-breakpoint
CREATE INDEX `user_status_idx` ON `user_progress` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_tour_unique_idx` ON `user_progress` (`project_id`,`user_id`,`tour_id`);