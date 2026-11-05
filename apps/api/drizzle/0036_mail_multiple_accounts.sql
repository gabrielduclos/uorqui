DROP INDEX IF EXISTS "mail_connections_user_provider";
--> statement-breakpoint
ALTER TABLE "mail_connections" DROP CONSTRAINT IF EXISTS "mail_connections_provider";
--> statement-breakpoint
ALTER TABLE "mail_connections" ADD CONSTRAINT "mail_connections_provider" CHECK ("provider" IN ('gmail','outlook','manual'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_connections_user_provider_email" ON "mail_connections" USING btree ("user_id","provider","email");