CREATE TABLE IF NOT EXISTS "account_legal_acceptances" (
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "terms_version" varchar(32) NOT NULL,
  "privacy_version" varchar(32) NOT NULL,
  "accepted_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "account_legal_acceptances_pk" PRIMARY KEY ("user_id","terms_version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_legal_acceptances_accepted_idx" ON "account_legal_acceptances" ("accepted_at");
