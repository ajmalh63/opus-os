CREATE TABLE `payout_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`note` text,
	`requested_at` integer NOT NULL,
	`resolved_at` integer,
	`updated_by` text,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action
);
