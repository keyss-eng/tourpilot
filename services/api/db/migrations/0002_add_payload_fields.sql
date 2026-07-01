ALTER TABLE `tours` ADD COLUMN `payload_json` text;
ALTER TABLE `tours` ADD COLUMN `payload_hash` text;
CREATE INDEX IF NOT EXISTS `payload_hash_idx` ON `tours` (`project_id`, `context_key`, `payload_hash`);