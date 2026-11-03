-- Agency logins (Meta and HighLevel) that many client connections can share.
CREATE TABLE IF NOT EXISTS "oauth_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"account_ref" text NOT NULL,
	"display_name" text,
	"source" text DEFAULT 'oauth' NOT NULL,
	"credentials_ciphertext" text NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"created_by_user_id" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN IF NOT EXISTS "grant_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_grants_provider_account_idx" ON "oauth_grants" USING btree ("provider","account_ref");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_grant_id_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
