-- One pinned message per direct conversation, visible to both participants.
-- Cancelling/deleting that message automatically releases the pin.
ALTER TABLE "direct_conversations" ADD COLUMN IF NOT EXISTS "pinned_message_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='direct_conversations_pinned_message_id_direct_messages_id_fk') THEN
    ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_pinned_message_id_direct_messages_id_fk"
      FOREIGN KEY ("pinned_message_id") REFERENCES "public"."direct_messages"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
