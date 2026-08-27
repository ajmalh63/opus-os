ALTER TABLE `feedback_submissions` ADD COLUMN `source` text DEFAULT 'native' NOT NULL;
--> statement-breakpoint
ALTER TABLE `feedback_submissions` ADD COLUMN `external_id` text;
--> statement-breakpoint
ALTER TABLE `feedback_submissions` ADD COLUMN `author_avatar_url` text;
--> statement-breakpoint
ALTER TABLE `feedback_submissions` ADD COLUMN `author_location` text;
--> statement-breakpoint
ALTER TABLE `feedback_submissions` ADD COLUMN `source_url` text;
--> statement-breakpoint
ALTER TABLE `feedback_submissions` ADD COLUMN `is_featured` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `feedback_submissions` ADD COLUMN `verified_buyer` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_source_idx` ON `feedback_submissions` (`source`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_external_id_idx` ON `feedback_submissions` (`external_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_featured_idx` ON `feedback_submissions` (`is_featured`);
