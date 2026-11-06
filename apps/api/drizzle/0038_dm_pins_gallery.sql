-- One shared pinned direct message per conversation, visible to its members.
-- Deleting a conversation or canceling an unread message removes the matching pin.
CREATE TABLE IF NOT EXISTS "direct_message_pins" (
  "conversation_id" uuid PRIMARY KEY NOT NULL REFERENCES "direct_conversations"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "direct_messages"("id") ON DELETE CASCADE,
  "pinned_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "pinned_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_message_pins_message_idx" ON "direct_message_pins" ("message_id");
--> statement-breakpoint
-- Gallery queries remain index-backed for conversations with long histories.
CREATE INDEX IF NOT EXISTS "direct_messages_attachment_gallery_idx"
  ON "direct_messages" ("conversation_id", "created_at" DESC, "id" DESC)
  WHERE "attachment_id" IS NOT NULL AND "deleted_at" IS NULL;
