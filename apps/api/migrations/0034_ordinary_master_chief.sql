DROP TABLE `board_prefs`;--> statement-breakpoint
DROP TABLE `listmonk_suppressions`;--> statement-breakpoint
DROP TABLE `webhook_events`;--> statement-breakpoint
ALTER TABLE `campaign_touches` DROP COLUMN `channel`;--> statement-breakpoint
ALTER TABLE `clients` DROP COLUMN `intent_divisions`;--> statement-breakpoint
ALTER TABLE `clients` DROP COLUMN `primary_division`;--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `razorpay_link_id`;--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `razorpay_short_url`;--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `link_status`;--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `razorpay_payment_id`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `cos`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `blocked_reason`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `in_progress_at`;