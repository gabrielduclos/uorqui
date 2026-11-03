-- Keep names unique inside each channel type, but allow the same display
-- name for text, voice and meeting channels in the same community.
-- Create the replacement before dropping the stricter index so constraints
-- are always enforced during this migration.
CREATE UNIQUE INDEX "community_channels_unique_kind_name"
  ON "community_channels" ("community_id","kind","name");
--> statement-breakpoint
DROP INDEX "community_channels_unique_name";
