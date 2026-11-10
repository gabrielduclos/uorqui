-- A username change begins a 15-day cooldown; onboarding is not a change.
-- Existing accounts start with NULL, allowing one change before the first cooldown.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "handle_changed_at" timestamptz;
