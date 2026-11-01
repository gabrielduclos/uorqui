CREATE TABLE IF NOT EXISTS "community_channel_reads" (
  "channel_id" uuid NOT NULL REFERENCES "community_channels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_read_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "community_channel_reads_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_channel_reads_user_idx" ON "community_channel_reads" ("user_id");
