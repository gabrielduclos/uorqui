CREATE TABLE "community_message_reactions" (
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "emoji" varchar(16) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "community_message_reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
ALTER TABLE "community_message_reactions" ADD CONSTRAINT "community_message_reactions_message_id_community_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."community_messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "community_message_reactions" ADD CONSTRAINT "community_message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "community_message_reactions_user_idx" ON "community_message_reactions" USING btree ("user_id");
