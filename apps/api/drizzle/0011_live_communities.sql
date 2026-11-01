ALTER TABLE "communities" ADD COLUMN "description" varchar(500);
--> statement-breakpoint
CREATE TABLE "community_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" uuid NOT NULL,
  "name" varchar(64) NOT NULL,
  "kind" varchar(8) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "community_channels_kind" CHECK ("community_channels"."kind" IN ('text', 'voice'))
);
--> statement-breakpoint
ALTER TABLE "community_channels" ADD CONSTRAINT "community_channels_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "community_channels_unique_name" ON "community_channels" USING btree ("community_id","name");
--> statement-breakpoint
CREATE INDEX "community_channels_community_idx" ON "community_channels" USING btree ("community_id");
--> statement-breakpoint
CREATE TABLE "community_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "community_messages_client_id_unique" UNIQUE("client_id"),
  CONSTRAINT "community_messages_length" CHECK (length("community_messages"."body") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_channel_id_community_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."community_channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "community_messages_channel_created_idx" ON "community_messages" USING btree ("channel_id","created_at");
--> statement-breakpoint
CREATE TABLE "community_join_requests" (
  "community_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" varchar(8) NOT NULL,
  "status" varchar(10) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "community_join_requests_community_id_user_id_pk" PRIMARY KEY("community_id","user_id"),
  CONSTRAINT "community_join_requests_kind" CHECK ("community_join_requests"."kind" IN ('join', 'invite')),
  CONSTRAINT "community_join_requests_status" CHECK ("community_join_requests"."status" IN ('pending', 'approved', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "community_join_requests" ADD CONSTRAINT "community_join_requests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "community_join_requests" ADD CONSTRAINT "community_join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "community_join_requests_user_idx" ON "community_join_requests" USING btree ("user_id");
