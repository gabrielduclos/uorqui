ALTER TABLE "direct_message_reactions" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "direct_message_reactions" ADD COLUMN "read_at" timestamp with time zone;
