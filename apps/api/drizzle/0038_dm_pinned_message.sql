-- One pinned message per direct conversation, visible to both participants.
-- Cancelling/deleting that message automatically releases the pin.
ALTER TABLE "direct_conversations" ADD COLUMN IF NOT EXISTS "pinned_message_id" uuid REFERENCES "direct_messages"("id") ON DELETE SET NULL;
