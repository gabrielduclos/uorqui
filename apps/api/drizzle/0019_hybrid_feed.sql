CREATE TABLE "feed_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "body" text DEFAULT '' NOT NULL,
  "media_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "feed_posts_body_length" CHECK (length(body) <= 4000),
  CONSTRAINT "feed_posts_media_count" CHECK (media_count BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE INDEX "feed_posts_published_idx" ON "feed_posts" USING btree ("published_at","id");
--> statement-breakpoint
CREATE INDEX "feed_posts_author_idx" ON "feed_posts" USING btree ("author_id");
--> statement-breakpoint
CREATE TABLE "feed_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "public"."feed_posts"("id") ON DELETE cascade,
  "position" integer NOT NULL,
  "type" varchar(80) NOT NULL,
  "size" integer NOT NULL,
  CONSTRAINT "feed_media_position" CHECK (position BETWEEN 0 AND 5),
  CONSTRAINT "feed_media_size" CHECK (size BETWEEN 1 AND 52428800)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "feed_media_post_position_idx" ON "feed_media" USING btree ("post_id","position");
--> statement-breakpoint
CREATE TABLE "feed_likes" (
  "post_id" uuid NOT NULL REFERENCES "public"."feed_posts"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "feed_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feed_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "public"."feed_posts"("id") ON DELETE cascade,
  "author_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "feed_comments_length" CHECK (length(body) BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE INDEX "feed_comments_post_created_idx" ON "feed_comments" USING btree ("post_id","created_at");
