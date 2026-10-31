ALTER TABLE "direct_messages" ADD COLUMN "attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN "attachment_name" varchar(180);--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN "attachment_type" varchar(100);--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN "attachment_size" integer;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "dm_attachment_consistency" CHECK (
  (attachment_id IS NULL AND attachment_name IS NULL AND attachment_type IS NULL AND attachment_size IS NULL) OR
  (attachment_id IS NOT NULL AND attachment_name IS NOT NULL AND attachment_type IS NOT NULL AND attachment_size > 0 AND attachment_size <= 20971520)
);
