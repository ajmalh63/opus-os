ALTER TABLE `payments` ADD `razorpay_link_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `razorpay_short_url` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `link_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `razorpay_payment_id` text;