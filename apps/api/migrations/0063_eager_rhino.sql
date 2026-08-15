ALTER TABLE `attestation_applications` ADD `deadline` integer;--> statement-breakpoint
ALTER TABLE `attestation_applications` ADD `urgency` text DEFAULT 'normal' NOT NULL;