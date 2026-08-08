CREATE TABLE `erpnext_sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_name` text NOT NULL,
	`entity_id` text NOT NULL,
	`doctype` text DEFAULT 'Sales Invoice' NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`erp_doc_name` text,
	`error` text,
	`created_at` integer NOT NULL,
	`synced_at` integer
);
