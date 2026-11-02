-- Channel passwords are salted and scrypt-hashed by the API. No plaintext passwords are stored.
ALTER TABLE "community_channels" ADD COLUMN "password_hash" text;
CREATE TABLE "community_channel_password_access" (
  "channel_id" uuid NOT NULL REFERENCES "community_channels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("channel_id","user_id")
);
CREATE TABLE "community_channel_password_attempts" (
  "channel_id" uuid NOT NULL REFERENCES "community_channels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "failed_count" integer NOT NULL DEFAULT 0,
  "last_failed_at" timestamptz,
  PRIMARY KEY ("channel_id","user_id")
);
