import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, numeric, index, boolean, uniqueIndex, customType, vector } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table with RBAC fields
// Visible profiles: Admin (owner/agency_admin) and Client (agency_client).
// Legacy agency_employee rows are retained but disabled; no new employee accounts.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("agency_employee"), // default is fail-closed for uninvited users
  agencyId: integer("agency_id"),
  clientAccess: integer("client_access").array(), // assigned client for client accounts
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Legacy: demo passwords before user_credentials existed. Copied by script/migrate-credentials.ts; no longer read.
export const demoCredentials = pgTable("demo_credentials", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  passwordHash: text("password_hash").notNull(),
});

// Email + password login for every user. Only a scrypt "salt:hash" is stored, never the password.
export const userCredentials = pgTable("user_credentials", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AGENCIES
export const agencies = pgTable("agencies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  defaultLanguage: text("default_language").default("English (US)"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgencySchema = createInsertSchema(agencies).omit({ id: true, createdAt: true });
export const updateAgencySchema = createInsertSchema(agencies).omit({ id: true, createdAt: true }).partial();
export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type UpdateAgency = z.infer<typeof updateAgencySchema>;
export type Agency = typeof agencies.$inferSelect;

// CLIENTS
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull().references(() => agencies.id),
  name: text("name").notNull(),
  fullName: text("full_name"),
  email: text("email"),
  phone: text("phone"),
  businessAddress: text("business_address"),
  businessName: text("business_name"),
  niche: text("niche"),
  website: text("website"),
  primaryOffer: text("primary_offer"),
  brandVoiceTone: text("brand_voice_tone").array(),
  brandVoiceDos: text("brand_voice_dos"),
  brandVoiceDonts: text("brand_voice_donts"),
  bannedWords: text("banned_words"),
  styleGuide: text("style_guide"),
  headshot: text("headshot"),
  googleDriveAccessToken: text("google_drive_access_token"),
  googleDriveRefreshToken: text("google_drive_refresh_token"),
  googleDriveFolderId: text("google_drive_folder_id"),
  googleDriveEmail: text("google_drive_email"),
  metaAdsAccessToken: text("meta_ads_access_token"),
  metaAdsAccountId: text("meta_ads_account_id"),
  metaAdsAccountName: text("meta_ads_account_name"),
  metaAdsConnectedAt: timestamp("meta_ads_connected_at"),
  webhookToken: text("webhook_token").default(sql`gen_random_uuid()`),
  isActive: boolean("is_active").default(true).notNull(),
  onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClientSchema = createInsertSchema(clients).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true, 
  webhookToken: true,
  googleDriveAccessToken: true,
  googleDriveRefreshToken: true,
  googleDriveFolderId: true,
  googleDriveEmail: true,
  metaAdsAccessToken: true,
  metaAdsAccountId: true,
  metaAdsAccountName: true,
  metaAdsConnectedAt: true,
  isActive: true,
});
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// EVENTS
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // free_challenge, paid_challenge, summit, webinar
  startDate: timestamp("start_date"),
  timezone: text("timezone"),
  hook: text("hook"),
  
  // Offer ladder - legacy fields for backwards compatibility
  freeTierPrice: integer("free_tier_price").default(0),
  freeTierIncludes: text("free_tier_includes"),
  vipTierPrice: integer("vip_tier_price"),
  vipTierBonuses: text("vip_tier_bonuses"),
  backendOfferPrice: integer("backend_offer_price"),
  backendOfferName: text("backend_offer_name"),
  
  // New dynamic tier data - stores all tier pricing/descriptions as JSON
  tierData: jsonb("tier_data"), // { tierId: { price: string, description: string } }
  backendOfferDescription: text("backend_offer_description"),
  
  // Audience
  targetAudience: text("target_audience"),
  audiencePains: text("audience_pains"),
  audienceOutcomes: text("audience_outcomes"),
  bannedPhrases: text("banned_phrases"),
  
  // Tracking
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  
  // Selected assets for generation
  selectedAssets: text("selected_assets").array(),
  
  // Status
  status: text("status").default("draft"), // draft, generating, completed
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// ASSETS
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => events.id),
  assetType: text("asset_type").notNull(), // email_sequence, social_posts, slide_outline, agreement, marketing_plan, etc.
  title: text("title").notNull(),
  content: text("content").notNull(), // markdown
  status: text("status").default("draft"), // draft, in_review, approved
  version: integer("version").default(1),
  ownerRole: text("owner_role"), // PM, Copy, Design, etc.
  driveUrl: text("drive_url"),
  metadata: jsonb("metadata"), // for additional data like tracking links, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

// GENERATION JOBS (for tracking background generation tasks)
export const generationJobs = pgTable("generation_jobs", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => events.id),
  status: text("status").default("pending"), // pending, in_progress, completed, failed
  progress: integer("progress").default(0), // 0-100
  selectedAssetTypes: text("selected_asset_types").array(), // which assets to generate
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertGenerationJobSchema = createInsertSchema(generationJobs).omit({ id: true, createdAt: true, completedAt: true });
export type InsertGenerationJob = z.infer<typeof insertGenerationJobSchema>;
export type GenerationJob = typeof generationJobs.$inferSelect;

// VAULT ASSETS (for brand workspace upload vault)
export const vaultAssets = pgTable("vault_assets", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fileType: text("file_type").notNull(), // PDF, DOCX, TXT, etc.
  content: text("content"), // For text-based files, store the content
  url: text("url"), // For external URLs or file storage
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVaultAssetSchema = createInsertSchema(vaultAssets).omit({ id: true, createdAt: true });
export type InsertVaultAsset = z.infer<typeof insertVaultAssetSchema>;
export type VaultAsset = typeof vaultAssets.$inferSelect;

// SALES (for tracking sales data from HighLevel webhooks)
export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  saleDate: timestamp("sale_date").defaultNow().notNull(),
  productName: text("product_name"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  source: text("source").default("highlevel"),
  externalId: text("external_id"),
  status: text("status").default("paid").notNull(),
  currency: text("currency").default("USD").notNull(),
  reference: text("reference"),
  eventPerformanceId: integer("event_performance_id"),
  dedupeKey: text("dedupe_key"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("sales_client_dedupe_idx").on(table.clientId, table.dedupeKey)]);

export const insertSaleSchema = createInsertSchema(sales).omit({ id: true, createdAt: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof sales.$inferSelect;

// WEBINARS (for tracking webinar performance data)
export const webinars = pgTable("webinars", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  date: timestamp("date").notNull(),
  webinarType: text("webinar_type").default("live"), // "live" or "evergreen"
  totalRegistrants: integer("total_registrants").default(0),
  totalAttendees: integer("total_attendees").default(0),
  peopleAtPitch: integer("people_at_pitch").default(0),
  masterclassUpsells: integer("masterclass_upsells").default(0),
  masterclassDownsells: integer("masterclass_downsells").default(0),
  masterclassUpsellPrice: numeric("masterclass_upsell_price", { precision: 10, scale: 2 }).default("47"),
  masterclassDownsellPrice: numeric("masterclass_downsell_price", { precision: 10, scale: 2 }).default("27"),
  challengeTicketsGa: integer("challenge_tickets_ga").default(0),
  challengeTicketsVip: integer("challenge_tickets_vip").default(0),
  challengeTicketsPlatinum: integer("challenge_tickets_platinum").default(0),
  challengeTicketsDiamond: integer("challenge_tickets_diamond").default(0),
  ticketPriceGa: numeric("ticket_price_ga", { precision: 10, scale: 2 }).default("97"),
  ticketPriceVip: numeric("ticket_price_vip", { precision: 10, scale: 2 }).default("297"),
  ticketPricePlatinum: numeric("ticket_price_platinum", { precision: 10, scale: 2 }).default("997"),
  ticketPriceDiamond: numeric("ticket_price_diamond", { precision: 10, scale: 2 }).default("2997"),
  adSpend: numeric("ad_spend", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWebinarSchema = createInsertSchema(webinars).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWebinar = z.infer<typeof insertWebinarSchema>;
export type Webinar = typeof webinars.$inferSelect;

// INVITES (for inviting users with pre-assigned roles)
export const invites = pgTable("invites", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  email: text("email"),
  role: text("role").notNull(),
  agencyId: integer("agency_id").references(() => agencies.id),
  clientAccess: integer("client_access").array(),
  createdById: varchar("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  usedAt: timestamp("used_at"),
  usedById: varchar("used_by_id").references(() => users.id),
});

export const insertInviteSchema = createInsertSchema(invites).omit({ id: true, createdAt: true });
export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type Invite = typeof invites.$inferSelect;

// WEBINAR GOALS (for tracking targets vs actual performance)
export const webinarGoals = pgTable("webinar_goals", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").default("Monthly Goals"),
  periodType: text("period_type").default("monthly"), // "monthly", "quarterly", "yearly"
  targetRevenue: numeric("target_revenue", { precision: 12, scale: 2 }).default("0"),
  targetRegistrants: integer("target_registrants").default(0),
  targetAttendeeRate: numeric("target_attendee_rate", { precision: 5, scale: 2 }).default("40"), // percentage
  targetClosingRate: numeric("target_closing_rate", { precision: 5, scale: 2 }).default("5"), // percentage
  targetRoas: numeric("target_roas", { precision: 5, scale: 2 }).default("3"),
  targetWebinars: integer("target_webinars").default(4),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWebinarGoalSchema = createInsertSchema(webinarGoals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWebinarGoal = z.infer<typeof insertWebinarGoalSchema>;
export type WebinarGoal = typeof webinarGoals.$inferSelect;

// TRAINING MODULES (course categories)
export const trainingModules = pgTable("training_modules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // "Welcome Course", "Webinar Course", etc.
  description: text("description"),
  orderIndex: integer("order_index").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTrainingModuleSchema = createInsertSchema(trainingModules).omit({ id: true, createdAt: true });
export type InsertTrainingModule = z.infer<typeof insertTrainingModuleSchema>;
export type TrainingModule = typeof trainingModules.$inferSelect;

// TRAINING VIDEOS (individual videos within modules)
export const trainingVideos = pgTable("training_videos", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => trainingModules.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  vimeoUrl: text("vimeo_url").notNull(),
  durationMinutes: integer("duration_minutes"),
  orderIndex: integer("order_index").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTrainingVideoSchema = createInsertSchema(trainingVideos).omit({ id: true, createdAt: true });
export type InsertTrainingVideo = z.infer<typeof insertTrainingVideoSchema>;
export type TrainingVideo = typeof trainingVideos.$inferSelect;

// USER VIDEO PROGRESS (tracking completed videos per user)
export const userVideoProgress = pgTable("user_video_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  videoId: integer("video_id").notNull().references(() => trainingVideos.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

export const insertUserVideoProgressSchema = createInsertSchema(userVideoProgress).omit({ id: true, completedAt: true });
export type InsertUserVideoProgress = z.infer<typeof insertUserVideoProgressSchema>;
export type UserVideoProgress = typeof userVideoProgress.$inferSelect;

// NOTIFICATIONS (messages from agency to clients)
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  senderUserId: varchar("sender_user_id").references(() => users.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull().default("custom"), // mastermind_invite, asset_ready, account_update, custom
  metadata: jsonb("metadata"), // optional extra data (e.g., eventId, assetId for linking)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notifications_agency").on(table.agencyId),
  index("idx_notifications_created").on(table.createdAt),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// NOTIFICATION RECIPIENTS (tracks delivery per recipient)
export const notificationRecipients = pgTable("notification_recipients", {
  id: serial("id").primaryKey(),
  notificationId: integer("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
  recipientUserId: varchar("recipient_user_id").references(() => users.id, { onDelete: "cascade" }),
  recipientEmail: text("recipient_email"), // email address for delivery
  emailStatus: text("email_status").default("pending"), // pending, sent, failed
  emailSentAt: timestamp("email_sent_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_recipient_notification").on(table.notificationId),
  index("idx_recipient_user").on(table.recipientUserId),
  index("idx_recipient_client").on(table.clientId),
]);

export const insertNotificationRecipientSchema = createInsertSchema(notificationRecipients).omit({ id: true, createdAt: true });
export type InsertNotificationRecipient = z.infer<typeof insertNotificationRecipientSchema>;
export type NotificationRecipient = typeof notificationRecipients.$inferSelect;

// MARKETING CALENDAR ENTRIES (client marketing schedule)
export const calendarEntries = pgTable("calendar_entries", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  eventDate: timestamp("event_date").notNull(),
  endDate: timestamp("end_date"),
  timezone: text("timezone").notNull().default("America/New_York"),
  eventLink: text("event_link"),
  description: text("description"),
  attendeeEmails: text("attendee_emails").array().default([]),
  googleEventId: text("google_event_id"),
  googleCalendarId: text("google_calendar_id"),
  googleSyncKey: text("google_sync_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_calendar_client").on(table.clientId),
  index("idx_calendar_date").on(table.eventDate),
  uniqueIndex("calendar_client_sync_key_idx").on(table.clientId, table.googleSyncKey),
]);

export const insertCalendarEntrySchema = createInsertSchema(calendarEntries).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCalendarEntry = z.infer<typeof insertCalendarEntrySchema>;
export type CalendarEntry = typeof calendarEntries.$inferSelect;

// EVENT PERFORMANCE (unified tracking for webinars, challenges, summits)
export const eventPerformance = pgTable("event_performance", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  eventType: text("event_type").notNull(), // "webinar", "challenge", "summit"
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"), // for multi-day events
  numberOfDays: integer("number_of_days").default(1), // 1 for webinars, 5 for challenges, 2-3 for summits
  
  // Common metrics
  totalRegistrants: integer("total_registrants").default(0),
  totalAttendees: integer("total_attendees").default(0),
  peopleAtPitch: integer("people_at_pitch").default(0).notNull(), // still present when the offer was made
  adSpend: numeric("ad_spend", { precision: 10, scale: 2 }).default("0"),
  
  // Offer type - what are we selling?
  offerType: text("offer_type").default("tickets"), // "tickets", "membership", "course", "coaching"
  
  // Ticket/product sales (flexible tiers stored as JSON)
  salesData: jsonb("sales_data"), // { tier1: { name: "GA", price: 97, quantity: 10 }, tier2: {...} }
  
  // Upsells/downsells
  upsellData: jsonb("upsell_data"), // { upsell1: { name: "Masterclass", price: 47, quantity: 5 }, ... }
  
  // Calculated fields (stored for quick access)
  totalRevenue: numeric("total_revenue", { precision: 12, scale: 2 }).default("0"),
  profit: numeric("profit", { precision: 12, scale: 2 }).default("0"),
  roas: numeric("roas", { precision: 8, scale: 2 }).default("0"),
  
  notes: text("notes"),
  dataSource: text("data_source").default("manual").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_event_perf_client").on(table.clientId),
  index("idx_event_perf_type").on(table.eventType),
  index("idx_event_perf_date").on(table.startDate),
]);

export const insertEventPerformanceSchema = createInsertSchema(eventPerformance).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEventPerformance = z.infer<typeof insertEventPerformanceSchema>;
export type EventPerformance = typeof eventPerformance.$inferSelect;

// Client portal records. These tables are additive and intentionally do not
// replace the legacy training module/video records.
export const trainingResources = pgTable("training_resources", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  resourceType: text("resource_type").notNull(),
  url: text("url").notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  visibleClientIds: integer("visible_client_ids").array().default([]).notNull(),
  isGlobal: boolean("is_global").default(false).notNull(),
  seedKey: text("seed_key").unique(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const clientCalendarConnections = pgTable("client_calendar_connections", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().unique().references(() => clients.id, { onDelete: "cascade" }),
  calendarId: text("calendar_id").notNull(),
  lastSuccessfulSync: timestamp("last_successful_sync"),
  error: text("error"),
});
export const salesSources = pgTable("sales_sources", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  processor: text("processor").notNull(),
  configured: boolean("configured").default(false).notNull(),
  verified: boolean("verified").default(false).notNull(),
  lastSync: timestamp("last_sync"),
  error: text("error"),
}, (table) => [uniqueIndex("sales_sources_client_processor_idx").on(table.clientId, table.processor)]);
export const projections = pgTable("projections", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  adSpend: numeric("ad_spend", { precision: 12, scale: 2 }).notNull(),
  expectedRegistrations: integer("expected_registrations").notNull(),
  showUpRate: numeric("show_up_rate", { precision: 6, scale: 3 }).notNull(),
  conversionRate: numeric("conversion_rate", { precision: 6, scale: 3 }).notNull(),
  averageSaleValue: numeric("average_sale_value", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// EVENT DAY STATS (daily attendance for multi-day events)
export const eventDayStats = pgTable("event_day_stats", {
  id: serial("id").primaryKey(),
  eventPerformanceId: integer("event_performance_id").notNull().references(() => eventPerformance.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(), // 1, 2, 3, 4, 5
  dayDate: timestamp("day_date"),
  dayTitle: text("day_title"), // e.g., "Day 1: Mindset Reset"
  registrantsForDay: integer("registrants_for_day").default(0),
  attendeesForDay: integer("attendees_for_day").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_day_stats_event").on(table.eventPerformanceId),
]);

export const insertEventDayStatsSchema = createInsertSchema(eventDayStats).omit({ id: true, createdAt: true });
export type InsertEventDayStats = z.infer<typeof insertEventDayStatsSchema>;
export type EventDayStats = typeof eventDayStats.$inferSelect;

// EVENT GOALS (targets for event performance)
export const eventGoals = pgTable("event_goals", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  eventType: text("event_type"), // null = all types, or specific type
  name: text("name").default("Monthly Goals"),
  periodType: text("period_type").default("monthly"),
  targetRevenue: numeric("target_revenue", { precision: 12, scale: 2 }).default("0"),
  targetRegistrants: integer("target_registrants").default(0),
  targetAttendeeRate: numeric("target_attendee_rate", { precision: 5, scale: 2 }).default("40"),
  targetClosingRate: numeric("target_closing_rate", { precision: 5, scale: 2 }).default("5"),
  targetRoas: numeric("target_roas", { precision: 5, scale: 2 }).default("3"),
  targetEvents: integer("target_events").default(4),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEventGoalSchema = createInsertSchema(eventGoals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEventGoal = z.infer<typeof insertEventGoalSchema>;
export type EventGoal = typeof eventGoals.$inferSelect;

// TUCK AI CHATS (AI coaching sessions per client)
export const tuckChats = pgTable("tuck_chats", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Chat"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTuckChatSchema = createInsertSchema(tuckChats).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTuckChat = z.infer<typeof insertTuckChatSchema>;
export type TuckChat = typeof tuckChats.$inferSelect;

// TUCK MESSAGES (individual messages within a chat session)
export const tuckMessages = pgTable("tuck_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => tuckChats.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" or "assistant"
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTuckMessageSchema = createInsertSchema(tuckMessages).omit({ id: true, createdAt: true });
export type InsertTuckMessage = z.infer<typeof insertTuckMessageSchema>;
export type TuckMessage = typeof tuckMessages.$inferSelect;

// ASSET TEMPLATES (configurable prompts for AI generation)
export const assetTemplates = pgTable("asset_templates", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g., "Email Sequence (Challenge)"
  assetType: text("asset_type").notNull(), // email_sequence, social_posts, slide_outline, etc.
  eventType: text("event_type").notNull(), // free_challenge, paid_challenge, summit, webinar
  itemCount: integer("item_count").default(5), // how many items to generate
  systemPrompt: text("system_prompt").notNull(), // the AI prompt template
  includeInstructions: text("include_instructions"), // what to include in each item
  outputFormat: text("output_format"), // markdown, json, etc.
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_template_agency").on(table.agencyId),
  index("idx_template_type").on(table.assetType, table.eventType),
]);

export const insertAssetTemplateSchema = createInsertSchema(assetTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAssetTemplate = z.infer<typeof insertAssetTemplateSchema>;
export type AssetTemplate = typeof assetTemplates.$inferSelect;

// NEO KNOWLEDGE: the transcripts and documents Neo AI answers from. A row is either the
// transcript of one Training Lab lesson (trainingResourceId set; follows that lesson's
// visibility) or a standalone document such as Inner Circle material (shared with every client).
export const neoKnowledge = pgTable("neo_knowledge", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  collection: text("collection").notNull(), // training_lab, inner_circle, writing, youtube, instagram, other
  trainingResourceId: integer("training_resource_id").unique().references(() => trainingResources.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  source: text("source").notNull(), // pasted, file, vimeo, youtube, drive
  wordCount: integer("word_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type NeoKnowledge = typeof neoKnowledge.$inferSelect;

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
// Passages Neo searches; `search` is the full-text vector of the title (weighted) and passage.
export const neoKnowledgeChunks = pgTable("neo_knowledge_chunks", {
  id: serial("id").primaryKey(),
  knowledgeId: integer("knowledge_id").notNull().references(() => neoKnowledge.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  search: tsvector("search").notNull(),
  // Meaning of the passage (OpenAI text-embedding-3-small, 512 dimensions); null until indexed.
  embedding: vector("embedding", { dimensions: 512 }),
}, (table) => [
  index("idx_neo_chunks_knowledge").on(table.knowledgeId),
  index("idx_neo_chunks_search").using("gin", table.search),
  index("idx_neo_chunks_embedding").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);
