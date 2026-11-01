CREATE TABLE "community_voice_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "channel_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "muted" boolean DEFAULT false NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_voice_sessions" ADD CONSTRAINT "community_voice_sessions_channel_id_community_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."community_channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "community_voice_sessions" ADD CONSTRAINT "community_voice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "community_voice_one_session_per_user_idx" ON "community_voice_sessions" USING btree ("channel_id","user_id");
--> statement-breakpoint
CREATE INDEX "community_voice_sessions_last_seen_idx" ON "community_voice_sessions" USING btree ("last_seen_at");
--> statement-breakpoint
CREATE TABLE "community_voice_signals" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "channel_id" uuid NOT NULL,
  "sender_session_id" uuid NOT NULL,
  "recipient_session_id" uuid NOT NULL,
  "kind" varchar(12) NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "community_voice_signal_kind" CHECK ("community_voice_signals"."kind" IN ('offer', 'answer', 'candidate'))
);
--> statement-breakpoint
ALTER TABLE "community_voice_signals" ADD CONSTRAINT "community_voice_signals_channel_id_community_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."community_channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "community_voice_signal_recipient_idx" ON "community_voice_signals" USING btree ("channel_id","recipient_session_id","id");
--> statement-breakpoint
CREATE INDEX "community_voice_signal_created_idx" ON "community_voice_signals" USING btree ("created_at");
