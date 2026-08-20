PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_twoFactor` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`secret` text NOT NULL,
	`backupCodes` text NOT NULL,
	`verified` integer DEFAULT true NOT NULL,
	`failedVerificationCount` integer DEFAULT 0 NOT NULL,
	`lockedUntil` integer,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_twoFactor`("id", "userId", "secret", "backupCodes", "verified", "failedVerificationCount", "lockedUntil") SELECT "id", "userId", "secret", "backupCodes", "verified", "failedVerificationCount", "lockedUntil" FROM `twoFactor`;--> statement-breakpoint
DROP TABLE `twoFactor`;--> statement-breakpoint
ALTER TABLE `__new_twoFactor` RENAME TO `twoFactor`;--> statement-breakpoint
PRAGMA foreign_keys=ON;