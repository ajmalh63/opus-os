CREATE TABLE `attestation_rate_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`country` text NOT NULL,
	`category` text NOT NULL,
	`route` text NOT NULL,
	`price_paise` integer NOT NULL,
	`timeline_days` integer DEFAULT 10 NOT NULL,
	`steps_json` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attestation_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`document_type` text DEFAULT 'degree' NOT NULL,
	`destination_country` text NOT NULL,
	`current_step` text DEFAULT 'hrd' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`document_json` text DEFAULT '{}' NOT NULL,
	`category` text DEFAULT 'personal' NOT NULL,
	`route` text DEFAULT 'apostille' NOT NULL,
	`chain_json` text DEFAULT '[]' NOT NULL,
	`govt_fee_paise` integer DEFAULT 0 NOT NULL,
	`service_fee_paise` integer DEFAULT 0 NOT NULL,
	`courier_fee_paise` integer DEFAULT 0 NOT NULL,
	`translation_fee_paise` integer DEFAULT 0 NOT NULL,
	`total_quote_paise` integer DEFAULT 0 NOT NULL,
	`translation_needed` integer DEFAULT false NOT NULL,
	`pickup_status` text DEFAULT 'awaiting_docs' NOT NULL,
	`pickup_address` text,
	`courier_inbound` text,
	`courier_outbound` text,
	`courier_return` text,
	`stage` text DEFAULT 'quote' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_attestation_applications`("id", "client_id", "document_type", "destination_country", "current_step", "status", "document_json", "category", "route", "chain_json", "govt_fee_paise", "service_fee_paise", "courier_fee_paise", "translation_fee_paise", "total_quote_paise", "translation_needed", "pickup_status", "pickup_address", "courier_inbound", "courier_outbound", "courier_return", "stage", "notes", "created_at", "updated_at") SELECT "id", "client_id", "document_type", "destination_country", "current_step", "status", "document_json", "category", "route", "chain_json", "govt_fee_paise", "service_fee_paise", "courier_fee_paise", "translation_fee_paise", "total_quote_paise", "translation_needed", "pickup_status", "pickup_address", "courier_inbound", "courier_outbound", "courier_return", "stage", "notes", "created_at", "updated_at" FROM `attestation_applications`;--> statement-breakpoint
DROP TABLE `attestation_applications`;--> statement-breakpoint
ALTER TABLE `__new_attestation_applications` RENAME TO `attestation_applications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;