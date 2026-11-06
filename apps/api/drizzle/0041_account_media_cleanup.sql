CREATE TABLE IF NOT EXISTS "account_media_cleanup_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bucket" varchar(24) NOT NULL,
  "prefix" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "account_media_cleanup_bucket_chk" CHECK ("bucket" IN ('PROFILE_MEDIA','DM_ATTACHMENTS')),
  CONSTRAINT "account_media_cleanup_bucket_prefix_key" UNIQUE("bucket","prefix")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_media_cleanup_pending_idx" ON "account_media_cleanup_jobs" ("created_at") WHERE "completed_at" IS NULL;
