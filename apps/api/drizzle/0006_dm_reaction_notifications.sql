ALTER TABLE "direct_message_reactions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "direct_message_reactions" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
UPDATE "direct_message_reactions" SET "read_at" = "updated_at";--> statement-breakpoint
CREATE INDEX "dm_reactions_message_updated_idx" ON "direct_message_reactions" USING btree ("message_id","updated_at");
