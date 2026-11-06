ALTER TABLE "community_messages" ADD COLUMN IF NOT EXISTS "reply_to_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_messages_reply_to_id_community_messages_id_fk') THEN
    ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_reply_to_id_community_messages_id_fk"
      FOREIGN KEY ("reply_to_id") REFERENCES "public"."community_messages"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_messages_reply_to_idx" ON "community_messages" USING btree ("reply_to_id");
