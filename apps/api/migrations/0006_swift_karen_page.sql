CREATE TABLE `commission_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`referral_id` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'unmatured' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`referral_id`) REFERENCES `referrals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `partners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pan_number` text NOT NULL,
	`bank_account` text NOT NULL,
	`ifsc_code` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`client_id` text NOT NULL,
	`commission_rate` integer DEFAULT 5 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
