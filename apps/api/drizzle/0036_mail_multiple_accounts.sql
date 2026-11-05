DROP INDEX IF EXISTS "mail_connections_user_provider";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_connections_user_provider_email" ON "mail_connections" USING btree ("user_id", "provider", "email");