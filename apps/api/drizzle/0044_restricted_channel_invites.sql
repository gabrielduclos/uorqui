-- Single-use channel capability tokens: only SHA-256 digests persist in PostgreSQL.
-- A token grants membership plus the restricted-channel ACL only on explicit acceptance.
-- Password and meeting approval gates remain separate.
CREATE TABLE "community_channel_invite_links" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "channel_id" uuid NOT NULL REFERENCES "community_channels"("id") ON DELETE CASCADE,
  "created_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "redeemed_at" timestamptz,
  "redeemed_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX "community_channel_invites_creator_idx"
  ON "community_channel_invite_links" ("channel_id","created_by_id");
--> statement-breakpoint
CREATE INDEX "community_channel_invites_expiry_idx"
  ON "community_channel_invite_links" ("expires_at");
