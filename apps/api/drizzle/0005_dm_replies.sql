ALTER TABLE "direct_messages" ADD COLUMN "reply_to_id" uuid;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_reply_to_id_direct_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."direct_messages"("id") ON DELETE set null ON UPDATE no action;
