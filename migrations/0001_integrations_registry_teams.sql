-- Per-client integrations, ad spend per ad, opt-ins, the Event Registry, and client team logins.
CREATE TABLE IF NOT EXISTS "ad_spend_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"connection_id" integer NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text,
	"ad_id" text DEFAULT '' NOT NULL,
	"ad_name" text,
	"landing_url" text,
	"date" date NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"leads" integer DEFAULT 0,
	"purchases" integer DEFAULT 0,
	"purchase_value" numeric(14, 2) DEFAULT '0',
	"event_performance_id" integer,
	"match_status" text,
	"match_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"event_performance_id" integer NOT NULL,
	"name" text NOT NULL,
	"product_names" text[] NOT NULL,
	"price_text" text,
	"sold_through" text,
	"share_percent" numeric(5, 2) DEFAULT '100' NOT NULL,
	"notes" text,
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
CREATE TABLE IF NOT EXISTS "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opt_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"connection_id" integer NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"email" text,
	"page_url" text,
	"page_title" text,
	"form_id" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"event_performance_id" integer,
	"match_status" text,
	"match_note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_contract_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"full_value" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "event_code" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "default_products" jsonb;
--> statement-breakpoint
ALTER TABLE "event_performance" ADD COLUMN IF NOT EXISTS "registry_id" text;
--> statement-breakpoint
ALTER TABLE "event_performance" ADD COLUMN IF NOT EXISTS "funnel_role" text;
--> statement-breakpoint
ALTER TABLE "event_performance" ADD COLUMN IF NOT EXISTS "feeds_into_id" integer;
--> statement-breakpoint
ALTER TABLE "event_performance" ADD COLUMN IF NOT EXISTS "ads_start" date;
--> statement-breakpoint
ALTER TABLE "event_performance" ADD COLUMN IF NOT EXISTS "cart_open" date;
--> statement-breakpoint
ALTER TABLE "event_performance" ADD COLUMN IF NOT EXISTS "cart_close" date;
--> statement-breakpoint
ALTER TABLE "event_performance" ADD COLUMN IF NOT EXISTS "post_cart_end" date;
--> statement-breakpoint
ALTER TABLE "event_performance" ADD COLUMN IF NOT EXISTS "page_links" text[];
--> statement-breakpoint
ALTER TABLE "event_performance" ADD COLUMN IF NOT EXISTS "products" jsonb;
--> statement-breakpoint
ALTER TABLE "event_performance" ADD COLUMN IF NOT EXISTS "ad_campaign_ids" text[];
--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "client_role" text;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "connection_id" integer;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "product_id" text;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "parent_dedupe_key" text;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "match_status" text;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "match_tier" text;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "match_offer_id" integer;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "match_note" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "client_role" varchar;
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
  ALTER TABLE "event_offers" ADD CONSTRAINT "event_offers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_offers" ADD CONSTRAINT "event_offers_event_performance_id_event_performance_id_fk" FOREIGN KEY ("event_performance_id") REFERENCES "public"."event_performance"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "opt_ins" ADD CONSTRAINT "opt_ins_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "opt_ins" ADD CONSTRAINT "opt_ins_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "opt_ins" ADD CONSTRAINT "opt_ins_event_performance_id_event_performance_id_fk" FOREIGN KEY ("event_performance_id") REFERENCES "public"."event_performance"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_contract_values" ADD CONSTRAINT "product_contract_values_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ad_spend_connection_ad_date_idx" ON "ad_spend_daily" USING btree ("connection_id","campaign_id","ad_id","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_spend_client_date" ON "ad_spend_daily" USING btree ("client_id","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_offers_event" ON "event_offers" USING btree ("event_performance_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_client_provider_account_idx" ON "integration_connections" USING btree ("client_id","provider","external_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opt_ins_connection_external_idx" ON "opt_ins" USING btree ("connection_id","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opt_ins_client_date" ON "opt_ins" USING btree ("client_id","submitted_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_contract_client_name_idx" ON "product_contract_values" USING btree ("client_id","product_name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_perf_client_registry_id_idx" ON "event_performance" USING btree ("client_id","registry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sales_client_date" ON "sales" USING btree ("client_id","sale_date");
