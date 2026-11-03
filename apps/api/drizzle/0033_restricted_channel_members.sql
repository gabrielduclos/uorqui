-- Existing channels remain open until an owner/admin explicitly restricts them.
-- Access grants are independent of channel passwords and meeting admission.
ALTER TABLE "community_channels"
  ADD COLUMN "access_mode" varchar(12) NOT NULL DEFAULT 'open';
ALTER TABLE "community_channels"
  ADD CONSTRAINT "community_channel_access_mode"
  CHECK ("access_mode" IN ('open','restricted'));
--> statement-breakpoint
CREATE TABLE "community_channel_member_access" (
  "channel_id" uuid NOT NULL REFERENCES "community_channels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("channel_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "community_channel_member_access_user_idx"
  ON "community_channel_member_access" ("user_id");
