ALTER TABLE `clients` ADD `lead_source` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `intake_context` text;--> statement-breakpoint
ALTER TABLE `partners` ADD `referral_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `partners_referral_code_unique` ON `partners` (`referral_code`);