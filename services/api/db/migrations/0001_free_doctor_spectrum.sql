DROP INDEX IF EXISTS `user_tour_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `origin_uniq_idx` ON `projects` (`allowed_origins`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `active_context_idx` ON `tours` (`project_id`,`context_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payload_hash_idx` ON `tours` (`project_id`,`context_key`,`payload_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_tour_unique_idx` ON `user_progress` (`user_id`,`tour_id`);