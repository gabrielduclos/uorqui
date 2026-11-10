-- Each meeting is capped at one shared hour from its first admitted participant.
-- The same deadline is returned to everyone; joining late does not extend it.
ALTER TABLE "community_channels" ADD COLUMN "meeting_expires_at" timestamptz;
