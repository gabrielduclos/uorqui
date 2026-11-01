CREATE TABLE "feed_follows" (
  "follower_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "followed_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "feed_follows_follower_id_followed_id_pk" PRIMARY KEY("follower_id","followed_id"),
  CONSTRAINT "feed_follows_not_self" CHECK ("follower_id" <> "followed_id")
);
--> statement-breakpoint
CREATE INDEX "feed_follows_followed_idx" ON "feed_follows" USING btree ("followed_id");
