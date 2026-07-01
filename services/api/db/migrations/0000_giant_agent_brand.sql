CREATE TABLE `analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`tour_id` text,
	`user_id` text,
	`step_index` integer NOT NULL,
	`event_type` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_key` text NOT NULL,
	`allowed_origins` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tours` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`context_key` text NOT NULL,
	`version_hash` text NOT NULL,
	`steps_json` text NOT NULL,
	`element_fingerprints` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`tour_id` text NOT NULL,
	`status` text NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_time_idx` ON `analytics` (`project_id`,`timestamp`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_api_key_unique` ON `projects` (`api_key`);--> statement-breakpoint
CREATE INDEX `api_key_idx` ON `projects` (`api_key`);--> statement-breakpoint
CREATE INDEX `context_hash_idx` ON `tours` (`context_key`,`version_hash`);--> statement-breakpoint
CREATE INDEX `user_tour_idx` ON `user_progress` (`user_id`,`tour_id`);--> statement-breakpoint
CREATE INDEX `project_user_idx` ON `user_progress` (`project_id`,`user_id`);