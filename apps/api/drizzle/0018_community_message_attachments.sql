ALTER TABLE "community_messages" ADD COLUMN "attachment_id" uuid;
--> statement-breakpoint
ALTER TABLE "community_messages" ADD COLUMN "attachment_name" varchar(180);
--> statement-breakpoint
ALTER TABLE "community_messages" ADD COLUMN "attachment_type" varchar(100);
--> statement-breakpoint
ALTER TABLE "community_messages" ADD COLUMN "attachment_size" integer;
--> statement-breakpoint
ALTER TABLE "community_messages" DROP CONSTRAINT "community_messages_length";
--> statement-breakpoint
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_length" CHECK ((length("community_messages"."body") BETWEEN 1 AND 4000 OR (length("community_messages"."body")=0 AND "community_messages"."attachment_id" IS NOT NULL)));
--> statement-breakpoint
ALTER TABLE "community_messages" ADD CONSTRAINT "community_message_attachment_consistency" CHECK (((attachment_id IS NULL AND attachment_name IS NULL AND attachment_type IS NULL AND attachment_size IS NULL) OR (attachment_id IS NOT NULL AND attachment_name IS NOT NULL AND attachment_type IS NOT NULL AND attachment_size > 0 AND attachment_size <= 52428800)));
