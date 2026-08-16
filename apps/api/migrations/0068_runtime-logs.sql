CREATE TABLE `runtime_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`source` text NOT NULL,
	`message` text NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL
);
