-- Persistent, administrator-editable channel rules and descriptions.
-- Additive migration: existing channels retain NULL descriptions.
ALTER TABLE "community_channels" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='community_channel_description_length'
      AND conrelid='public.community_channels'::regclass
  ) THEN
    ALTER TABLE "community_channels"
      ADD CONSTRAINT "community_channel_description_length"
      CHECK ("description" IS NULL OR char_length("description") <= 4000);
  END IF;
END $$;
