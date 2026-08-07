CREATE TABLE `business_profile` (
	`id` text PRIMARY KEY DEFAULT 'main' NOT NULL,
	`legal_name` text,
	`gstin` text,
	`pan` text,
	`tan` text,
	`state_code` text,
	`state_name` text,
	`address` text,
	`hsn_json` text DEFAULT '{}' NOT NULL,
	`gst_rate_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `incentive_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`rule_id` text,
	`engagement_id` text,
	`trigger_ref` text,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'accrued' NOT NULL,
	`period` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `incentive_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `incentive_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`division` text NOT NULL,
	`service_id` text,
	`trigger` text NOT NULL,
	`amount` integer NOT NULL,
	`is_percent` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `interaction_points` (
	`code` text PRIMARY KEY NOT NULL,
	`points` integer NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `payout_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`period` text NOT NULL,
	`gross` integer DEFAULT 0 NOT NULL,
	`tds` integer DEFAULT 0 NOT NULL,
	`net` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approved_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`code` text PRIMARY KEY NOT NULL,
	`family` text NOT NULL,
	`label` text NOT NULL,
	`owner_only` integer DEFAULT false NOT NULL,
	`seeded` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_name` text NOT NULL,
	`vendor_gstin` text,
	`invoice_number` text NOT NULL,
	`invoice_date` integer NOT NULL,
	`amount` integer NOT NULL,
	`taxable_amount` integer DEFAULT 0 NOT NULL,
	`cgst` integer DEFAULT 0 NOT NULL,
	`sgst` integer DEFAULT 0 NOT NULL,
	`igst` integer DEFAULT 0 NOT NULL,
	`is_interstate` integer DEFAULT false NOT NULL,
	`itc_claimable` integer DEFAULT 1 NOT NULL,
	`vendor_msme` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`paid_at` integer,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`bucket` text NOT NULL,
	`window_start` integer NOT NULL,
	`identity` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`permissions_json` text DEFAULT '[]' NOT NULL,
	`parent_id` text,
	`system` integer DEFAULT false NOT NULL,
	`editable` integer DEFAULT true NOT NULL,
	`color` text DEFAULT 'brand-gold' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `roles_code_unique` ON `roles` (`code`);--> statement-breakpoint
CREATE TABLE `scoring_events` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`interaction_code` text NOT NULL,
	`points` integer NOT NULL,
	`source` text DEFAULT 'api' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `segments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rules_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`engagement_id` text,
	`assignee_id` text,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`due_date` integer,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tcs_records` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`client_name` text,
	`pan` text,
	`taxable_amount` integer NOT NULL,
	`tcs_amount` integer NOT NULL,
	`fy_amount` integer DEFAULT 0 NOT NULL,
	`section` text DEFAULT '206C(1H)' NOT NULL,
	`period` text,
	`created_at` integer NOT NULL,
	`deposited_at` integer,
	`tan_ref` text,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tds_records` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_name` text NOT NULL,
	`payee_pan` text,
	`section` text NOT NULL,
	`code` text,
	`invoice_number` text,
	`payment_date` integer NOT NULL,
	`gross_amount` integer NOT NULL,
	`tds_amount` integer NOT NULL,
	`challan_ref` text,
	`period` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`division_scope` text DEFAULT '[]' NOT NULL,
	`active_from` integer DEFAULT 0 NOT NULL,
	`active_to` integer,
	`revoked_at` integer,
	`revoked_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `gstin` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `state` text;