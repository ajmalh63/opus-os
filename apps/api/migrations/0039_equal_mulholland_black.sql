CREATE TABLE `visa_products` (
	`id` text PRIMARY KEY NOT NULL,
	`country` text NOT NULL,
	`visa_type` text NOT NULL,
	`entry_type` text NOT NULL,
	`processing_time` text NOT NULL,
	`fee_paise` integer NOT NULL,
	`required_docs_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
