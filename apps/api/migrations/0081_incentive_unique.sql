-- Fix: ensure incentive accrual idempotency at DB level (prevent double-credit on concurrent payment.captured)
CREATE UNIQUE INDEX IF NOT EXISTS incentive_entries_trigger_ref_idx ON incentive_entries(trigger_ref);
