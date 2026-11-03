-- Baseline: the schema as it stood when migrations were introduced (2026-11-03).
-- Written to be safe on the existing production database, which was built with `drizzle-kit push`:
-- every table, index and foreign key is created only if it is missing.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"user_email" text,
	"user_name" text,
	"user_role" text,
	"client_id" integer,
	"client_name" text,
	"action" text NOT NULL,
	"item" text,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_language" text DEFAULT 'English (US)',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"agency_id" integer NOT NULL,
	"name" text NOT NULL,
	"asset_type" text NOT NULL,
	"event_type" text NOT NULL,
	"item_count" integer DEFAULT 5,
	"system_prompt" text NOT NULL,
	"include_instructions" text,
	"output_format" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"asset_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'draft',
	"version" integer DEFAULT 1,
	"owner_role" text,
	"drive_url" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" text NOT NULL,
	"event_date" timestamp NOT NULL,
	"end_date" timestamp,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"event_link" text,
	"description" text,
	"attendee_emails" text[] DEFAULT '{}',
	"google_event_id" text,
	"google_calendar_id" text,
	"google_sync_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_calendar_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"calendar_id" text NOT NULL,
	"last_successful_sync" timestamp,
	"error" text,
	CONSTRAINT "client_calendar_connections_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"agency_id" integer NOT NULL,
	"name" text NOT NULL,
	"full_name" text,
	"email" text,
	"phone" text,
	"business_address" text,
	"business_name" text,
	"niche" text,
	"website" text,
	"primary_offer" text,
	"brand_voice_tone" text[],
	"brand_voice_dos" text,
	"brand_voice_donts" text,
	"banned_words" text,
	"style_guide" text,
	"headshot" text,
	"google_drive_access_token" text,
	"google_drive_refresh_token" text,
	"google_drive_folder_id" text,
	"google_drive_email" text,
	"meta_ads_access_token" text,
	"meta_ads_account_id" text,
	"meta_ads_account_name" text,
	"meta_ads_connected_at" timestamp,
	"webhook_token" text DEFAULT gen_random_uuid(),
	"is_active" boolean DEFAULT true NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demo_credentials" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_day_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_performance_id" integer NOT NULL,
	"day_number" integer NOT NULL,
	"day_date" timestamp,
	"day_title" text,
	"registrants_for_day" integer DEFAULT 0,
	"attendees_for_day" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"event_type" text,
	"name" text DEFAULT 'Monthly Goals',
	"period_type" text DEFAULT 'monthly',
	"target_revenue" numeric(12, 2) DEFAULT '0',
	"target_registrants" integer DEFAULT 0,
	"target_attendee_rate" numeric(5, 2) DEFAULT '40',
	"target_closing_rate" numeric(5, 2) DEFAULT '5',
	"target_roas" numeric(5, 2) DEFAULT '3',
	"target_events" integer DEFAULT 4,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_performance" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" text NOT NULL,
	"event_type" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"number_of_days" integer DEFAULT 1,
	"total_registrants" integer DEFAULT 0,
	"total_attendees" integer DEFAULT 0,
	"people_at_pitch" integer DEFAULT 0 NOT NULL,
	"ad_spend" numeric(10, 2) DEFAULT '0',
	"offer_type" text DEFAULT 'tickets',
	"sales_data" jsonb,
	"upsell_data" jsonb,
	"total_revenue" numeric(12, 2) DEFAULT '0',
	"profit" numeric(12, 2) DEFAULT '0',
	"roas" numeric(8, 2) DEFAULT '0',
	"notes" text,
	"data_source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"start_date" timestamp,
	"timezone" text,
	"hook" text,
	"free_tier_price" integer DEFAULT 0,
	"free_tier_includes" text,
	"vip_tier_price" integer,
	"vip_tier_bonuses" text,
	"backend_offer_price" integer,
	"backend_offer_name" text,
	"tier_data" jsonb,
	"backend_offer_description" text,
	"target_audience" text,
	"audience_pains" text,
	"audience_outcomes" text,
	"banned_phrases" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"selected_assets" text[],
	"status" text DEFAULT 'draft',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generation_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"status" text DEFAULT 'pending',
	"progress" integer DEFAULT 0,
	"selected_asset_types" text[],
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"email" text,
	"role" text NOT NULL,
	"agency_id" integer,
	"client_access" integer[],
	"created_by_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"used_at" timestamp,
	"used_by_id" varchar,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_ad_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"campaign_name" text NOT NULL,
	"delivery" text,
	"result_type" text,
	"results" integer,
	"cost_per_result" numeric(14, 4),
	"amount_spent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"impressions" integer,
	"reach" integer,
	"budget" numeric(14, 2),
	"budget_type" text,
	"ends_on" date,
	"reporting_start" date,
	"reporting_end" date,
	"attribution" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "neo_knowledge" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"collection" text NOT NULL,
	"training_resource_id" integer,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "neo_knowledge_training_resource_id_unique" UNIQUE("training_resource_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "neo_knowledge_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"knowledge_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"search" "tsvector" NOT NULL,
	"embedding" vector(512)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_id" integer NOT NULL,
	"client_id" integer,
	"recipient_user_id" varchar,
	"recipient_email" text,
	"email_status" text DEFAULT 'pending',
	"email_sent_at" timestamp,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"agency_id" integer NOT NULL,
	"sender_user_id" varchar,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projections" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" text NOT NULL,
	"ad_spend" numeric(12, 2) NOT NULL,
	"expected_registrations" integer NOT NULL,
	"show_up_rate" numeric(6, 3) NOT NULL,
	"conversion_rate" numeric(6, 3) NOT NULL,
	"average_sale_value" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"sale_date" timestamp DEFAULT now() NOT NULL,
	"product_name" text,
	"customer_email" text,
	"customer_name" text,
	"source" text DEFAULT 'highlevel',
	"external_id" text,
	"status" text DEFAULT 'paid' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"reference" text,
	"event_performance_id" integer,
	"dedupe_key" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"processor" text NOT NULL,
	"configured" boolean DEFAULT false NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"last_sync" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"resource_type" text NOT NULL,
	"url" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"visible_client_ids" integer[] DEFAULT '{}' NOT NULL,
	"is_global" boolean DEFAULT false NOT NULL,
	"seed_key" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "training_resources_seed_key_unique" UNIQUE("seed_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"vimeo_url" text NOT NULL,
	"duration_minutes" integer,
	"order_index" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tuck_chats" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" text DEFAULT 'New Chat' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tuck_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_credentials" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_video_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"video_id" integer NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar DEFAULT 'agency_employee',
	"agency_id" integer,
	"client_access" integer[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vault_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" text NOT NULL,
	"file_type" text NOT NULL,
	"content" text,
	"url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webinar_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" text DEFAULT 'Monthly Goals',
	"period_type" text DEFAULT 'monthly',
	"target_revenue" numeric(12, 2) DEFAULT '0',
	"target_registrants" integer DEFAULT 0,
	"target_attendee_rate" numeric(5, 2) DEFAULT '40',
	"target_closing_rate" numeric(5, 2) DEFAULT '5',
	"target_roas" numeric(5, 2) DEFAULT '3',
	"target_webinars" integer DEFAULT 4,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webinars" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" text NOT NULL,
	"date" timestamp NOT NULL,
	"webinar_type" text DEFAULT 'live',
	"total_registrants" integer DEFAULT 0,
	"total_attendees" integer DEFAULT 0,
	"people_at_pitch" integer DEFAULT 0,
	"masterclass_upsells" integer DEFAULT 0,
	"masterclass_downsells" integer DEFAULT 0,
	"masterclass_upsell_price" numeric(10, 2) DEFAULT '47',
	"masterclass_downsell_price" numeric(10, 2) DEFAULT '27',
	"challenge_tickets_ga" integer DEFAULT 0,
	"challenge_tickets_vip" integer DEFAULT 0,
	"challenge_tickets_platinum" integer DEFAULT 0,
	"challenge_tickets_diamond" integer DEFAULT 0,
	"ticket_price_ga" numeric(10, 2) DEFAULT '97',
	"ticket_price_vip" numeric(10, 2) DEFAULT '297',
	"ticket_price_platinum" numeric(10, 2) DEFAULT '997',
	"ticket_price_diamond" numeric(10, 2) DEFAULT '2997',
	"ad_spend" numeric(10, 2) DEFAULT '0',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "asset_templates" ADD CONSTRAINT "asset_templates_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "assets" ADD CONSTRAINT "assets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_calendar_connections" ADD CONSTRAINT "client_calendar_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "clients" ADD CONSTRAINT "clients_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "demo_credentials" ADD CONSTRAINT "demo_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_day_stats" ADD CONSTRAINT "event_day_stats_event_performance_id_event_performance_id_fk" FOREIGN KEY ("event_performance_id") REFERENCES "public"."event_performance"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_goals" ADD CONSTRAINT "event_goals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_performance" ADD CONSTRAINT "event_performance_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "events" ADD CONSTRAINT "events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invites" ADD CONSTRAINT "invites_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_id_users_id_fk" FOREIGN KEY ("used_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "meta_ad_campaigns" ADD CONSTRAINT "meta_ad_campaigns_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "neo_knowledge" ADD CONSTRAINT "neo_knowledge_training_resource_id_training_resources_id_fk" FOREIGN KEY ("training_resource_id") REFERENCES "public"."training_resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "neo_knowledge_chunks" ADD CONSTRAINT "neo_knowledge_chunks_knowledge_id_neo_knowledge_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."neo_knowledge"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projections" ADD CONSTRAINT "projections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales" ADD CONSTRAINT "sales_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_sources" ADD CONSTRAINT "sales_sources_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "training_videos" ADD CONSTRAINT "training_videos_module_id_training_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."training_modules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tuck_chats" ADD CONSTRAINT "tuck_chats_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tuck_messages" ADD CONSTRAINT "tuck_messages_chat_id_tuck_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."tuck_chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_video_progress" ADD CONSTRAINT "user_video_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_video_progress" ADD CONSTRAINT "user_video_progress_video_id_training_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."training_videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vault_assets" ADD CONSTRAINT "vault_assets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "webinar_goals" ADD CONSTRAINT "webinar_goals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "webinars" ADD CONSTRAINT "webinars_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_created" ON "activity_log" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_client" ON "activity_log" USING btree ("client_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_user" ON "activity_log" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_template_agency" ON "asset_templates" USING btree ("agency_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_template_type" ON "asset_templates" USING btree ("asset_type","event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calendar_client" ON "calendar_entries" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calendar_date" ON "calendar_entries" USING btree ("event_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_client_sync_key_idx" ON "calendar_entries" USING btree ("client_id","google_sync_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_stats_event" ON "event_day_stats" USING btree ("event_performance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_perf_client" ON "event_performance" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_perf_type" ON "event_performance" USING btree ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_perf_date" ON "event_performance" USING btree ("start_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_campaign_client_name_idx" ON "meta_ad_campaigns" USING btree ("client_id","campaign_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_neo_chunks_knowledge" ON "neo_knowledge_chunks" USING btree ("knowledge_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_neo_chunks_search" ON "neo_knowledge_chunks" USING gin ("search");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_neo_chunks_embedding" ON "neo_knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recipient_notification" ON "notification_recipients" USING btree ("notification_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recipient_user" ON "notification_recipients" USING btree ("recipient_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recipient_client" ON "notification_recipients" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_agency" ON "notifications" USING btree ("agency_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_created" ON "notifications" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_client_dedupe_idx" ON "sales" USING btree ("client_id","dedupe_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_sources_client_processor_idx" ON "sales_sources" USING btree ("client_id","processor");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" USING btree ("expire");
