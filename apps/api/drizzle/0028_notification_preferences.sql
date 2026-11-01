CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "direct_message" boolean NOT NULL DEFAULT true,
  "community_message" boolean NOT NULL DEFAULT true,
  "post_like" boolean NOT NULL DEFAULT true,
  "post_comment" boolean NOT NULL DEFAULT true,
  "friend_request" boolean NOT NULL DEFAULT true,
  "friend_accepted" boolean NOT NULL DEFAULT true,
  "follow" boolean NOT NULL DEFAULT true
);
