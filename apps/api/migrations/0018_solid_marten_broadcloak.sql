CREATE TABLE `statutory_registers` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`type` text NOT NULL,
	`employee_name` text NOT NULL,
	`employee_id` text,
	`wage_amount` integer NOT NULL,
	`deduction_paise` integer NOT NULL,
	`employer_share` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`paid_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
