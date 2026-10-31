ALTER TABLE "direct_messages" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD COLUMN "forwarded_from_id" uuid;--> statement-breakpoint
CREATE TABLE "direct_message_reactions" (
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "emoji" varchar(16) NOT NULL,
  CONSTRAINT "direct_message_reactions_message_id_user_id_pk" PRIMARY KEY("message_id","user_id")
);--> statement-breakpoint
ALTER TABLE "direct_message_reactions" ADD CONSTRAINT "direct_message_reactions_message_id_direct_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."direct_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_message_reactions" ADD CONSTRAINT "direct_message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
