ALTER TABLE `visa_applications` ADD `email` text;--> statement-breakpoint
ALTER TABLE `visa_applications` ADD `agency_name` text;--> statement-breakpoint
ALTER TABLE `visa_applications` ADD `registered_mobile` text;--> statement-breakpoint
ALTER TABLE `visa_applications` ADD `agreed_to_terms` integer DEFAULT false NOT NULL;