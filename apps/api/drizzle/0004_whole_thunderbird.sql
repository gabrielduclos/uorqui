CREATE TABLE "uorqui_workplace"."channel_read" (
	"user_id" text NOT NULL,
	"channel_id" uuid NOT NULL,
	"last_message_id" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "channel_read_user_id_channel_id_pk" PRIMARY KEY("user_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."channel_read" ADD CONSTRAINT "channel_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."channel_read" ADD CONSTRAINT "channel_read_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "uorqui_workplace"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_channel_cursor_idx" ON "uorqui_workplace"."message" USING btree ("channel_id","id");