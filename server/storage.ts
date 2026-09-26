import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, desc, and, gte, lte, sql, inArray, isNull, or, ilike } from "drizzle-orm";
import {
  type User,
  type UpsertUser,
  type Client,
  type InsertClient,
  type Event,
  type InsertEvent,
  type Asset,
  type InsertAsset,
  type GenerationJob,
  type InsertGenerationJob,
  type VaultAsset,
  type InsertVaultAsset,
  type Sale,
  type InsertSale,
  type Webinar,
  type InsertWebinar,
  type Invite,
  type InsertInvite,
  type WebinarGoal,
  type InsertWebinarGoal,
  type TrainingModule,
  type InsertTrainingModule,
  type TrainingVideo,
  type InsertTrainingVideo,
  type UserVideoProgress,
  type InsertUserVideoProgress,
  type Notification,
  type InsertNotification,
  type NotificationRecipient,
  type InsertNotificationRecipient,
  type CalendarEntry,
  type InsertCalendarEntry,
  type AssetTemplate,
  type InsertAssetTemplate,
  type EventPerformance,
  type InsertEventPerformance,
  type EventDayStats,
  type InsertEventDayStats,
  type EventGoal,
  type InsertEventGoal,
  type TuckChat,
  type InsertTuckChat,
  type TuckMessage,
  type InsertTuckMessage,
  users,
  agencies,
  clients,
  events,
  assets,
  generationJobs,
  vaultAssets,
  sales,
  webinars,
  invites,
  webinarGoals,
  trainingModules,
  trainingVideos,
  userVideoProgress,
  notifications,
  notificationRecipients,
  calendarEntries,
  assetTemplates,
  eventPerformance,
  eventDayStats,
  eventGoals,
  tuckChats,
  tuckMessages,
} from "@shared/schema";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

export interface IStorage {
  // Users (for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  bootstrapOwnerIfFirst(user: UpsertUser): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string, agencyId?: number, clientAccess?: number[]): Promise<User | undefined>;

  // Agencies
  getAllAgencies(): Promise<any[]>;
  getAgency(id: number): Promise<any | undefined>;
  createAgency(data: { name: string; defaultLanguage?: string }): Promise<any>;
  getOrCreateOwnerWorkspace(userId: string): Promise<any>;
  updateAgency(id: number, data: { name?: string; defaultLanguage?: string }): Promise<any | undefined>;
  deleteAgency(id: number): Promise<boolean>;

  // Clients
  getAllClients(): Promise<Client[]>;
  getClients(agencyId: number): Promise<Client[]>;
  getClientsByIds(ids: number[]): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined>;
  updateClientActiveStatus(id: number, isActive: boolean): Promise<Client | undefined>;
  deleteClient(id: number): Promise<boolean>;

  // Events
  getAllEvents(): Promise<Event[]>;
  getEvents(clientId: number): Promise<Event[]>;
  getEvent(id: number): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, event: Partial<InsertEvent>): Promise<Event | undefined>;

  // Assets
  getAssets(eventId: number): Promise<Asset[]>;
  getAssetsByClientId(clientId: number): Promise<(Asset & { eventName: string; clientName: string })[]>;
  getAsset(id: number): Promise<Asset | undefined>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: number, asset: Partial<InsertAsset>): Promise<Asset | undefined>;

  // Generation Jobs
  getGenerationJob(id: number): Promise<GenerationJob | undefined>;
  createGenerationJob(job: InsertGenerationJob): Promise<GenerationJob>;
  updateGenerationJob(id: number, job: Partial<InsertGenerationJob>): Promise<GenerationJob | undefined>;

  // Vault Assets
  getVaultAssets(clientId: number): Promise<VaultAsset[]>;
  getVaultAsset(id: number): Promise<VaultAsset | undefined>;
  createVaultAsset(asset: InsertVaultAsset): Promise<VaultAsset>;
  deleteVaultAsset(id: number): Promise<boolean>;

  // Sales
  getSales(clientId: number, startDate?: Date, endDate?: Date): Promise<Sale[]>;
  getSalesPaginated(clientId: number, options: { page: number; limit: number; search?: string; source?: string; startDate?: Date; endDate?: Date }): Promise<{ sales: Sale[]; total: number; page: number; totalPages: number }>;
  createSale(sale: InsertSale): Promise<Sale>;
  getClientByWebhookToken(token: string): Promise<Client | undefined>;
  regenerateWebhookToken(clientId: number): Promise<string | undefined>;

  // Invites
  createInvite(invite: InsertInvite): Promise<Invite>;
  getInviteByToken(token: string): Promise<Invite | undefined>;
  getInviteByEmail(email: string): Promise<Invite | undefined>;
  getInvitesByAgency(agencyId: number): Promise<Invite[]>;
  getAllInvites(): Promise<Invite[]>;
  markInviteUsed(token: string, userId: string): Promise<Invite | undefined>;
  deleteInvite(id: number): Promise<boolean>;

  // Meta Ads
  updateClientMetaAds(
    clientId: number,
    data: {
      accessToken?: string | null;
      accountId?: string | null;
      accountName?: string | null;
      connectedAt?: Date | null;
    }
  ): Promise<Client | undefined>;
  clearClientMetaAds(clientId: number): Promise<Client | undefined>;

  // Google Drive
  updateClientGoogleDrive(
    clientId: number,
    data: {
      accessToken?: string | null;
      refreshToken?: string | null;
      folderId?: string | null;
      email?: string | null;
    }
  ): Promise<Client | undefined>;
  clearClientGoogleDrive(clientId: number): Promise<Client | undefined>;

  // Webinars
  getWebinars(clientId: number): Promise<Webinar[]>;
  getWebinar(id: number): Promise<Webinar | undefined>;
  createWebinar(webinar: InsertWebinar): Promise<Webinar>;
  updateWebinar(id: number, webinar: Partial<InsertWebinar>): Promise<Webinar | undefined>;
  deleteWebinar(id: number): Promise<boolean>;

  // Webinar Goals
  getWebinarGoals(clientId: number): Promise<WebinarGoal | undefined>;
  createWebinarGoals(goals: InsertWebinarGoal): Promise<WebinarGoal>;
  updateWebinarGoals(clientId: number, goals: Partial<InsertWebinarGoal>): Promise<WebinarGoal | undefined>;

  // Training Modules
  getAllTrainingModules(): Promise<TrainingModule[]>;
  getTrainingModule(id: number): Promise<TrainingModule | undefined>;
  createTrainingModule(module: InsertTrainingModule): Promise<TrainingModule>;
  updateTrainingModule(id: number, module: Partial<InsertTrainingModule>): Promise<TrainingModule | undefined>;
  deleteTrainingModule(id: number): Promise<boolean>;

  // Training Videos
  getVideosByModule(moduleId: number): Promise<TrainingVideo[]>;
  getAllVideos(): Promise<TrainingVideo[]>;
  getTrainingVideo(id: number): Promise<TrainingVideo | undefined>;
  createTrainingVideo(video: InsertTrainingVideo): Promise<TrainingVideo>;
  updateTrainingVideo(id: number, video: Partial<InsertTrainingVideo>): Promise<TrainingVideo | undefined>;
  deleteTrainingVideo(id: number): Promise<boolean>;

  // User Video Progress
  getUserProgress(userId: string): Promise<UserVideoProgress[]>;
  markVideoComplete(userId: string, videoId: number): Promise<UserVideoProgress>;
  markVideoIncomplete(userId: string, videoId: number): Promise<boolean>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByAgency(agencyId: number): Promise<Notification[]>;
  getNotification(id: number): Promise<Notification | undefined>;
  
  // Notification Recipients
  createNotificationRecipient(recipient: InsertNotificationRecipient): Promise<NotificationRecipient>;
  createNotificationRecipients(recipients: InsertNotificationRecipient[]): Promise<NotificationRecipient[]>;
  getNotificationsForUser(userId: string): Promise<(NotificationRecipient & { notification: Notification })[]>;
  getNotificationsForClient(clientId: number): Promise<(NotificationRecipient & { notification: Notification })[]>;
  getNotificationsForClients(clientIds: number[]): Promise<(NotificationRecipient & { notification: Notification })[]>;
  markNotificationRead(recipientId: number): Promise<NotificationRecipient | undefined>;
  updateRecipientEmailStatus(recipientId: number, status: string, sentAt?: Date): Promise<NotificationRecipient | undefined>;
  getUnreadCount(userId: string): Promise<number>;
  getUnreadCountForClients(clientIds: number[]): Promise<number>;

  // Calendar Entries
  getCalendarEntries(clientId: number): Promise<CalendarEntry[]>;
  getCalendarEntry(id: number): Promise<CalendarEntry | undefined>;
  createCalendarEntry(entry: InsertCalendarEntry): Promise<CalendarEntry>;
  updateCalendarEntry(id: number, entry: Partial<InsertCalendarEntry>): Promise<CalendarEntry | undefined>;
  deleteCalendarEntry(id: number): Promise<boolean>;

  // Asset Templates
  getAllAssetTemplates(): Promise<AssetTemplate[]>;
  getAssetTemplates(agencyId: number): Promise<AssetTemplate[]>;
  getAssetTemplate(id: number): Promise<AssetTemplate | undefined>;
  getAllAssetTemplatesByType(eventType: string, assetType?: string): Promise<AssetTemplate[]>;
  getAssetTemplatesByType(agencyId: number, eventType: string, assetType?: string): Promise<AssetTemplate[]>;
  createAssetTemplate(template: InsertAssetTemplate): Promise<AssetTemplate>;
  updateAssetTemplate(id: number, template: Partial<InsertAssetTemplate>): Promise<AssetTemplate | undefined>;
  deleteAssetTemplate(id: number): Promise<boolean>;

  // Event Performance
  getEventPerformances(clientId: number): Promise<EventPerformance[]>;
  getEventPerformance(id: number): Promise<EventPerformance | undefined>;
  createEventPerformance(event: InsertEventPerformance): Promise<EventPerformance>;
  updateEventPerformance(id: number, event: Partial<InsertEventPerformance>): Promise<EventPerformance | undefined>;
  deleteEventPerformance(id: number): Promise<boolean>;

  // Event Day Stats
  getEventDayStats(eventPerformanceId: number): Promise<EventDayStats[]>;
  createEventDayStats(stats: InsertEventDayStats): Promise<EventDayStats>;
  updateEventDayStats(id: number, stats: Partial<InsertEventDayStats>): Promise<EventDayStats | undefined>;
  deleteEventDayStats(id: number): Promise<boolean>;
  upsertEventDayStats(eventPerformanceId: number, dayStats: InsertEventDayStats[]): Promise<EventDayStats[]>;

  // Event Goals
  getEventGoals(clientId: number, eventType?: string): Promise<EventGoal | undefined>;
  createEventGoals(goals: InsertEventGoal): Promise<EventGoal>;
  updateEventGoals(clientId: number, eventType: string | null, goals: Partial<InsertEventGoal>): Promise<EventGoal | undefined>;

  // Tuck AI Chats
  getTuckChats(clientId: number): Promise<TuckChat[]>;
  getTuckChat(id: number): Promise<TuckChat | undefined>;
  createTuckChat(chat: InsertTuckChat): Promise<TuckChat>;
  updateTuckChatTitle(id: number, title: string): Promise<TuckChat | undefined>;
  deleteTuckChat(id: number): Promise<boolean>;
  getTuckMessages(chatId: number): Promise<TuckMessage[]>;
  createTuckMessage(message: InsertTuckMessage): Promise<TuckMessage>;
}

export class DatabaseStorage implements IStorage {
  // Users (for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async bootstrapOwnerIfFirst(userData: UpsertUser): Promise<User | undefined> {
    return await db.transaction(async (tx) => {
      // Serialize first-run claims so concurrent sign-ins cannot create multiple owners.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(824617)`);
      const existingUsers = await tx.select({ id: users.id }).from(users).limit(1);
      if (existingUsers.length > 0) return undefined;

      const [owner] = await tx
        .insert(users)
        .values({ ...userData, role: "owner" })
        .returning();
      return owner;
    });
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRole(id: string, role: string, agencyId?: number, clientAccess?: number[]): Promise<User | undefined> {
    const result = await db
      .update(users)
      .set({ role, agencyId, clientAccess, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  // Agencies
  async getAllAgencies(): Promise<any[]> {
    return await db.select().from(agencies).orderBy(desc(agencies.createdAt));
  }

  async getAgency(id: number): Promise<any | undefined> {
    const result = await db.select().from(agencies).where(eq(agencies.id, id)).limit(1);
    return result[0];
  }

  async createAgency(data: { name: string; defaultLanguage?: string }): Promise<any> {
    const result = await db.insert(agencies).values({
      name: data.name,
      defaultLanguage: data.defaultLanguage || "English (US)",
    }).returning();
    return result[0];
  }

  async getOrCreateOwnerWorkspace(userId: string): Promise<any> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(824618)`);

      const [owner] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!owner || owner.role !== "owner") {
        throw new Error("Only the workspace owner can initialize a client workspace");
      }

      if (owner.agencyId !== null) {
        const [existingWorkspace] = await tx
          .select()
          .from(agencies)
          .where(eq(agencies.id, owner.agencyId))
          .limit(1);
        if (existingWorkspace) return existingWorkspace;
      }

      const [workspace] = await tx
        .insert(agencies)
        .values({ name: "My Workspace", defaultLanguage: "English (US)" })
        .returning();

      await tx
        .update(users)
        .set({ agencyId: workspace.id, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return workspace;
    });
  }

  async deleteAgency(id: number): Promise<boolean> {
    const result = await db.delete(agencies).where(eq(agencies.id, id)).returning();
    return result.length > 0;
  }

  async updateAgency(id: number, data: { name?: string; defaultLanguage?: string }): Promise<any | undefined> {
    const result = await db
      .update(agencies)
      .set(data)
      .where(eq(agencies.id, id))
      .returning();
    return result[0];
  }

  // Clients
  async getAllClients(): Promise<Client[]> {
    return await db.select().from(clients).orderBy(desc(clients.createdAt));
  }

  async getClients(agencyId: number): Promise<Client[]> {
    return await db.select().from(clients).where(eq(clients.agencyId, agencyId)).orderBy(desc(clients.createdAt));
  }

  async getClientsByIds(ids: number[]): Promise<Client[]> {
    if (ids.length === 0) return [];
    return await db.select().from(clients).where(inArray(clients.id, ids)).orderBy(desc(clients.createdAt));
  }

  async getClient(id: number): Promise<Client | undefined> {
    const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    return result[0];
  }

  async createClient(client: InsertClient): Promise<Client> {
    const result = await db.insert(clients).values(client).returning();
    return result[0];
  }

  async updateClient(id: number, clientData: Partial<InsertClient>): Promise<Client | undefined> {
    const result = await db
      .update(clients)
      .set({ ...clientData, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return result[0];
  }

  async updateClientActiveStatus(id: number, isActive: boolean): Promise<Client | undefined> {
    const result = await db
      .update(clients)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return result[0];
  }

  async deleteClient(id: number): Promise<boolean> {
    const result = await db.delete(clients).where(eq(clients.id, id)).returning();
    return result.length > 0;
  }

  // Events
  async getAllEvents(): Promise<Event[]> {
    return await db.select().from(events).orderBy(desc(events.createdAt));
  }

  async getEvents(clientId: number): Promise<Event[]> {
    return await db.select().from(events).where(eq(events.clientId, clientId)).orderBy(desc(events.createdAt));
  }

  async getEvent(id: number): Promise<Event | undefined> {
    const result = await db.select().from(events).where(eq(events.id, id)).limit(1);
    return result[0];
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const result = await db.insert(events).values(event).returning();
    return result[0];
  }

  async updateEvent(id: number, eventData: Partial<InsertEvent>): Promise<Event | undefined> {
    const result = await db
      .update(events)
      .set({ ...eventData, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return result[0];
  }

  // Assets
  async getAssets(eventId: number): Promise<Asset[]> {
    return await db.select().from(assets).where(eq(assets.eventId, eventId)).orderBy(desc(assets.createdAt));
  }

  async getAssetsByClientId(clientId: number): Promise<(Asset & { eventName: string; clientName: string })[]> {
    const result = await db
      .select({
        id: assets.id,
        eventId: assets.eventId,
        assetType: assets.assetType,
        title: assets.title,
        content: assets.content,
        status: assets.status,
        version: assets.version,
        ownerRole: assets.ownerRole,
        driveUrl: assets.driveUrl,
        metadata: assets.metadata,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        eventName: events.name,
        clientName: clients.name,
      })
      .from(assets)
      .innerJoin(events, eq(assets.eventId, events.id))
      .innerJoin(clients, eq(events.clientId, clients.id))
      .where(eq(events.clientId, clientId))
      .orderBy(desc(assets.createdAt));
    return result;
  }

  async getAsset(id: number): Promise<Asset | undefined> {
    const result = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
    return result[0];
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    const result = await db.insert(assets).values(asset).returning();
    return result[0];
  }

  async updateAsset(id: number, assetData: Partial<InsertAsset>): Promise<Asset | undefined> {
    const result = await db
      .update(assets)
      .set({ ...assetData, updatedAt: new Date() })
      .where(eq(assets.id, id))
      .returning();
    return result[0];
  }

  // Generation Jobs
  async getGenerationJob(id: number): Promise<GenerationJob | undefined> {
    const result = await db.select().from(generationJobs).where(eq(generationJobs.id, id)).limit(1);
    return result[0];
  }

  async createGenerationJob(job: InsertGenerationJob): Promise<GenerationJob> {
    const result = await db.insert(generationJobs).values(job).returning();
    return result[0];
  }

  async updateGenerationJob(id: number, jobData: Partial<InsertGenerationJob>): Promise<GenerationJob | undefined> {
    const result = await db
      .update(generationJobs)
      .set(jobData)
      .where(eq(generationJobs.id, id))
      .returning();
    return result[0];
  }

  // Vault Assets
  async getVaultAssets(clientId: number): Promise<VaultAsset[]> {
    return await db.select().from(vaultAssets).where(eq(vaultAssets.clientId, clientId)).orderBy(desc(vaultAssets.createdAt));
  }

  async getVaultAsset(id: number): Promise<VaultAsset | undefined> {
    const result = await db.select().from(vaultAssets).where(eq(vaultAssets.id, id)).limit(1);
    return result[0];
  }

  async createVaultAsset(asset: InsertVaultAsset): Promise<VaultAsset> {
    const result = await db.insert(vaultAssets).values(asset).returning();
    return result[0];
  }

  async deleteVaultAsset(id: number): Promise<boolean> {
    const result = await db.delete(vaultAssets).where(eq(vaultAssets.id, id)).returning();
    return result.length > 0;
  }

  // Sales
  async getSales(clientId: number, startDate?: Date, endDate?: Date): Promise<Sale[]> {
    const conditions = [eq(sales.clientId, clientId)];
    if (startDate) {
      conditions.push(gte(sales.saleDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(sales.saleDate, endDate));
    }
    return await db.select().from(sales).where(and(...conditions)).orderBy(desc(sales.saleDate));
  }

  async getSalesPaginated(clientId: number, options: { page: number; limit: number; search?: string; source?: string; startDate?: Date; endDate?: Date }): Promise<{ sales: Sale[]; total: number; page: number; totalPages: number }> {
    const { page, limit, search, source, startDate, endDate } = options;
    const offset = (page - 1) * limit;
    
    const conditions = [eq(sales.clientId, clientId)];
    if (startDate) {
      conditions.push(gte(sales.saleDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(sales.saleDate, endDate));
    }
    if (source) conditions.push(eq(sales.source, source));
    if (search) {
      conditions.push(
        or(
          ilike(sales.customerName, `%${search}%`),
          ilike(sales.customerEmail, `%${search}%`),
          ilike(sales.productName, `%${search}%`),
          ilike(sales.reference, `%${search}%`)
        ) as any
      );
    }
    
    const [salesData, countResult] = await Promise.all([
      db.select().from(sales).where(and(...conditions)).orderBy(desc(sales.saleDate)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(sales).where(and(...conditions))
    ]);
    
    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);
    
    return { sales: salesData, total, page, totalPages };
  }

  async createSale(sale: InsertSale): Promise<Sale> {
    const result = await db.insert(sales).values(sale).returning();
    return result[0];
  }

  async getClientByWebhookToken(token: string): Promise<Client | undefined> {
    const result = await db.select().from(clients).where(eq(clients.webhookToken, token)).limit(1);
    return result[0];
  }

  async regenerateWebhookToken(clientId: number): Promise<string | undefined> {
    const result = await db
      .update(clients)
      .set({ webhookToken: sql`gen_random_uuid()`, updatedAt: new Date() })
      .where(eq(clients.id, clientId))
      .returning();
    return result[0]?.webhookToken ?? undefined;
  }

  // Invites
  async createInvite(invite: InsertInvite): Promise<Invite> {
    const result = await db.insert(invites).values(invite).returning();
    return result[0];
  }

  async getInviteByToken(token: string): Promise<Invite | undefined> {
    const result = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
    return result[0];
  }

  async getInviteByEmail(email: string): Promise<Invite | undefined> {
    const result = await db.select().from(invites)
      .where(and(eq(invites.email, email), isNull(invites.usedAt)))
      .orderBy(desc(invites.createdAt))
      .limit(1);
    return result[0];
  }

  async getInvitesByAgency(agencyId: number): Promise<Invite[]> {
    return await db.select().from(invites).where(eq(invites.agencyId, agencyId)).orderBy(desc(invites.createdAt));
  }

  async getAllInvites(): Promise<Invite[]> {
    return await db.select().from(invites).orderBy(desc(invites.createdAt));
  }

  async markInviteUsed(token: string, userId: string): Promise<Invite | undefined> {
    const result = await db
      .update(invites)
      .set({ usedAt: new Date(), usedById: userId })
      .where(eq(invites.token, token))
      .returning();
    return result[0];
  }

  async deleteInvite(id: number): Promise<boolean> {
    const result = await db.delete(invites).where(eq(invites.id, id)).returning();
    return result.length > 0;
  }

  // Google Drive
  async updateClientGoogleDrive(
    clientId: number,
    data: {
      accessToken?: string | null;
      refreshToken?: string | null;
      folderId?: string | null;
      email?: string | null;
    }
  ): Promise<Client | undefined> {
    const result = await db
      .update(clients)
      .set({
        googleDriveAccessToken: data.accessToken,
        googleDriveRefreshToken: data.refreshToken,
        googleDriveFolderId: data.folderId,
        googleDriveEmail: data.email,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId))
      .returning();
    return result[0];
  }

  async clearClientGoogleDrive(clientId: number): Promise<Client | undefined> {
    const result = await db
      .update(clients)
      .set({
        googleDriveAccessToken: null,
        googleDriveRefreshToken: null,
        googleDriveFolderId: null,
        googleDriveEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId))
      .returning();
    return result[0];
  }

  // Webinars
  async getWebinars(clientId: number): Promise<Webinar[]> {
    return await db.select().from(webinars).where(eq(webinars.clientId, clientId)).orderBy(desc(webinars.date));
  }

  async getWebinar(id: number): Promise<Webinar | undefined> {
    const result = await db.select().from(webinars).where(eq(webinars.id, id)).limit(1);
    return result[0];
  }

  async createWebinar(webinar: InsertWebinar): Promise<Webinar> {
    const result = await db.insert(webinars).values(webinar).returning();
    return result[0];
  }

  async updateWebinar(id: number, webinarData: Partial<InsertWebinar>): Promise<Webinar | undefined> {
    const result = await db
      .update(webinars)
      .set({ ...webinarData, updatedAt: new Date() })
      .where(eq(webinars.id, id))
      .returning();
    return result[0];
  }

  async deleteWebinar(id: number): Promise<boolean> {
    const result = await db.delete(webinars).where(eq(webinars.id, id)).returning();
    return result.length > 0;
  }

  // Webinar Goals
  async getWebinarGoals(clientId: number): Promise<WebinarGoal | undefined> {
    const result = await db.select().from(webinarGoals)
      .where(and(eq(webinarGoals.clientId, clientId), eq(webinarGoals.isActive, true)))
      .limit(1);
    return result[0];
  }

  async createWebinarGoals(goals: InsertWebinarGoal): Promise<WebinarGoal> {
    const result = await db.insert(webinarGoals).values(goals).returning();
    return result[0];
  }

  async updateWebinarGoals(clientId: number, goalsData: Partial<InsertWebinarGoal>): Promise<WebinarGoal | undefined> {
    const result = await db
      .update(webinarGoals)
      .set({ ...goalsData, updatedAt: new Date() })
      .where(and(eq(webinarGoals.clientId, clientId), eq(webinarGoals.isActive, true)))
      .returning();
    return result[0];
  }

  // Training Modules
  async getAllTrainingModules(): Promise<TrainingModule[]> {
    return await db.select().from(trainingModules).orderBy(trainingModules.orderIndex);
  }

  async getTrainingModule(id: number): Promise<TrainingModule | undefined> {
    const result = await db.select().from(trainingModules).where(eq(trainingModules.id, id)).limit(1);
    return result[0];
  }

  async createTrainingModule(module: InsertTrainingModule): Promise<TrainingModule> {
    const result = await db.insert(trainingModules).values(module).returning();
    return result[0];
  }

  async updateTrainingModule(id: number, moduleData: Partial<InsertTrainingModule>): Promise<TrainingModule | undefined> {
    const result = await db
      .update(trainingModules)
      .set(moduleData)
      .where(eq(trainingModules.id, id))
      .returning();
    return result[0];
  }

  async deleteTrainingModule(id: number): Promise<boolean> {
    const result = await db.delete(trainingModules).where(eq(trainingModules.id, id)).returning();
    return result.length > 0;
  }

  // Training Videos
  async getVideosByModule(moduleId: number): Promise<TrainingVideo[]> {
    return await db.select().from(trainingVideos)
      .where(eq(trainingVideos.moduleId, moduleId))
      .orderBy(trainingVideos.orderIndex);
  }

  async getAllVideos(): Promise<TrainingVideo[]> {
    return await db.select().from(trainingVideos).orderBy(trainingVideos.moduleId, trainingVideos.orderIndex);
  }

  async getTrainingVideo(id: number): Promise<TrainingVideo | undefined> {
    const result = await db.select().from(trainingVideos).where(eq(trainingVideos.id, id)).limit(1);
    return result[0];
  }

  async createTrainingVideo(video: InsertTrainingVideo): Promise<TrainingVideo> {
    const result = await db.insert(trainingVideos).values(video).returning();
    return result[0];
  }

  async updateTrainingVideo(id: number, videoData: Partial<InsertTrainingVideo>): Promise<TrainingVideo | undefined> {
    const result = await db
      .update(trainingVideos)
      .set(videoData)
      .where(eq(trainingVideos.id, id))
      .returning();
    return result[0];
  }

  async deleteTrainingVideo(id: number): Promise<boolean> {
    const result = await db.delete(trainingVideos).where(eq(trainingVideos.id, id)).returning();
    return result.length > 0;
  }

  // User Video Progress
  async getUserProgress(userId: string): Promise<UserVideoProgress[]> {
    return await db.select().from(userVideoProgress).where(eq(userVideoProgress.userId, userId));
  }

  async markVideoComplete(userId: string, videoId: number): Promise<UserVideoProgress> {
    const existing = await db.select().from(userVideoProgress)
      .where(and(eq(userVideoProgress.userId, userId), eq(userVideoProgress.videoId, videoId)))
      .limit(1);
    
    if (existing[0]) {
      return existing[0];
    }
    
    const result = await db.insert(userVideoProgress).values({ userId, videoId }).returning();
    return result[0];
  }

  async markVideoIncomplete(userId: string, videoId: number): Promise<boolean> {
    const result = await db.delete(userVideoProgress)
      .where(and(eq(userVideoProgress.userId, userId), eq(userVideoProgress.videoId, videoId)))
      .returning();
    return result.length > 0;
  }

  // Notifications
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values(notification).returning();
    return result[0];
  }

  async getNotificationsByAgency(agencyId: number): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.agencyId, agencyId))
      .orderBy(desc(notifications.createdAt));
  }

  async getNotification(id: number): Promise<Notification | undefined> {
    const result = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    return result[0];
  }

  // Notification Recipients
  async createNotificationRecipient(recipient: InsertNotificationRecipient): Promise<NotificationRecipient> {
    const result = await db.insert(notificationRecipients).values(recipient).returning();
    return result[0];
  }

  async createNotificationRecipients(recipientList: InsertNotificationRecipient[]): Promise<NotificationRecipient[]> {
    if (recipientList.length === 0) return [];
    const result = await db.insert(notificationRecipients).values(recipientList).returning();
    return result;
  }

  async getNotificationsForUser(userId: string): Promise<(NotificationRecipient & { notification: Notification })[]> {
    const results = await db
      .select({
        id: notificationRecipients.id,
        notificationId: notificationRecipients.notificationId,
        clientId: notificationRecipients.clientId,
        recipientUserId: notificationRecipients.recipientUserId,
        recipientEmail: notificationRecipients.recipientEmail,
        emailStatus: notificationRecipients.emailStatus,
        emailSentAt: notificationRecipients.emailSentAt,
        readAt: notificationRecipients.readAt,
        createdAt: notificationRecipients.createdAt,
        notification: {
          id: notifications.id,
          agencyId: notifications.agencyId,
          senderUserId: notifications.senderUserId,
          subject: notifications.subject,
          body: notifications.body,
          category: notifications.category,
          metadata: notifications.metadata,
          createdAt: notifications.createdAt,
        },
      })
      .from(notificationRecipients)
      .innerJoin(notifications, eq(notificationRecipients.notificationId, notifications.id))
      .where(eq(notificationRecipients.recipientUserId, userId))
      .orderBy(desc(notifications.createdAt));
    return results as (NotificationRecipient & { notification: Notification })[];
  }

  async getNotificationsForClient(clientId: number): Promise<(NotificationRecipient & { notification: Notification })[]> {
    const results = await db
      .select({
        id: notificationRecipients.id,
        notificationId: notificationRecipients.notificationId,
        clientId: notificationRecipients.clientId,
        recipientUserId: notificationRecipients.recipientUserId,
        recipientEmail: notificationRecipients.recipientEmail,
        emailStatus: notificationRecipients.emailStatus,
        emailSentAt: notificationRecipients.emailSentAt,
        readAt: notificationRecipients.readAt,
        createdAt: notificationRecipients.createdAt,
        notification: {
          id: notifications.id,
          agencyId: notifications.agencyId,
          senderUserId: notifications.senderUserId,
          subject: notifications.subject,
          body: notifications.body,
          category: notifications.category,
          metadata: notifications.metadata,
          createdAt: notifications.createdAt,
        },
      })
      .from(notificationRecipients)
      .innerJoin(notifications, eq(notificationRecipients.notificationId, notifications.id))
      .where(eq(notificationRecipients.clientId, clientId))
      .orderBy(desc(notifications.createdAt));
    return results as (NotificationRecipient & { notification: Notification })[];
  }

  async markNotificationRead(recipientId: number): Promise<NotificationRecipient | undefined> {
    const result = await db
      .update(notificationRecipients)
      .set({ readAt: new Date() })
      .where(eq(notificationRecipients.id, recipientId))
      .returning();
    return result[0];
  }

  async updateRecipientEmailStatus(recipientId: number, status: string, sentAt?: Date): Promise<NotificationRecipient | undefined> {
    const result = await db
      .update(notificationRecipients)
      .set({ emailStatus: status, emailSentAt: sentAt })
      .where(eq(notificationRecipients.id, recipientId))
      .returning();
    return result[0];
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationRecipients)
      .where(and(
        eq(notificationRecipients.recipientUserId, userId),
        sql`${notificationRecipients.readAt} IS NULL`
      ));
    return result[0]?.count ?? 0;
  }

  async getNotificationsForClients(clientIds: number[]): Promise<(NotificationRecipient & { notification: Notification })[]> {
    if (clientIds.length === 0) return [];
    const results = await db
      .select({
        id: notificationRecipients.id,
        notificationId: notificationRecipients.notificationId,
        clientId: notificationRecipients.clientId,
        recipientUserId: notificationRecipients.recipientUserId,
        recipientEmail: notificationRecipients.recipientEmail,
        emailStatus: notificationRecipients.emailStatus,
        emailSentAt: notificationRecipients.emailSentAt,
        readAt: notificationRecipients.readAt,
        createdAt: notificationRecipients.createdAt,
        notification: {
          id: notifications.id,
          agencyId: notifications.agencyId,
          senderUserId: notifications.senderUserId,
          subject: notifications.subject,
          body: notifications.body,
          category: notifications.category,
          metadata: notifications.metadata,
          createdAt: notifications.createdAt,
        },
      })
      .from(notificationRecipients)
      .innerJoin(notifications, eq(notificationRecipients.notificationId, notifications.id))
      .where(inArray(notificationRecipients.clientId, clientIds))
      .orderBy(desc(notifications.createdAt));
    return results as (NotificationRecipient & { notification: Notification })[];
  }

  async getUnreadCountForClients(clientIds: number[]): Promise<number> {
    if (clientIds.length === 0) return 0;
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationRecipients)
      .where(and(
        inArray(notificationRecipients.clientId, clientIds),
        sql`${notificationRecipients.readAt} IS NULL`
      ));
    return result[0]?.count ?? 0;
  }

  // Calendar Entries
  async getCalendarEntries(clientId: number): Promise<CalendarEntry[]> {
    return await db
      .select()
      .from(calendarEntries)
      .where(eq(calendarEntries.clientId, clientId))
      .orderBy(calendarEntries.eventDate);
  }

  async getCalendarEntry(id: number): Promise<CalendarEntry | undefined> {
    const result = await db
      .select()
      .from(calendarEntries)
      .where(eq(calendarEntries.id, id))
      .limit(1);
    return result[0];
  }

  async createCalendarEntry(entry: InsertCalendarEntry): Promise<CalendarEntry> {
    const [created] = await db.insert(calendarEntries).values(entry).returning();
    return created;
  }

  async updateCalendarEntry(id: number, entry: Partial<InsertCalendarEntry>): Promise<CalendarEntry | undefined> {
    const result = await db
      .update(calendarEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(calendarEntries.id, id))
      .returning();
    return result[0];
  }

  async deleteCalendarEntry(id: number): Promise<boolean> {
    const result = await db
      .delete(calendarEntries)
      .where(eq(calendarEntries.id, id))
      .returning();
    return result.length > 0;
  }

  // Asset Templates
  async getAllAssetTemplates(): Promise<AssetTemplate[]> {
    return await db
      .select()
      .from(assetTemplates)
      .orderBy(assetTemplates.name);
  }

  async getAssetTemplates(agencyId: number): Promise<AssetTemplate[]> {
    return await db
      .select()
      .from(assetTemplates)
      .where(eq(assetTemplates.agencyId, agencyId))
      .orderBy(assetTemplates.name);
  }

  async getAssetTemplate(id: number): Promise<AssetTemplate | undefined> {
    const result = await db
      .select()
      .from(assetTemplates)
      .where(eq(assetTemplates.id, id))
      .limit(1);
    return result[0];
  }

  async getAllAssetTemplatesByType(eventType: string, assetType?: string): Promise<AssetTemplate[]> {
    const conditions = [
      eq(assetTemplates.eventType, eventType),
      eq(assetTemplates.isActive, true),
    ];
    if (assetType) {
      conditions.push(eq(assetTemplates.assetType, assetType));
    }
    return await db
      .select()
      .from(assetTemplates)
      .where(and(...conditions))
      .orderBy(assetTemplates.name);
  }

  async getAssetTemplatesByType(agencyId: number, eventType: string, assetType?: string): Promise<AssetTemplate[]> {
    const conditions = [
      eq(assetTemplates.agencyId, agencyId),
      eq(assetTemplates.eventType, eventType),
      eq(assetTemplates.isActive, true),
    ];
    if (assetType) {
      conditions.push(eq(assetTemplates.assetType, assetType));
    }
    return await db
      .select()
      .from(assetTemplates)
      .where(and(...conditions))
      .orderBy(assetTemplates.name);
  }

  async createAssetTemplate(template: InsertAssetTemplate): Promise<AssetTemplate> {
    const [created] = await db.insert(assetTemplates).values(template).returning();
    return created;
  }

  async updateAssetTemplate(id: number, template: Partial<InsertAssetTemplate>): Promise<AssetTemplate | undefined> {
    const result = await db
      .update(assetTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(assetTemplates.id, id))
      .returning();
    return result[0];
  }

  async deleteAssetTemplate(id: number): Promise<boolean> {
    const result = await db
      .delete(assetTemplates)
      .where(eq(assetTemplates.id, id))
      .returning();
    return result.length > 0;
  }

  // Event Performance
  async getEventPerformances(clientId: number): Promise<EventPerformance[]> {
    return await db
      .select()
      .from(eventPerformance)
      .where(eq(eventPerformance.clientId, clientId))
      .orderBy(desc(eventPerformance.startDate));
  }

  async getEventPerformance(id: number): Promise<EventPerformance | undefined> {
    const result = await db
      .select()
      .from(eventPerformance)
      .where(eq(eventPerformance.id, id))
      .limit(1);
    return result[0];
  }

  async createEventPerformance(event: InsertEventPerformance): Promise<EventPerformance> {
    const [created] = await db.insert(eventPerformance).values(event).returning();
    return created;
  }

  async updateEventPerformance(id: number, event: Partial<InsertEventPerformance>): Promise<EventPerformance | undefined> {
    const result = await db
      .update(eventPerformance)
      .set({ ...event, updatedAt: new Date() })
      .where(eq(eventPerformance.id, id))
      .returning();
    return result[0];
  }

  async deleteEventPerformance(id: number): Promise<boolean> {
    const result = await db
      .delete(eventPerformance)
      .where(eq(eventPerformance.id, id))
      .returning();
    return result.length > 0;
  }

  // Event Day Stats
  async getEventDayStats(eventPerformanceId: number): Promise<EventDayStats[]> {
    return await db
      .select()
      .from(eventDayStats)
      .where(eq(eventDayStats.eventPerformanceId, eventPerformanceId))
      .orderBy(eventDayStats.dayNumber);
  }

  async createEventDayStats(stats: InsertEventDayStats): Promise<EventDayStats> {
    const [created] = await db.insert(eventDayStats).values(stats).returning();
    return created;
  }

  async updateEventDayStats(id: number, stats: Partial<InsertEventDayStats>): Promise<EventDayStats | undefined> {
    const result = await db
      .update(eventDayStats)
      .set(stats)
      .where(eq(eventDayStats.id, id))
      .returning();
    return result[0];
  }

  async deleteEventDayStats(id: number): Promise<boolean> {
    const result = await db
      .delete(eventDayStats)
      .where(eq(eventDayStats.id, id))
      .returning();
    return result.length > 0;
  }

  async upsertEventDayStats(eventPerformanceId: number, dayStatsArray: InsertEventDayStats[]): Promise<EventDayStats[]> {
    // Delete existing day stats for this event
    await db.delete(eventDayStats).where(eq(eventDayStats.eventPerformanceId, eventPerformanceId));
    
    // Insert new day stats
    if (dayStatsArray.length === 0) return [];
    const created = await db.insert(eventDayStats).values(dayStatsArray).returning();
    return created;
  }

  // Event Goals
  async getEventGoals(clientId: number, eventType?: string): Promise<EventGoal | undefined> {
    const conditions = [eq(eventGoals.clientId, clientId), eq(eventGoals.isActive, true)];
    if (eventType) {
      conditions.push(eq(eventGoals.eventType, eventType));
    }
    const result = await db
      .select()
      .from(eventGoals)
      .where(and(...conditions))
      .limit(1);
    return result[0];
  }

  async createEventGoals(goals: InsertEventGoal): Promise<EventGoal> {
    const [created] = await db.insert(eventGoals).values(goals).returning();
    return created;
  }

  async updateEventGoals(clientId: number, eventType: string | null, goals: Partial<InsertEventGoal>): Promise<EventGoal | undefined> {
    const conditions = [eq(eventGoals.clientId, clientId)];
    if (eventType) {
      conditions.push(eq(eventGoals.eventType, eventType));
    }
    
    // Check if goals exist, if not create them
    const existing = await db
      .select()
      .from(eventGoals)
      .where(and(...conditions))
      .limit(1);
    
    if (existing.length === 0) {
      const [created] = await db
        .insert(eventGoals)
        .values({ clientId, eventType, ...goals })
        .returning();
      return created;
    }
    
    const result = await db
      .update(eventGoals)
      .set({ ...goals, updatedAt: new Date() })
      .where(and(...conditions))
      .returning();
    return result[0];
  }

  // Tuck AI Chats
  async getTuckChats(clientId: number): Promise<TuckChat[]> {
    return await db.select().from(tuckChats).where(eq(tuckChats.clientId, clientId)).orderBy(desc(tuckChats.updatedAt));
  }

  async getTuckChat(id: number): Promise<TuckChat | undefined> {
    const result = await db.select().from(tuckChats).where(eq(tuckChats.id, id)).limit(1);
    return result[0];
  }

  async createTuckChat(chat: InsertTuckChat): Promise<TuckChat> {
    const [created] = await db.insert(tuckChats).values(chat).returning();
    return created;
  }

  async updateTuckChatTitle(id: number, title: string): Promise<TuckChat | undefined> {
    const [updated] = await db
      .update(tuckChats)
      .set({ title, updatedAt: new Date() })
      .where(eq(tuckChats.id, id))
      .returning();
    return updated;
  }

  async deleteTuckChat(id: number): Promise<boolean> {
    await db.delete(tuckChats).where(eq(tuckChats.id, id));
    return true;
  }

  async getTuckMessages(chatId: number): Promise<TuckMessage[]> {
    return await db.select().from(tuckMessages).where(eq(tuckMessages.chatId, chatId)).orderBy(tuckMessages.createdAt);
  }

  async createTuckMessage(message: InsertTuckMessage): Promise<TuckMessage> {
    const [created] = await db.insert(tuckMessages).values(message).returning();
    return created;
  }

  // Meta Ads
  async updateClientMetaAds(
    clientId: number,
    data: {
      accessToken?: string | null;
      accountId?: string | null;
      accountName?: string | null;
      connectedAt?: Date | null;
    }
  ): Promise<Client | undefined> {
    const result = await db
      .update(clients)
      .set({
        metaAdsAccessToken: data.accessToken,
        metaAdsAccountId: data.accountId,
        metaAdsAccountName: data.accountName,
        metaAdsConnectedAt: data.connectedAt,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId))
      .returning();
    return result[0];
  }

  async clearClientMetaAds(clientId: number): Promise<Client | undefined> {
    const result = await db
      .update(clients)
      .set({
        metaAdsAccessToken: null,
        metaAdsAccountId: null,
        metaAdsAccountName: null,
        metaAdsConnectedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId))
      .returning();
    return result[0];
  }
}

export const storage = new DatabaseStorage();
