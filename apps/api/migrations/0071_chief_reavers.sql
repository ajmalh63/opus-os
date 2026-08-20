ALTER TABLE `audit_log` ADD `category` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `actor_type` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `result` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `auth_method` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `data_classification` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `schema_version` text DEFAULT '1.1' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `prev_hash` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `record_hash` text;--> statement-breakpoint
-- NOTE: drizzle-kit 0.31 does not emit standalone sqlite indexes declared via
-- index() exports (verified 2026-08-17). These two are appended manually per
-- docs/audit-logging-gold-standard.md (chain-head lookup + category filtering).
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `audit_log_category_idx` ON `audit_log` (`category`);
