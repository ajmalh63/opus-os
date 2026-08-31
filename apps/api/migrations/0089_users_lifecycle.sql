PRAGMA foreign_keys = OFF;
--> statement-breakpoint
-- RolesTab v2: 3-state lifecycle for staff offboarding (gold standard: suspend → archive → remove)
-- Suspend = reversible pause, Archive = soft-delete + clear grants + reassign, Remove = hard delete after retention
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','archived'));
ALTER TABLE users ADD COLUMN status_changed_at INTEGER;
ALTER TABLE users ADD COLUMN status_changed_by TEXT REFERENCES users(id);
ALTER TABLE users ADD COLUMN archived_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_email_status ON users(email, status);
