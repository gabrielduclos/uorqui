CREATE TABLE "user_contacts" (
  "owner_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_contacts_owner_id_contact_id_pk" PRIMARY KEY("owner_id","contact_id"),
  CONSTRAINT "user_contacts_not_self" CHECK ("user_contacts"."owner_id" <> "user_contacts"."contact_id")
);
--> statement-breakpoint
ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_contact_id_users_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
