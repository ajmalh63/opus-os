ALTER TABLE `bookings` ADD `risk_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `risk_flags` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `verified` integer DEFAULT false NOT NULL;