ALTER TABLE "community_messages" ADD COLUMN "edited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "community_messages" ADD COLUMN "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "community_messages" ADD COLUMN "deleted_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "community_bans" (
  "community_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "banned_by_id" uuid,
  "reason" varchar(300),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "community_bans_community_id_user_id_pk" PRIMARY KEY("community_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_banned_by_id_users_id_fk" FOREIGN KEY ("banned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "community_bans_user_idx" ON "community_bans" USING btree ("user_id");
