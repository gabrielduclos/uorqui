-- Shared channel position for every member of the community.
-- Preserve the existing creation order when upgrading existing communities.
ALTER TABLE "community_channels" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY community_id ORDER BY created_at,id)-1)::int AS position
  FROM community_channels
)
UPDATE community_channels SET sort_order=ranked.position FROM ranked WHERE community_channels.id=ranked.id;
--> statement-breakpoint
CREATE INDEX "community_channels_order_idx" ON "community_channels" ("community_id","sort_order");
