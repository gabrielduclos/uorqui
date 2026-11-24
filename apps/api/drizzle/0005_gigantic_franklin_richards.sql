CREATE TABLE "uorqui_workplace"."message_reaction" (
	"message_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	CONSTRAINT "message_reaction_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji"),
	CONSTRAINT "reaction_emoji_valid" CHECK ("uorqui_workplace"."message_reaction"."emoji" in ('👍', '❤️', '😂', '😮', '😢', '🎉'))
);
--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."message_reaction" ADD CONSTRAINT "message_reaction_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "uorqui_workplace"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."message_reaction" ADD CONSTRAINT "message_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;