-- Add community video meetings alongside existing voice and text channels.
-- Retain all existing channels and messages; voice signaling and session rules are shared.
ALTER TABLE "community_channels" DROP CONSTRAINT IF EXISTS "community_channels_kind";
ALTER TABLE "community_channels" ADD CONSTRAINT "community_channels_kind"
  CHECK ("kind" = 'text' OR "kind" = 'voice' OR "kind" = 'meeting');
