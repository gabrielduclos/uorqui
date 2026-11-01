CREATE TABLE IF NOT EXISTS "content_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_kind" varchar(24) NOT NULL,
  "target_id" uuid NOT NULL,
  "target_author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" varchar(24) NOT NULL,
  "details" varchar(1000),
  "evidence" jsonb NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "content_reports_target_kind" CHECK ("target_kind" IN ('post','direct_message','community_message')),
  CONSTRAINT "content_reports_reason" CHECK ("reason" IN ('spam','harassment','hate','sexual','violence','scam','privacy','other')),
  CONSTRAINT "content_reports_status" CHECK ("status" IN ('pending','reviewing','resolved','dismissed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_reports_reporter_target_idx" ON "content_reports" ("reporter_id","target_kind","target_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_reports_status_created_idx" ON "content_reports" ("status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_reports_reporter_created_idx" ON "content_reports" ("reporter_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moderation_report_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "report_id" uuid NOT NULL REFERENCES "content_reports"("id") ON DELETE CASCADE,
  "moderator_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(16) NOT NULL,
  "previous_status" varchar(16) NOT NULL,
  "next_status" varchar(16) NOT NULL,
  "note" varchar(1000),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "moderation_report_actions_action" CHECK ("action" IN ('review','resolve','dismiss','remove'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_report_actions_report_idx" ON "moderation_report_actions" ("report_id","created_at");
