CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`agreement_id` text NOT NULL,
	`number` integer NOT NULL,
	`label` text NOT NULL,
	`amount` integer NOT NULL,
	`due_date` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`overdue_level` text DEFAULT 'none' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agreement_id`) REFERENCES `agreements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `payments` ADD `taxable_amount` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `cgst` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `sgst` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `igst` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `is_interstate` integer;