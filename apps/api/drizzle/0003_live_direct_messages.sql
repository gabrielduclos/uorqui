ALTER TABLE "direct_messages" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "direct_messages_client_id_idx" ON "direct_messages" USING btree ("client_id");
