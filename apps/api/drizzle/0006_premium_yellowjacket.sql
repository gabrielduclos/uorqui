CREATE TABLE "uorqui_workplace"."avatar_upload" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" uuid,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."team" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."avatar_upload" ADD CONSTRAINT "avatar_upload_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."avatar_upload" ADD CONSTRAINT "avatar_upload_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "uorqui_workplace"."team"("id") ON DELETE cascade ON UPDATE no action;