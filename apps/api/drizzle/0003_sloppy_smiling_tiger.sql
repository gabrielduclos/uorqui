CREATE TABLE "uorqui_workplace"."attachment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"message_id" bigint,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."message" ADD COLUMN "location" jsonb;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."user" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."attachment" ADD CONSTRAINT "attachment_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "uorqui_workplace"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."attachment" ADD CONSTRAINT "attachment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."attachment" ADD CONSTRAINT "attachment_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "uorqui_workplace"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_message_idx" ON "uorqui_workplace"."attachment" USING btree ("message_id");--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."user" ADD CONSTRAINT "user_handle_unique" UNIQUE("handle");
--> statement-breakpoint
UPDATE "uorqui_workplace"."user" AS u SET "handle" = p."handle" FROM "uorqui_workplace"."profile" AS p WHERE p."user_id" = u."id";
