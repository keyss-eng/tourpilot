-- [ADMIN] Block/suspend a client. Blocked projects are rejected by the API.
ALTER TABLE `projects` ADD COLUMN `blocked` integer NOT NULL DEFAULT 0;
