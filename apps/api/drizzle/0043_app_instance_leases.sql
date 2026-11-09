-- Exactly one active browser document per account and device category.
-- Entries are leases, not Better Auth sessions; closing a tab does not sign out.
CREATE TABLE IF NOT EXISTS "app_instance_leases" (
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "kind" varchar(8) NOT NULL,
  "instance_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "app_instance_leases_user_id_kind_pk" PRIMARY KEY ("user_id","kind"),
  CONSTRAINT "app_instance_leases_kind_chk" CHECK ("kind" IN ('desktop','mobile'))
);
