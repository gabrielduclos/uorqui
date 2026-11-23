CREATE SCHEMA "uorqui_workplace";
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."channel_member" (
	"channel_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "channel_member_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_channel_name" UNIQUE("team_id","name"),
	CONSTRAINT "unique_channel_team" UNIQUE("id","team_id"),
	CONSTRAINT "valid_channel_visibility" CHECK ("uorqui_workplace"."channel"."visibility" in ('team', 'private'))
);
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."invitation" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"team_id" uuid NOT NULL,
	"channel_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."team_member" (
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "team_member_team_id_user_id_pk" PRIMARY KEY("team_id","user_id"),
	CONSTRAINT "valid_team_role" CHECK ("uorqui_workplace"."team_member"."role" in ('owner', 'member'))
);
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."message" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "uorqui_workplace"."message_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"channel_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"parent_id" bigint,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_message_channel" UNIQUE("id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "uorqui_workplace"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."channel_member" ADD CONSTRAINT "channel_member_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "uorqui_workplace"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."channel_member" ADD CONSTRAINT "channel_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."channel" ADD CONSTRAINT "channel_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "uorqui_workplace"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."invitation" ADD CONSTRAINT "invitation_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "uorqui_workplace"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."invitation" ADD CONSTRAINT "invitation_channel_id_team_id_channel_id_team_id_fk" FOREIGN KEY ("channel_id","team_id") REFERENCES "uorqui_workplace"."channel"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "uorqui_workplace"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."message" ADD CONSTRAINT "message_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "uorqui_workplace"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."message" ADD CONSTRAINT "message_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "uorqui_workplace"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."message" ADD CONSTRAINT "message_parent_id_channel_id_message_id_channel_id_fk" FOREIGN KEY ("parent_id","channel_id") REFERENCES "uorqui_workplace"."message"("id","channel_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uorqui_workplace"."session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "uorqui_workplace"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "uorqui_workplace"."account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "channel_member_user_idx" ON "uorqui_workplace"."channel_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_member_user_idx" ON "uorqui_workplace"."team_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_channel_thread_idx" ON "uorqui_workplace"."message" USING btree ("channel_id","parent_id","id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "uorqui_workplace"."session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "uorqui_workplace"."verification" USING btree ("identifier");