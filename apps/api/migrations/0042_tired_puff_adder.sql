ALTER TABLE `partners` ADD `email` text;--> statement-breakpoint
CREATE UNIQUE INDEX `partners_email_unique` ON `partners` (`email`);