ALTER TABLE `visa_products` ADD `category` text DEFAULT 'Tourist' NOT NULL;--> statement-breakpoint
ALTER TABLE `visa_products` ADD `tier` text DEFAULT 'Standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `visa_products` ADD `validity_days` integer;--> statement-breakpoint
ALTER TABLE `visa_products` ADD `max_stay_days` integer;--> statement-breakpoint
ALTER TABLE `visa_products` ADD `insurance_included` integer DEFAULT false NOT NULL;