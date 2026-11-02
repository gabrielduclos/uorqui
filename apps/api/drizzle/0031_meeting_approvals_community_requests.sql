-- Meeting admission policy is separate from community membership.
ALTER TABLE "community_channels" ADD COLUMN IF NOT EXISTS "meeting_join_policy" varchar(12) NOT NULL DEFAULT 'open';
ALTER TABLE "community_channels" ADD CONSTRAINT "community_meeting_policy" CHECK ("meeting_join_policy" IN ('open','approval'));
CREATE TABLE IF NOT EXISTS "meeting_access_requests" (
  "channel_id" uuid NOT NULL REFERENCES "community_channels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(10) NOT NULL DEFAULT 'pending',
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("channel_id","user_id"),
  CONSTRAINT "meeting_access_requests_status" CHECK ("status" IN ('pending','approved','declined'))
);
CREATE INDEX IF NOT EXISTS "meeting_access_requests_status_idx" ON "meeting_access_requests"("channel_id","status");
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "community_request" boolean NOT NULL DEFAULT true;
-- Keep activity inbox constraints in step with community and meeting requests.
ALTER TABLE "activity_notifications" DROP CONSTRAINT IF EXISTS "activity_notifications_kind";
ALTER TABLE "activity_notifications" ADD CONSTRAINT "activity_notifications_kind"
  CHECK ("kind" IN ('friend_request','friend_accepted','community_join_request','meeting_join_request'));
