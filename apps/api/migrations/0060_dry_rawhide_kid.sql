CREATE TABLE `attestation_rate_matrix` (
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
