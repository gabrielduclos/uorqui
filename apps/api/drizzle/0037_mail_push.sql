-- Background mail polling, deduplicated per external mailbox and message.
ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "email_message" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_inbox_state" (
  "account_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."mail_connections"("id") ON DELETE CASCADE,
  "unread_count" integer NOT NULL DEFAULT 0,
  "initialized_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_checked_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_seen_messages" (
  "account_id" uuid NOT NULL REFERENCES "public"."mail_connections"("id") ON DELETE CASCADE,
  "message_id" varchar(1024) NOT NULL,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mail_seen_messages_pk" PRIMARY KEY ("account_id", "message_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_seen_messages_seen_idx" ON "mail_seen_messages" ("first_seen_at");
