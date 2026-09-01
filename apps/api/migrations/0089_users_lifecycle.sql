PRAGMA foreign_keys = OFF;
--> statement-breakpoint
-- RolesTab v2: 3-state lifecycle for staff offboarding
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_users_email_status ON users(email, status);
