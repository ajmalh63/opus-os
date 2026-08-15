ALTER TABLE `attestation_applications` ADD `document_key` text;--> statement-breakpoint
ALTER TABLE `attestation_applications` ADD `document_status` text DEFAULT 'missing' NOT NULL;--> statement-breakpoint
ALTER TABLE `attestation_applications` ADD `payment_status` text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE `attestation_applications` ADD `paid_amount_paise` integer DEFAULT 0 NOT NULL;