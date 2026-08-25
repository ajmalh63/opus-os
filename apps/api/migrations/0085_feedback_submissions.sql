CREATE TABLE IF NOT EXISTS `feedback_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text REFERENCES `clients`(`id`),
	`client_name` text NOT NULL,
	`division` text DEFAULT 'general' NOT NULL,
	`rating` integer NOT NULL,
	`title` text,
	`comment` text NOT NULL,
	`feedback_type` text DEFAULT 'review' NOT NULL,
	`is_public_approved` integer DEFAULT 0 NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`counselor_name` text,
	`metadata_json` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_rating_idx` ON `feedback_submissions` (`rating`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_division_idx` ON `feedback_submissions` (`division`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_public_idx` ON `feedback_submissions` (`is_public_approved`);
