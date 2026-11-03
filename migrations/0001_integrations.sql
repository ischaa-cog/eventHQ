-- Per-client integrations: encrypted connections, daily ad spend, and event attribution rules.
CREATE TABLE IF NOT EXISTS "ad_spend_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"connection_id" integer NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text,
	"date" date NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"leads" integer DEFAULT 0,
	"purchases" integer DEFAULT 0,
	"purchase_value" numeric(14, 2) DEFAULT '0',
	"event_performance_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_attribution_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"event_performance_id" integer NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"match_value" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text DEFAULT '' NOT NULL,
	"display_name" text,
	"credentials_ciphertext" text,
	"webhook_secret_ciphertext" text,
	"status" text DEFAULT 'active' NOT NULL,
	"settings" jsonb,
	"last_sync_at" timestamp with time zone,
	"last_sync_cursor" text,
	"last_error" text,
	"last_webhook_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "connection_id" integer;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "product_id" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ad_spend_daily" ADD CONSTRAINT "ad_spend_daily_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ad_spend_daily" ADD CONSTRAINT "ad_spend_daily_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ad_spend_daily" ADD CONSTRAINT "ad_spend_daily_event_performance_id_event_performance_id_fk" FOREIGN KEY ("event_performance_id") REFERENCES "public"."event_performance"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_attribution_rules" ADD CONSTRAINT "event_attribution_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_attribution_rules" ADD CONSTRAINT "event_attribution_rules_event_performance_id_event_performance_id_fk" FOREIGN KEY ("event_performance_id") REFERENCES "public"."event_performance"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ad_spend_connection_campaign_date_idx" ON "ad_spend_daily" USING btree ("connection_id","campaign_id","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_spend_client_date" ON "ad_spend_daily" USING btree ("client_id","date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_attribution_unique_idx" ON "event_attribution_rules" USING btree ("client_id","kind","provider","match_value");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_attribution_event" ON "event_attribution_rules" USING btree ("event_performance_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_client_provider_account_idx" ON "integration_connections" USING btree ("client_id","provider","external_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sales_client_date" ON "sales" USING btree ("client_id","sale_date");
