CREATE TABLE "user_friendships" (
  "user_a_id" uuid NOT NULL,
  "user_b_id" uuid NOT NULL,
  "requested_by_id" uuid NOT NULL,
  "status" varchar(12) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_friendships_user_a_id_user_b_id_pk" PRIMARY KEY("user_a_id","user_b_id"),
  CONSTRAINT "user_friendships_canonical" CHECK ("user_friendships"."user_a_id" < "user_friendships"."user_b_id"),
  CONSTRAINT "user_friendships_requester_member" CHECK ("user_friendships"."requested_by_id" = "user_friendships"."user_a_id" OR "user_friendships"."requested_by_id" = "user_friendships"."user_b_id"),
  CONSTRAINT "user_friendships_valid_status" CHECK ("user_friendships"."status" IN ('pending', 'accepted', 'declined', 'canceled'))
);
--> statement-breakpoint
ALTER TABLE "user_friendships" ADD CONSTRAINT "user_friendships_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_friendships" ADD CONSTRAINT "user_friendships_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_friendships" ADD CONSTRAINT "user_friendships_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_friendships_user_b_idx" ON "user_friendships" USING btree ("user_b_id");
