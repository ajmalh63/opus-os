CREATE TABLE `listmonk_suppressions` (
	`email` text PRIMARY KEY NOT NULL,
	`suppressed` integer DEFAULT false NOT NULL,
	`reason` text,
	`soft_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
