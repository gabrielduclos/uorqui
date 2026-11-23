CREATE TABLE "uorqui_workplace"."direct_conversation" (
	"channel_id" uuid PRIMARY KEY NOT NULL,
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	CONSTRAINT "direct_pair_unique" UNIQUE("user_a","user_b"),
	CONSTRAINT "direct_pair_order" CHECK ("uorqui_workplace"."direct_conversation"."user_a" < "uorqui_workplace"."direct_conversation"."user_b")
);
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	CONSTRAINT "profile_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."channel" ALTER COLUMN "team_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."team" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."direct_conversation" ADD CONSTRAINT "direct_conversation_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "uorqui_workplace"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."direct_conversation" ADD CONSTRAINT "direct_conversation_user_a_user_id_fk" FOREIGN KEY ("user_a") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."direct_conversation" ADD CONSTRAINT "direct_conversation_user_b_user_id_fk" FOREIGN KEY ("user_b") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;