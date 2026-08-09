ALTER TABLE `business_profile` ADD `auto_confirm_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `business_profile` ADD `auto_confirm_threshold_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `invoice_date` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `due_date` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `gst_rate` integer DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `customer_gstin` text;