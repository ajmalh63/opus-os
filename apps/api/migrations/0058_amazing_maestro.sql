ALTER TABLE `attestation_rate_cards` ADD `title` text;--> statement-breakpoint
ALTER TABLE `attestation_rate_cards` ADD `description` text;--> statement-breakpoint
ALTER TABLE `attestation_rate_cards` ADD `document_types_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `attestation_rate_cards` ADD `govt_fee_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attestation_rate_cards` ADD `courier_fee_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attestation_rate_cards` ADD `translation_fee_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attestation_rate_cards` ADD `featured` integer DEFAULT false NOT NULL;