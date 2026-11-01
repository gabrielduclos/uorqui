CREATE TABLE IF NOT EXISTS "activity_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "actor_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "kind" varchar(32) NOT NULL,
  "target_id" uuid NOT NULL,
  "event_key" text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "read_at" timestamptz,
  CONSTRAINT "activity_notifications_no_self" CHECK ("recipient_id" <> "actor_id"),
  CONSTRAINT "activity_notifications_kind" CHECK ("kind" IN ('post_like','post_comment','friend_request','friend_accepted','follow'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_notifications_recipient_date_idx" ON "activity_notifications"("recipient_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_notifications_unread_idx" ON "activity_notifications"("recipient_id","read_at");
