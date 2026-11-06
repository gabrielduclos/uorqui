CREATE TABLE IF NOT EXISTS "notification_inbox_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "actor_id" uuid REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "kind" varchar(16) NOT NULL,
  "event_key" text NOT NULL UNIQUE,
  "community_message_id" uuid REFERENCES "public"."community_messages"("id") ON DELETE CASCADE,
  "mail_account_id" uuid REFERENCES "public"."mail_connections"("id") ON DELETE CASCADE,
  "mail_message_id" varchar(1024),
  "sender" varchar(180),
  "subject" varchar(240),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "read_at" timestamp with time zone,
  CONSTRAINT "notification_inbox_events_kind_chk" CHECK (
    ("kind"='mention' AND "actor_id" IS NOT NULL AND "community_message_id" IS NOT NULL AND "mail_account_id" IS NULL AND "mail_message_id" IS NULL)
    OR ("kind"='email' AND "mail_account_id" IS NOT NULL AND "mail_message_id" IS NOT NULL AND "actor_id" IS NULL AND "community_message_id" IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_inbox_events_recipient_date_idx" ON "notification_inbox_events" ("recipient_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_inbox_events_recipient_unread_idx" ON "notification_inbox_events" ("recipient_id","read_at");
