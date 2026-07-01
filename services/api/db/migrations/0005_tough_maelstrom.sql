CREATE TABLE `request_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`user_id` text,
	`endpoint` text NOT NULL,
	`context_key` text,
	`method` text,
	`status_code` integer,
	`latency_ms` integer,
	`sdk_version` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tour_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text,
	`context_key` text NOT NULL,
	`gen_type` text NOT NULL,
	`provider` text,
	`model` text,
	`input_tokens` integer DEFAULT 0,
	`output_tokens` integer DEFAULT 0,
	`total_tokens` integer DEFAULT 0,
	`provider_cost_micro_usd` integer DEFAULT 0,
	`billable_amount` integer DEFAULT 0,
	`latency_ms` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `req_project_time_idx` ON `request_logs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `req_project_context_idx` ON `request_logs` (`project_id`,`context_key`);--> statement-breakpoint
CREATE INDEX `gen_project_time_idx` ON `tour_generations` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `gen_project_context_idx` ON `tour_generations` (`project_id`,`context_key`);