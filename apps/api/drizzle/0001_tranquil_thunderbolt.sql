ALTER TABLE "uorqui_workplace"."message" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."message" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."message" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."message" ADD CONSTRAINT "message_author_client" UNIQUE("author_id","client_id");