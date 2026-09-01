-- feedback_submissions columns created in earlier schema baseline
CREATE INDEX IF NOT EXISTS `feedback_source_idx` ON `feedback_submissions` (`source`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_external_id_idx` ON `feedback_submissions` (`external_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_featured_idx` ON `feedback_submissions` (`is_featured`);
