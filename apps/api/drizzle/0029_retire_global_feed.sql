-- Legacy global feed retirement, approved 2026-11-02.
-- Backup: Neon branch backup/pre-retire-feed-2026-11-02 (br-red-star-b6uqrqe4).
-- Do not remove R2 objects in this schema migration.
-- No CASCADE: fail safely when external dependencies still exist.
DELETE FROM "activity_notifications" WHERE "kind" IN ('post_like','post_comment','follow');
DELETE FROM "content_reports" WHERE "target_kind" = 'post';
ALTER TABLE "content_reports" DROP CONSTRAINT IF EXISTS "content_reports_target_kind";
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_target_kind"
  CHECK ("target_kind" IN ('direct_message','community_message'));
DROP TABLE IF EXISTS "feed_media";
DROP TABLE IF EXISTS "feed_likes";
DROP TABLE IF EXISTS "feed_comments";
DROP TABLE IF EXISTS "feed_follows";
DROP TABLE IF EXISTS "feed_posts";
ALTER TABLE "notification_preferences" DROP COLUMN IF EXISTS "post_like";
ALTER TABLE "notification_preferences" DROP COLUMN IF EXISTS "post_comment";
ALTER TABLE "notification_preferences" DROP COLUMN IF EXISTS "follow";
