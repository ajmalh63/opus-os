CREATE TABLE `rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`bucket` text NOT NULL,
	`window_start` integer NOT NULL,
	`identity` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_bucket_window_idx` ON `rate_limit` (`bucket`,`window_start`);
--> statement-breakpoint
CREATE INDEX `rate_limit_identity_idx` ON `rate_limit` (`identity`);
