-- Per-account visibility; no shared message row is removed.
CREATE TABLE IF NOT EXISTS "direct_conversation_user_states" (
  "conversation_id" uuid NOT NULL REFERENCES "direct_conversations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "archived_at" timestamptz,
  "cleared_at" timestamptz,
  "revived_at" timestamptz,
  CONSTRAINT "direct_conversation_user_states_pkey" PRIMARY KEY ("conversation_id","user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dm_user_states_user_idx" ON "direct_conversation_user_states" ("user_id");
