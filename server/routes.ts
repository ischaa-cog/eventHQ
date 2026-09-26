import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { storage, db } from "./storage";
import { insertClientSchema, insertEventSchema, insertAssetSchema, insertVaultAssetSchema, insertWebinarSchema, insertNotificationSchema, insertCalendarEntrySchema, sales as salesTable, salesSources, clientCalendarConnections, invites, notificationRecipients, type User, type Invite } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import OpenAI from "openai";
import { z } from "zod";
import { setupAuth, isAuthenticated, enforceDemoReadOnly } from "./replitAuth";
import sharp from "sharp";
import { runAssetGeneration, runTemplateBasedGeneration, getAvailableTemplatesForEvent } from "./ai-generation";
import { getAuthorizationUrl, exchangeCodeForTokens, ensureClientFolder } from "./google-drive";
import { sendNotificationEmail, sendInviteEmail } from "./email";
import { createGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from "./googleCalendar";
import { registerPortalRoutes } from "./portal-routes";
import { netSaleContribution } from "./sales-math";

function getInviteBaseUrl(): string {
  const configured = process.env.PUBLIC_APP_URL;
  const url = configured || (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  if (!url || !/^https:\/\/[^/]+\/?$/.test(url)) {
    throw new Error("Set PUBLIC_APP_URL to the public HTTPS address before sending invitations.");
  }
  return url.replace(/\/$/, "");
}

// Helper to check if user can access a specific client
async function canAccessClient(user: User | undefined, clientId: number): Promise<boolean> {
  if (!user) return false;
  
  // Owner can access all clients
  if (user.role === "owner") return true;
  
  // Agency admin can access clients in their agency
  if (user.role === "agency_admin" && user.agencyId) {
    const client = await storage.getClient(clientId);
    return client?.agencyId === user.agencyId;
  }
  
  // Clients can only access their assigned workspace.
  if (user.role === "agency_client" && user.clientAccess?.length) {
    return user.clientAccess.includes(clientId);
  }
  
  return false;
}

// Helper to get user from request
async function getRequestUser(req: any): Promise<User | undefined> {
  const userId = req.user?.claims?.sub;
  if (!userId) return undefined;
  return await storage.getUser(userId);
}

// Helper to get effective agencyId for any user (including agency_client users)
// NOTE: Owners return null - they should be handled explicitly at the route level
// to bypass agency filtering (owners manage all agencies)
async function getEffectiveAgencyId(user: User | undefined): Promise<number | null> {
  if (!user) return null;
  
  // Owners don't have a single agency - they manage all agencies
  // Routes should check for owner role explicitly before calling this helper
  if (user.role === "owner") return null;
  
  // If user has direct agencyId, use it
  if (user.agencyId) return user.agencyId;
  
  // For agency_client users, look up agency from their clientAccess
  if (user.role === "agency_client" && user.clientAccess?.length) {
    const client = await storage.getClient(user.clientAccess[0]);
    if (client) return client.agencyId;
  }
  
  return null;
}

// Helper to send forbidden response
function forbidden(res: Response) {
  return res.status(403).json({ error: "Forbidden" });
}
function isAdminUser(user: User | undefined) {
  return user?.role === "owner" || user?.role === "agency_admin";
}
function isAgencyStaff(user: User | undefined) {
  return isAdminUser(user);
}
const performanceProductSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(200).default(""),
  price: z.coerce.number().finite().nonnegative(),
  quantity: z.coerce.number().int().nonnegative(),
});

const onboardingInputSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(100),
  businessName: z.string().trim().min(1).max(200),
  businessAddress: z.string().trim().max(500),
  website: z.union([z.literal(""), z.string().trim().url().max(500)]),
  niche: z.string().trim().max(200),
  primaryOffer: z.string().trim().min(1).max(2000),
  brandVoiceDos: z.string().trim().max(2000),
  brandVoiceDonts: z.string().trim().max(2000),
});

const performanceInputSchema = z.object({
  title: z.string().trim().min(1).max(250),
  eventType: z.enum(["webinar", "challenge", "summit"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  numberOfDays: z.coerce.number().int().min(1).max(31).optional(),
  totalRegistrants: z.coerce.number().int().nonnegative().optional(),
  totalAttendees: z.coerce.number().int().nonnegative().optional(),
  adSpend: z.coerce.number().finite().nonnegative().optional(),
  offerType: z.string().max(100).optional(),
  salesData: z.array(performanceProductSchema).max(100).optional(),
  upsellData: z.array(performanceProductSchema).max(100).optional(),
  notes: z.string().max(20000).nullable().optional(),
});

const MAX_IMAGE_DATA_URL_LENGTH = 9 * 1024 * 1024;
const MAX_DECODED_IMAGE_BYTES = 6 * 1024 * 1024;
const supportedImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/avif",
]);
const performanceDaySchema = z.array(z.object({
  dayNumber: z.coerce.number().int().min(1).max(31),
  dayDate: z.coerce.date().nullable().optional(),
  dayTitle: z.string().max(250).nullable().optional(),
  registrantsForDay: z.coerce.number().int().nonnegative().optional(),
  attendeesForDay: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().max(20000).nullable().optional(),
})).max(31);

function performanceTotals(data: { adSpend?: number | string | null; salesData?: unknown; upsellData?: unknown }) {
  const items = (value: unknown): any[] => Array.isArray(value)
    ? value : value && typeof value === "object" ? Object.values(value) : [];
  const products = [...items(data.salesData), ...items(data.upsellData)];
  const revenue = products.reduce((sum: number, item: any) => sum + Number(item.price) * Number(item.quantity), 0);
  const spend = Number(data.adSpend ?? 0);
  return {
    totalRevenue: revenue.toFixed(2),
    profit: (revenue - spend).toFixed(2),
    roas: spend > 0 ? (revenue / spend).toFixed(2) : "0",
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  app.use("/api", enforceDemoReadOnly);
  registerApiRoutes(app);
  return httpServer;
}

// Kept separate so API behavior can be exercised with isolated test authentication.
export function registerApiRoutes(app: Express): void {
  // Agency clients use the client portal only. Keep this allowlist explicit so
  // hidden setup, profile, asset-management, and staff APIs cannot be reached by
  // calling them directly. Each client-scoped handler still enforces assignment.
  const clientPortalActions: Array<{ method: string; path: RegExp }> = [
    { method: "GET", path: /^\/api\/auth\/user\/?$/ },
    { method: "GET", path: /^\/api\/clients\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+(?:\/headshot)?\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/events\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/sales\/(?:paginated|stats)\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/webinars\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/webinar-goals\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/event-performance\/?$/ },
    { method: "GET", path: /^\/api\/event-performance\/\d+\/?$/ },
    { method: "GET", path: /^\/api\/notifications(?:\/unread-count)?\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/notifications(?:\/unread-count)?\/?$/ },
    { method: "POST", path: /^\/api\/notifications\/\d+\/read\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/calendar\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/tuck\/chats\/?$/ },
    { method: "POST", path: /^\/api\/clients\/\d+\/tuck\/chats\/?$/ },
    { method: "DELETE", path: /^\/api\/clients\/\d+\/tuck\/chats\/\d+\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/tuck\/chats\/\d+\/messages\/?$/ },
    { method: "POST", path: /^\/api\/clients\/\d+\/tuck\/chats\/\d+\/messages\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/meta-ads\/(?:status|insights)\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/training\/resources\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/calendar\/connection\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/sales\/sources\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/portal-summary\/?$/ },
    { method: "GET", path: /^\/api\/clients\/\d+\/projections\/?$/ },
    { method: "POST", path: /^\/api\/clients\/\d+\/projections\/?$/ },
    { method: "PATCH", path: /^\/api\/projections\/\d+\/?$/ },
    { method: "DELETE", path: /^\/api\/projections\/\d+\/?$/ },
  ];
  app.use(async (req: any, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    const user = await getRequestUser(req);
    if (user?.role === "agency_employee") {
      return res.status(403).json({ error: "This account is disabled. Contact an administrator." });
    }
    if (user?.role !== "agency_client" && !req.user?.demoLogin) return next();
    const path = (req.originalUrl || req.path).split("?")[0];
    if (clientPortalActions.some(action => action.method === req.method && action.path.test(path))) {
      return next();
    }
    return forbidden(res);
  });

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Image conversion endpoint - converts any image format to JPEG
  app.post("/api/convert-image", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!isAgencyStaff(user)) {
        return res.status(403).json({ error: "You are not authorized to convert images" });
      }

      const { imageData } = req.body;
      if (!imageData || typeof imageData !== "string") {
        return res.status(400).json({ error: "A base64 imageData value is required" });
      }
      if (imageData.length > MAX_IMAGE_DATA_URL_LENGTH) {
        return res.status(413).json({ error: "Image payload is too large (maximum encoded size is 9 MiB)" });
      }
      
      const matches = imageData.match(/^data:([^;]+);base64,([A-Za-z0-9+/]*={0,2})$/);
      if (!matches) {
        return res.status(400).json({ error: "Image must be a valid base64 data URL" });
      }

      const mimeType = matches[1].toLowerCase();
      if (!supportedImageMimeTypes.has(mimeType)) {
        return res.status(400).json({ error: "Unsupported image type. Use JPEG, PNG, WebP, GIF, TIFF, or AVIF." });
      }
      
      const base64Data = matches[2];
      const padding = base64Data.endsWith("==") ? 2 : base64Data.endsWith("=") ? 1 : 0;
      const decodedSize = (base64Data.length / 4) * 3 - padding;
      if (decodedSize > MAX_DECODED_IMAGE_BYTES) {
        return res.status(413).json({ error: "Image is too large (maximum decoded size is 6 MiB)" });
      }
      if (!base64Data || base64Data.length % 4 !== 0 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
        return res.status(400).json({ error: "Image data contains invalid base64 encoding" });
      }

      const buffer = Buffer.from(base64Data, "base64");
      
      let jpegBuffer: Buffer;
      try {
        jpegBuffer = await sharp(buffer, { limitInputPixels: 40_000_000 })
          .jpeg({ quality: 90 })
          .toBuffer();
      } catch {
        return res.status(400).json({ error: "The uploaded data is not a valid supported image" });
      }
      
      const jpegBase64 = `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
      res.json({ imageData: jpegBase64 });
    } catch (error) {
      console.error("Image conversion error:", error);
      res.status(500).json({ error: "Failed to convert image" });
    }
  });

  // User management routes (owner only)
  app.get("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      if (currentUser?.role !== "owner") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/users/:id/role", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      if (currentUser?.role !== "owner") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { role, agencyId, clientAccess } = req.body;
      if (role !== "agency_admin" && role !== "agency_client") {
        return res.status(400).json({ error: "Choose Admin or Client." });
      }
      const target = await storage.getUser(req.params.id);
      if (!target) return res.status(404).json({ error: "User not found" });
      if (target.role === "owner" && role === "agency_client") {
        return res.status(400).json({ error: "The primary admin cannot be changed to a client." });
      }
      const effectiveRole = target.role === "owner" ? "owner" : role;
      if (effectiveRole !== "owner" && (!Number.isSafeInteger(agencyId) || agencyId <= 0 || !await storage.getAgency(agencyId))) {
        return res.status(400).json({ error: "A valid agency is required." });
      }
      if (role === "agency_client") {
        if (!Array.isArray(clientAccess) || clientAccess.length !== 1 ||
            !Number.isSafeInteger(clientAccess[0]) ||
            (await storage.getClient(clientAccess[0]))?.agencyId !== agencyId) {
          return res.status(400).json({ error: "Assign exactly one client in the selected agency." });
        }
      }
      const user = await storage.updateUserRole(req.params.id, effectiveRole,
        effectiveRole === "owner" ? target.agencyId ?? undefined : agencyId,
        role === "agency_client" ? clientAccess : undefined);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error: any) {
      console.error("Error updating user role:", error);
      res.status(400).json({ error: error.message || "Failed to update user role" });
    }
  });

  // INVITES (for inviting users with pre-assigned roles)
  app.post("/api/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== "owner" && currentUser.role !== "agency_admin")) {
        return res.status(403).json({ error: "Only owners and agency admins can create invites" });
      }
      
      const { email, role, agencyId, clientAccess, expiresAt } = req.body;
      
      if (role !== "agency_admin" && role !== "agency_client") {
        return res.status(400).json({ error: "Choose Admin or Client." });
      }
      
      // Determine the agency ID for the invite
      let inviteAgencyId: number | undefined;
      if (currentUser.role === "agency_admin") {
        // Agency admins can only invite to their own agency
        inviteAgencyId = currentUser.agencyId ?? undefined;
      } else {
        // Owners can specify any agency
        inviteAgencyId = agencyId;
      }
      
      if (!inviteAgencyId || !await storage.getAgency(inviteAgencyId)) {
        return res.status(400).json({ error: "A valid agency is required." });
      }
      if (role === "agency_client" && (!Array.isArray(clientAccess) || clientAccess.length !== 1)) {
        return res.status(400).json({ error: "Assign exactly one client workspace." });
      }
      if (clientAccess != null) {
        if (!Array.isArray(clientAccess) || clientAccess.some(id => !Number.isSafeInteger(id) || id <= 0)) {
          return res.status(400).json({ error: "Invalid client access list" });
        }
        for (const id of clientAccess) {
          const assignedClient = await storage.getClient(id);
          if (!assignedClient || (inviteAgencyId && assignedClient.agencyId !== inviteAgencyId)) {
            return res.status(400).json({ error: "Client access must belong to the invited agency" });
          }
        }
      }
      
      const token = crypto.randomUUID();
      const invite = await storage.createInvite({
        token,
        email: email || null,
        role,
        agencyId: inviteAgencyId,
        clientAccess: clientAccess || null,
        createdById: userId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        usedAt: null,
        usedById: null,
      });
      
      res.status(201).json(invite);
    } catch (error: any) {
      console.error("Error creating invite:", error);
      res.status(400).json({ error: error.message || "Failed to create invite" });
    }
  });

  app.get("/api/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== "owner" && currentUser.role !== "agency_admin")) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      let invites: Invite[] = [];
      if (currentUser.role === "owner") {
        invites = await storage.getAllInvites();
      } else if (currentUser.agencyId) {
        invites = await storage.getInvitesByAgency(currentUser.agencyId);
      }
      
      res.json(invites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ error: "Failed to fetch invites" });
    }
  });

  app.get("/api/invites/validate/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const invite = await storage.getInviteByToken(token);
      
      if (!invite) {
        return res.status(404).json({ valid: false, error: "Invite not found" });
      }
      
      if (invite.usedAt) {
        return res.status(400).json({ valid: false, error: "Invite already used" });
      }
      
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ valid: false, error: "Invite expired" });
      }
      if (invite.role !== "agency_admin" && invite.role !== "agency_client") {
        return res.status(400).json({ valid: false, error: "This legacy invitation is disabled." });
      }
      
      res.json({ valid: true, invite: { role: invite.role, agencyId: invite.agencyId, email: invite.email } });
    } catch (error) {
      console.error("Error validating invite:", error);
      res.status(500).json({ valid: false, error: "Failed to validate invite" });
    }
  });

  // Resend an existing invitation without creating another client or token.
  app.post("/api/invites/:id/send", isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await getRequestUser(req);
      if (!isAdminUser(currentUser)) return forbidden(res);
      const inviteId = Number(req.params.id);
      if (!Number.isSafeInteger(inviteId) || inviteId <= 0) {
        return res.status(400).json({ error: "Invalid invite ID" });
      }
      const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId)).limit(1);
      if (!invite) return res.status(404).json({ error: "Invite not found" });
      if (currentUser!.role !== "owner" && invite.agencyId !== currentUser!.agencyId) return forbidden(res);
      if (!invite.email || invite.usedAt || (invite.expiresAt && invite.expiresAt < new Date())) {
        return res.status(400).json({ error: "This invitation is used, expired, or has no email address." });
      }
      if (invite.role !== "agency_client" || !invite.agencyId || invite.clientAccess?.length !== 1) {
        return res.status(400).json({ error: "Only client workspace invitations can be emailed here." });
      }
      const client = await storage.getClient(invite.clientAccess[0]);
      if (!client || client.agencyId !== invite.agencyId) {
        return res.status(400).json({ error: "The assigned client workspace is unavailable." });
      }
      const agency = await storage.getAgency(invite.agencyId);
      const result = await sendInviteEmail({
        to: invite.email,
        inviteToken: invite.token,
        agencyName: agency?.name || "EventHQ",
        clientName: client.name,
        baseUrl: getInviteBaseUrl(),
      });
      if (!result.success) return res.status(502).json({ error: result.error });
      res.json({ sent: true });
    } catch (error: any) {
      console.error("Error sending existing invite:", error.message);
      res.status(500).json({ error: "Failed to send invitation email" });
    }
  });

  app.delete("/api/invites/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== "owner" && currentUser.role !== "agency_admin")) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const inviteId = Number(req.params.id);
      if (!Number.isSafeInteger(inviteId) || inviteId <= 0) {
        return res.status(400).json({ error: "Invalid invite ID" });
      }
      const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId)).limit(1);
      if (!invite) return res.status(404).json({ error: "Invite not found" });
      if (currentUser.role !== "owner" && (!currentUser.agencyId || invite.agencyId !== currentUser.agencyId)) {
        return forbidden(res);
      }
      const deleted = await storage.deleteInvite(inviteId);
      if (!deleted) {
        return res.status(404).json({ error: "Invite not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting invite:", error);
      res.status(500).json({ error: error.message || "Failed to delete invite" });
    }
  });

  // AGENCIES (for user management)
  app.get("/api/agencies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      if (currentUser?.role !== "owner") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const agencies = await storage.getAllAgencies();
      res.json(agencies);
    } catch (error) {
      console.error("Error fetching agencies:", error);
      res.status(500).json({ error: "Failed to fetch agencies" });
    }
  });

  app.get("/api/agencies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      const agencyId = parseInt(req.params.id);
      
      // Only owners or agency_admins of this agency can access
      if (!currentUser || (currentUser.role !== "owner" && 
          !(currentUser.role === "agency_admin" && currentUser.agencyId === agencyId))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const agency = await storage.getAgency(agencyId);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.json(agency);
    } catch (error) {
      console.error("Error fetching agency:", error);
      res.status(500).json({ error: "Failed to fetch agency" });
    }
  });

  app.patch("/api/agencies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      const agencyId = parseInt(req.params.id);
      
      if (!currentUser || (currentUser.role !== "owner" && 
          !(currentUser.role === "agency_admin" && currentUser.agencyId === agencyId))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const { name, defaultLanguage } = req.body;
      const agency = await storage.updateAgency(agencyId, { name, defaultLanguage });
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.json(agency);
    } catch (error) {
      console.error("Error updating agency:", error);
      res.status(500).json({ error: "Failed to update agency" });
    }
  });

  // Create new agency (owner only)
  app.post("/api/agencies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.role !== "owner") {
        return res.status(403).json({ error: "Forbidden - only owner can create agencies" });
      }
      
      const { name, defaultLanguage } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Agency name is required" });
      }
      
      const agency = await storage.createAgency({ 
        name: name.trim(), 
        defaultLanguage: defaultLanguage || "English (US)" 
      });
      res.status(201).json(agency);
    } catch (error) {
      console.error("Error creating agency:", error);
      res.status(500).json({ error: "Failed to create agency" });
    }
  });

  // Delete agency (owner only)
  app.delete("/api/agencies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (currentUser?.role !== "owner") {
        return res.status(403).json({ error: "Forbidden - only owner can delete agencies" });
      }
      
      const agencyId = parseInt(req.params.id);
      const deleted = await storage.deleteAgency(agencyId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Agency not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting agency:", error);
      res.status(500).json({ error: "Failed to delete agency" });
    }
  });

  // Public client records must never contain provider credentials or webhook secrets.
  function publicClient(client: Awaited<ReturnType<typeof storage.getClient>>, includeHeadshot = false) {
    if (!client) return null;
    const {
      googleDriveAccessToken, googleDriveRefreshToken, metaAdsAccessToken,
      webhookToken, ...safe
    } = client;
    return { ...safe, headshot: includeHeadshot ? client.headshot : null };
  }

  function stripHeadshotFromClients(clients: Awaited<ReturnType<typeof storage.getAllClients>>) {
    return clients.map(client => publicClient(client));
  }

  // CLIENTS - Now with auth filtering
  app.get("/api/clients", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Owner sees all clients from all agencies
      if (user?.role === "owner") {
        const allClients = await storage.getAllClients();
        return res.json(stripHeadshotFromClients(allClients));
      }
      
      // Agency admin sees their agency's clients
      if (user?.role === "agency_admin" && user.agencyId) {
        const clients = await storage.getClients(user.agencyId);
        return res.json(stripHeadshotFromClients(clients));
      }
      
      // Clients see only their assigned workspace.
      if (user?.role === "agency_client" && user.clientAccess?.length) {
        const clients = await storage.getClientsByIds(user.clientAccess);
        return res.json(stripHeadshotFromClients(clients));
      }
      
      res.json([]);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  app.get("/api/clients/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.id);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      // Check if headshot is explicitly requested via query param
      const includeHeadshot = req.query.includeHeadshot === 'true';
      res.json(publicClient(client, includeHeadshot));
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ error: "Failed to fetch client" });
    }
  });

  // Dedicated endpoint for fetching client headshot
  app.get("/api/clients/:id/headshot", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.id);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.json({ headshot: client.headshot });
    } catch (error) {
      console.error("Error fetching client headshot:", error);
      res.status(500).json({ error: "Failed to fetch headshot" });
    }
  });

  app.post("/api/clients", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      // Owners create clients in their private workspace; admins use their assigned agency.
      if (!user || (user.role !== "owner" && user.role !== "agency_admin")) {
        return forbidden(res);
      }
      const agencyId = user.role === "owner"
        ? (await storage.getOrCreateOwnerWorkspace(user.id)).id
        : user.agencyId;
      if (!agencyId) return forbidden(res);
      
      const { sendInvite, ...clientData } = req.body;
      const validatedData = insertClientSchema.parse({ ...clientData, agencyId });
      const client = await storage.createClient(validatedData);
      
      let inviteSent = false;
      let inviteError: string | undefined;
      
      // If sendInvite is true and client has an email, create and send invite
      if (sendInvite && client.email) {
        try {
          const token = randomUUID();
          const userId = req.user.claims.sub;
          
          // Create the invite
          await storage.createInvite({
            token,
            email: client.email,
            role: "agency_client",
            agencyId,
            clientAccess: [client.id],
            createdById: userId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            usedAt: null,
            usedById: null,
          });
          
          // Get agency name for the email
          const agency = await storage.getAgency(agencyId);
          const agencyName = agency?.name || "EventHQ";
          
          // Send invite email
          const emailResult = await sendInviteEmail({
            to: client.email,
            inviteToken: token,
            agencyName,
            clientName: client.name,
            baseUrl: getInviteBaseUrl(),
          });
          
          if (emailResult.success) {
            inviteSent = true;
          } else {
            inviteError = emailResult.error;
          }
        } catch (invErr: any) {
          console.error("Error creating/sending invite:", invErr);
          inviteError = invErr.message;
        }
      }
      
      res.status(201).json({
        ...publicClient(client),
        sendInvite: !!sendInvite,
        inviteSent, 
        inviteError 
      });
    } catch (error: any) {
      console.error("Error creating client:", error);
      res.status(400).json({ error: error.message || "Failed to create client" });
    }
  });

  app.patch("/api/clients/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.id);
      if (!isAgencyStaff(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const editable = [
        "fullName", "email", "phone", "businessAddress", "businessName",
        "niche", "website", "primaryOffer", "brandVoiceTone",
        "brandVoiceDos", "brandVoiceDonts", "bannedWords", "styleGuide",
        "headshot", "onboardingComplete",
        ...(user?.role === "owner" || user?.role === "agency_admin" ? ["name"] : []),
      ];
      const requested = Object.keys(req.body || {});
      if (!requested.length || requested.some(key => !editable.includes(key))) {
        return res.status(400).json({ error: "Unsupported client field" });
      }
      const client = await storage.updateClient(clientId, Object.fromEntries(
        requested.map(key => [key, req.body[key]])
      ));
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.json(publicClient(client));
    } catch (error: any) {
      console.error("Error updating client:", error);
      res.status(400).json({ error: error.message || "Failed to update client" });
    }
  });

  app.post("/api/clients/:id/onboarding", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = Number(req.params.id);
      if (!Number.isSafeInteger(clientId) || clientId <= 0) {
        return res.status(400).json({ error: "Invalid client ID" });
      }
      if (!isAgencyStaff(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const answers = onboardingInputSchema.parse(req.body);
      const client = await storage.updateClient(clientId, {
        ...answers,
        onboardingComplete: true,
      });
      if (!client) return res.status(404).json({ error: "Client not found" });
      res.json(publicClient(client));
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Please check the required fields and website URL." });
      }
      console.error("Error saving onboarding:", error);
      res.status(500).json({ error: "Unable to save onboarding right now" });
    }
  });

  app.patch("/api/clients/:id/active-status", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.id);
      
      if (!user || (user.role !== "owner" && user.role !== "agency_admin")) {
        return forbidden(res);
      }
      
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ error: "isActive must be a boolean" });
      }
      
      const client = await storage.updateClientActiveStatus(clientId, isActive);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.json(publicClient(client));
    } catch (error: any) {
      console.error("Error updating client active status:", error);
      res.status(400).json({ error: error.message || "Failed to update client active status" });
    }
  });

  app.delete("/api/clients/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.id);
      // Only owner and agency_admin can delete clients
      if (!user || (user.role !== "owner" && user.role !== "agency_admin")) {
        return forbidden(res);
      }
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const deleted = await storage.deleteClient(clientId);
      if (!deleted) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting client:", error);
      res.status(500).json({ error: error.message || "Failed to delete client" });
    }
  });

  // EVENTS
  app.get("/api/events", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!user) return forbidden(res);
      
      // Get all events, then filter by accessible clients
      const allEvents = await storage.getAllEvents();
      const accessibleEvents = [];
      for (const event of allEvents) {
        if (await canAccessClient(user, event.clientId)) {
          accessibleEvents.push(event);
        }
      }
      res.json(accessibleEvents);
    } catch (error) {
      console.error("Error fetching all events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/clients/:clientId/events", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const events = await storage.getEvents(clientId);
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const event = await storage.getEvent(parseInt(req.params.id));
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!await canAccessClient(user, event.clientId)) {
        return forbidden(res);
      }
      res.json(event);
    } catch (error) {
      console.error("Error fetching event:", error);
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  app.post("/api/clients/:clientId/events", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!isAgencyStaff(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const validatedData = insertEventSchema.parse({
        ...req.body,
        clientId,
      });
      const event = await storage.createEvent(validatedData);
      res.status(201).json(event);
    } catch (error: any) {
      console.error("Error creating event:", error);
      res.status(400).json({ error: error.message || "Failed to create event" });
    }
  });

  app.patch("/api/events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const event = await storage.getEvent(parseInt(req.params.id));
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!await canAccessClient(user, event.clientId)) {
        return forbidden(res);
      }
      if (!isAgencyStaff(user)) {
        return forbidden(res);
      }
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
          ["clientId", "id", "createdAt", "updatedAt"].some(key => Object.prototype.hasOwnProperty.call(req.body, key))) {
        return res.status(400).json({ error: "Event identity and ownership cannot be changed" });
      }
      const updatedEvent = await storage.updateEvent(parseInt(req.params.id), req.body);
      res.json(updatedEvent);
    } catch (error: any) {
      console.error("Error updating event:", error);
      res.status(400).json({ error: error.message || "Failed to update event" });
    }
  });

  // ASSETS
  app.get("/api/clients/:clientId/assets", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const assets = await storage.getAssetsByClientId(clientId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching client assets:", error);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.get("/api/events/:eventId/assets", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const eventId = parseInt(req.params.eventId);
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!await canAccessClient(user, event.clientId)) {
        return forbidden(res);
      }
      const assets = await storage.getAssets(eventId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching assets:", error);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.post("/api/events/:eventId/assets", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const eventId = parseInt(req.params.eventId);
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!isAgencyStaff(user) || !await canAccessClient(user, event.clientId)) {
        return forbidden(res);
      }
      const validatedData = insertAssetSchema.parse({
        ...req.body,
        eventId,
      });
      const asset = await storage.createAsset(validatedData);
      res.status(201).json(asset);
    } catch (error: any) {
      console.error("Error creating asset:", error);
      res.status(400).json({ error: error.message || "Failed to create asset" });
    }
  });

  app.patch("/api/assets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const asset = await storage.getAsset(parseInt(req.params.id));
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }
      const event = await storage.getEvent(asset.eventId);
      if (!event || !isAgencyStaff(user) || !await canAccessClient(user, event.clientId)) {
        return forbidden(res);
      }
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
          ["eventId", "id", "createdAt", "updatedAt"].some(key => Object.prototype.hasOwnProperty.call(req.body, key))) {
        return res.status(400).json({ error: "Asset identity and ownership cannot be changed" });
      }
      const updatedAsset = await storage.updateAsset(parseInt(req.params.id), req.body);
      res.json(updatedAsset);
    } catch (error: any) {
      console.error("Error updating asset:", error);
      res.status(400).json({ error: error.message || "Failed to update asset" });
    }
  });

  // GENERATION - Endpoint to trigger asset generation
  app.post("/api/events/:eventId/generate", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const eventId = parseInt(req.params.eventId);
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!isAgencyStaff(user) || !await canAccessClient(user, event.clientId)) {
        return forbidden(res);
      }
      const { selectedAssetTypes } = req.body;

      if (!selectedAssetTypes || selectedAssetTypes.length === 0) {
        return res.status(400).json({ error: "No asset types selected" });
      }

      // Create a generation job
      const job = await storage.createGenerationJob({
        eventId,
        selectedAssetTypes,
        status: "pending",
        progress: 0,
      });

      // Start generation in background (don't await)
      runAssetGeneration(job.id, eventId, selectedAssetTypes).catch((err) => {
        console.error("Background generation error:", err);
      });

      res.status(202).json({ jobId: job.id, message: "Generation started" });
    } catch (error: any) {
      console.error("Error creating generation job:", error);
      res.status(400).json({ error: error.message || "Failed to create generation job" });
    }
  });

  app.get("/api/generation-jobs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const job = await storage.getGenerationJob(parseInt(req.params.id));
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      // Check access via the event's client
      const event = await storage.getEvent(job.eventId);
      if (!event || !await canAccessClient(user, event.clientId)) {
        return forbidden(res);
      }
      res.json(job);
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // Get available templates for an event
  app.get("/api/events/:eventId/available-templates", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const eventId = parseInt(req.params.eventId);
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!await canAccessClient(user, event.clientId)) {
        return forbidden(res);
      }
      const templates = await getAvailableTemplatesForEvent(eventId);
      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching available templates:", error);
      res.status(500).json({ error: error.message || "Failed to fetch templates" });
    }
  });

  // Template-based generation endpoint
  app.post("/api/events/:eventId/generate-from-templates", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const eventId = parseInt(req.params.eventId);
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (!isAgencyStaff(user) || !await canAccessClient(user, event.clientId)) {
        return forbidden(res);
      }
      const { templateIds } = req.body;

      if (!templateIds || templateIds.length === 0) {
        return res.status(400).json({ error: "No templates selected" });
      }

      // Create a generation job
      const job = await storage.createGenerationJob({
        eventId,
        selectedAssetTypes: templateIds.map((id: number) => `template:${id}`),
        status: "pending",
        progress: 0,
      });

      // Start template-based generation in background (don't await)
      runTemplateBasedGeneration(job.id, eventId, templateIds).catch((err) => {
        console.error("Background template generation error:", err);
      });

      res.status(202).json({ jobId: job.id, message: "Template-based generation started" });
    } catch (error: any) {
      console.error("Error creating template generation job:", error);
      res.status(400).json({ error: error.message || "Failed to create generation job" });
    }
  });

  // VAULT ASSETS
  app.get("/api/clients/:clientId/vault-assets", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const assets = await storage.getVaultAssets(clientId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching vault assets:", error);
      res.status(500).json({ error: "Failed to fetch vault assets" });
    }
  });

  app.get("/api/vault-assets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const asset = await storage.getVaultAsset(parseInt(req.params.id));
      if (!asset) {
        return res.status(404).json({ error: "Vault asset not found" });
      }
      if (!await canAccessClient(user, asset.clientId)) {
        return forbidden(res);
      }
      res.json(asset);
    } catch (error) {
      console.error("Error fetching vault asset:", error);
      res.status(500).json({ error: "Failed to fetch vault asset" });
    }
  });

  app.post("/api/clients/:clientId/vault-assets", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!isAgencyStaff(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const validatedData = insertVaultAssetSchema.parse({
        ...req.body,
        clientId,
      });
      const asset = await storage.createVaultAsset(validatedData);
      res.status(201).json(asset);
    } catch (error: any) {
      console.error("Error creating vault asset:", error);
      res.status(400).json({ error: error.message || "Failed to create vault asset" });
    }
  });

  app.delete("/api/vault-assets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const asset = await storage.getVaultAsset(parseInt(req.params.id));
      if (!asset) {
        return res.status(404).json({ error: "Vault asset not found" });
      }
      if (!isAgencyStaff(user) || !await canAccessClient(user, asset.clientId)) {
        return forbidden(res);
      }
      const deleted = await storage.deleteVaultAsset(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting vault asset:", error);
      res.status(500).json({ error: error.message || "Failed to delete vault asset" });
    }
  });

  // SALES
  app.get("/api/clients/:clientId/sales", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const sales = await storage.getSales(clientId, start, end);
      res.json(sales);
    } catch (error) {
      console.error("Error fetching sales:", error);
      res.status(500).json({ error: "Failed to fetch sales" });
    }
  });

  app.get("/api/clients/:clientId/sales/paginated", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const { page = "1", limit = "10", search, processor, startDate, endDate } = req.query;
      const pageNumber = Number(page);
      const pageSize = Number(limit);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
          (startDate && !Number.isFinite(Date.parse(startDate as string))) ||
          (endDate && !Number.isFinite(Date.parse(endDate as string)))) {
        return res.status(400).json({ error: "Invalid pagination or date range" });
      }
      
      const result = await storage.getSalesPaginated(clientId, {
        page: pageNumber,
        limit: pageSize,
        search: search as string | undefined,
        source: processor as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching paginated sales:", error);
      res.status(500).json({ error: "Failed to fetch sales" });
    }
  });

  app.get("/api/clients/:clientId/sales/stats", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const now = new Date();
      
      // Get start of today
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Get start of month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Get start of quarter
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
      
      // Get start of year
      const yearStart = new Date(now.getFullYear(), 0, 1);
      
      const [todaySales, mtdSales, qtdSales, ytdSales, allTimeSales] = await Promise.all([
        storage.getSales(clientId, todayStart),
        storage.getSales(clientId, monthStart),
        storage.getSales(clientId, quarterStart),
        storage.getSales(clientId, yearStart),
        storage.getSales(clientId),
      ]);
      
      const sumSales = (sales: any[]) => sales.reduce((sum, s) => sum + netSaleContribution(s), 0);
      const paidCount = (sales: any[]) => sales.filter(s => s.status === "paid" || s.status === "completed").length;
      
      res.json({
        today: { total: sumSales(todaySales), count: paidCount(todaySales) },
        mtd: { total: sumSales(mtdSales), count: paidCount(mtdSales) },
        qtd: { total: sumSales(qtdSales), count: paidCount(qtdSales) },
        ytd: { total: sumSales(ytdSales), count: paidCount(ytdSales) },
        allTime: { total: sumSales(allTimeSales), count: paidCount(allTimeSales) },
      });
    } catch (error) {
      console.error("Error fetching sales stats:", error);
      res.status(500).json({ error: "Failed to fetch sales stats" });
    }
  });

  // Regenerate webhook token
  app.get("/api/clients/:clientId/webhook-token", isAuthenticated, async (req: any, res) => {
    const user = await getRequestUser(req);
    const clientId = Number(req.params.clientId);
    if (!isAdminUser(user) || !await canAccessClient(user, clientId)) {
      return forbidden(res);
    }
    const client = await storage.getClient(clientId);
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json({ webhookToken: client.webhookToken });
  });

  app.post("/api/clients/:clientId/regenerate-webhook-token", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      // Only owner and agency_admin can regenerate tokens
      if (!user || (user.role !== "owner" && user.role !== "agency_admin")) {
        return forbidden(res);
      }
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const newToken = await storage.regenerateWebhookToken(clientId);
      if (!newToken) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.json({ webhookToken: newToken });
    } catch (error: any) {
      console.error("Error regenerating webhook token:", error);
      res.status(500).json({ error: error.message || "Failed to regenerate token" });
    }
  });

  // GOOGLE DRIVE OAUTH
  app.get("/api/clients/:clientId/google-drive/authorize", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!isAdminUser(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ error: "Google OAuth not configured" });
      }
      
      const state = randomUUID();
      req.session.googleDriveOAuth = { clientId, state, expiresAt: Date.now() + 10 * 60 * 1000 };
      const authUrl = getAuthorizationUrl(state);
      res.json({ authUrl });
    } catch (error: any) {
      console.error("Error generating auth URL:", error);
      res.status(500).json({ error: error.message || "Failed to generate authorization URL" });
    }
  });

  app.get("/api/google-drive/callback", isAuthenticated, async (req: any, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || typeof code !== "string") {
        return res.status(400).send("Missing authorization code");
      }
      
      const pending = req.session.googleDriveOAuth;
      delete req.session.googleDriveOAuth;
      if (!pending || typeof state !== "string" || pending.state !== state || pending.expiresAt < Date.now()) {
        return res.status(400).send("Invalid or expired authorization state");
      }
      const clientId = pending.clientId;
      
      const user = await getRequestUser(req);
      if (!isAdminUser(user) || !await canAccessClient(user, clientId)) {
        return res.status(403).send("You do not have access to this client");
      }
      
      const { accessToken, refreshToken, email } = await exchangeCodeForTokens(code);
      
      await storage.updateClientGoogleDrive(clientId, {
        accessToken,
        refreshToken,
        email,
        folderId: null,
      });
      
      const client = await storage.getClient(clientId);
      if (client) {
        try {
          await ensureClientFolder(clientId, client.name);
        } catch (folderError) {
          console.error("Failed to create Google Drive folder");
        }
      }
      
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : "http://localhost:5000";
      
      res.redirect(`${baseUrl}/client/${clientId}/workspace?gdrive=connected`);
    } catch (error: any) {
      console.error("Google Drive callback failed");
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : "http://localhost:5000";
      res.redirect(`${baseUrl}?gdrive_error=connection_failed`);
    }
  });

  app.get("/api/clients/:clientId/google-drive/status", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      res.json({
        connected: !!client.googleDriveAccessToken,
        email: client.googleDriveEmail,
        folderUrl: client.googleDriveFolderId
          ? `https://drive.google.com/drive/folders/${encodeURIComponent(client.googleDriveFolderId)}`
          : null,
      });
    } catch (error: any) {
      console.error("Error checking Google Drive status:", error);
      res.status(500).json({ error: error.message || "Failed to check status" });
    }
  });

  app.patch("/api/clients/:clientId/google-drive/folder", isAuthenticated, async (req: any, res) => {
    const user = await getRequestUser(req);
    const clientId = Number(req.params.clientId);
    if (!isAdminUser(user) || !await canAccessClient(user, clientId)) return forbidden(res);
    const input = z.object({ folderUrl: z.string().max(2048).nullable() }).safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "A Google Drive folder URL is required" });
    let folderId: string | null = null;
    if (input.data.folderUrl) {
      try {
        const parsed = new URL(input.data.folderUrl);
        const match = parsed.pathname.match(/^\/drive\/folders\/([A-Za-z0-9_-]+)\/?$/);
        if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com" || !match) throw new Error();
        folderId = match[1];
      } catch {
        return res.status(400).json({ error: "Use a Google Drive folder URL (https://drive.google.com/drive/folders/...)" });
      }
    }
    const updated = await storage.updateClient(clientId, { googleDriveFolderId: folderId } as any);
    if (!updated) return res.status(404).json({ error: "Client not found" });
    res.json({ folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null });
  });

  app.delete("/api/clients/:clientId/google-drive", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!isAdminUser(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      
      await storage.clearClientGoogleDrive(clientId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error disconnecting Google Drive:", error);
      res.status(500).json({ error: error.message || "Failed to disconnect" });
    }
  });

  // WEBINARS
  app.get("/api/clients/:clientId/webinars", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const webinars = await storage.getWebinars(clientId);
      res.json(webinars);
    } catch (error) {
      console.error("Error fetching webinars:", error);
      res.status(500).json({ error: "Failed to fetch masterclasses" });
    }
  });

  app.get("/api/webinars/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const webinar = await storage.getWebinar(parseInt(req.params.id));
      if (!webinar) {
        return res.status(404).json({ error: "Masterclass not found" });
      }
      if (!await canAccessClient(user, webinar.clientId)) {
        return forbidden(res);
      }
      res.json(webinar);
    } catch (error) {
      console.error("Error fetching webinar:", error);
      res.status(500).json({ error: "Failed to fetch masterclass" });
    }
  });

  app.post("/api/clients/:clientId/webinars", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!isAgencyStaff(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const validatedData = insertWebinarSchema.parse({
        ...req.body,
        clientId,
        date: req.body.date ? new Date(req.body.date) : undefined,
      });
      const webinar = await storage.createWebinar(validatedData);
      res.status(201).json(webinar);
    } catch (error: any) {
      console.error("Error creating webinar:", error);
      res.status(400).json({ error: error.message || "Failed to create masterclass" });
    }
  });

  app.patch("/api/webinars/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const webinar = await storage.getWebinar(parseInt(req.params.id));
      if (!webinar) {
        return res.status(404).json({ error: "Masterclass not found" });
      }
      if (!isAgencyStaff(user) || !await canAccessClient(user, webinar.clientId)) {
        return forbidden(res);
      }
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
          ["clientId", "id", "createdAt", "updatedAt"].some(key => Object.prototype.hasOwnProperty.call(req.body, key))) {
        return res.status(400).json({ error: "Masterclass identity and ownership cannot be changed" });
      }
      const updateData = {
        ...req.body,
        date: req.body.date ? new Date(req.body.date) : undefined,
      };
      const updatedWebinar = await storage.updateWebinar(parseInt(req.params.id), updateData);
      res.json(updatedWebinar);
    } catch (error: any) {
      console.error("Error updating webinar:", error);
      res.status(400).json({ error: error.message || "Failed to update masterclass" });
    }
  });

  app.delete("/api/webinars/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const webinar = await storage.getWebinar(parseInt(req.params.id));
      if (!webinar) {
        return res.status(404).json({ error: "Masterclass not found" });
      }
      if (!isAgencyStaff(user) || !await canAccessClient(user, webinar.clientId)) {
        return forbidden(res);
      }
      const deleted = await storage.deleteWebinar(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting webinar:", error);
      res.status(500).json({ error: error.message || "Failed to delete masterclass" });
    }
  });

  // WEBINAR GOALS
  app.get("/api/clients/:clientId/webinar-goals", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const goals = await storage.getWebinarGoals(clientId);
      res.json(goals || null);
    } catch (error: any) {
      console.error("Error fetching webinar goals:", error);
      res.status(500).json({ error: "Failed to fetch masterclass goals" });
    }
  });

  app.post("/api/clients/:clientId/webinar-goals", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!isAgencyStaff(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const goals = await storage.createWebinarGoals({
        ...req.body,
        clientId,
      });
      res.status(201).json(goals);
    } catch (error: any) {
      console.error("Error creating webinar goals:", error);
      res.status(400).json({ error: error.message || "Failed to create masterclass goals" });
    }
  });

  const webinarGoalsUpdateSchema = z.object({
    targetRevenue: z.string().refine((val) => !isNaN(parseFloat(val)), { message: "Must be a valid number" }).optional(),
    targetRegistrants: z.number().int().min(0).optional(),
    targetAttendeeRate: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 100, { message: "Must be between 0 and 100" }).optional(),
    targetClosingRate: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 100, { message: "Must be between 0 and 100" }).optional(),
    targetRoas: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, { message: "Must be a positive number" }).optional(),
    targetWebinars: z.number().int().min(0).optional(),
  });

  app.patch("/api/clients/:clientId/webinar-goals", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!isAgencyStaff(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      
      // Validate request body
      const parseResult = webinarGoalsUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }
      
      // Check if goals exist - if not, create them
      const existingGoals = await storage.getWebinarGoals(clientId);
      if (!existingGoals) {
        const newGoals = await storage.createWebinarGoals({
          clientId,
          ...parseResult.data,
        });
        return res.json(newGoals);
      }
      const updatedGoals = await storage.updateWebinarGoals(clientId, parseResult.data);
      res.json(updatedGoals);
    } catch (error: any) {
      console.error("Error updating webinar goals:", error);
      res.status(400).json({ error: error.message || "Failed to update masterclass goals" });
    }
  });

  // EVENT PERFORMANCE (unified tracker for webinars, challenges, summits)
  app.get("/api/clients/:clientId/event-performance", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const events = await storage.getEventPerformances(clientId);
      res.json(events);
    } catch (error: any) {
      console.error("Error fetching event performances:", error);
      res.status(500).json({ error: error.message || "Failed to fetch event performances" });
    }
  });

  app.get("/api/event-performance/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.getEventPerformance(id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      // Check access
      const user = await getRequestUser(req);
      if (!await canAccessClient(user, event.clientId)) {
        return forbidden(res);
      }
      // Get day stats for multi-day events
      const dayStats = await storage.getEventDayStats(id);
      res.json({ ...event, dayStats });
    } catch (error: any) {
      console.error("Error fetching event performance:", error);
      res.status(500).json({ error: error.message || "Failed to fetch event performance" });
    }
  });

  app.post("/api/clients/:clientId/event-performance", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!isAdminUser(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      
      const { dayStats, ...eventData } = req.body;
      const parsed = performanceInputSchema.parse(eventData);
      const days = dayStats === undefined ? [] : performanceDaySchema.parse(dayStats);
      if ((parsed.totalAttendees ?? 0) > (parsed.totalRegistrants ?? 0)) {
        return res.status(400).json({ error: "Attendance cannot exceed registrations" });
      }
      // Create the event performance record
      const event = await storage.createEventPerformance({
        clientId,
        ...parsed,
        adSpend: String(parsed.adSpend ?? 0),
        ...performanceTotals(parsed),
        dataSource: "manual",
      });
      
      // Create day stats if provided (for multi-day events)
      if (days.length) {
        await storage.upsertEventDayStats(event.id, days.map((ds) => ({
          eventPerformanceId: event.id,
          dayNumber: ds.dayNumber,
          dayDate: ds.dayDate ? new Date(ds.dayDate) : null,
          dayTitle: ds.dayTitle || null,
          registrantsForDay: ds.registrantsForDay || 0,
          attendeesForDay: ds.attendeesForDay || 0,
          notes: ds.notes || null,
        })));
      }
      
      res.status(201).json(event);
    } catch (error: any) {
      console.error("Error creating event performance:", error);
      res.status(400).json({ error: error.message || "Failed to create event performance" });
    }
  });

  app.patch("/api/event-performance/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingEvent = await storage.getEventPerformance(id);
      if (!existingEvent) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const user = await getRequestUser(req);
      if (!isAdminUser(user) || !await canAccessClient(user, existingEvent.clientId)) {
        return forbidden(res);
      }
      
      const { dayStats, ...eventData } = req.body;
      const parsed = performanceInputSchema.partial().parse(eventData);
      const days = dayStats === undefined ? undefined : performanceDaySchema.parse(dayStats);
      const merged = { ...existingEvent, ...parsed };
      if ((merged.totalAttendees ?? 0) > (merged.totalRegistrants ?? 0)) {
        return res.status(400).json({ error: "Attendance cannot exceed registrations" });
      }
      // Update the event
      const updateData: any = {
        ...parsed,
        ...(parsed.adSpend !== undefined ? { adSpend: String(parsed.adSpend) } : {}),
        ...performanceTotals(merged),
      };
      
      const updated = await storage.updateEventPerformance(id, updateData);
      
      // Update day stats if provided
      if (days) {
        await storage.upsertEventDayStats(id, days.map((ds) => ({
          eventPerformanceId: id,
          dayNumber: ds.dayNumber,
          dayDate: ds.dayDate ? new Date(ds.dayDate) : null,
          dayTitle: ds.dayTitle || null,
          registrantsForDay: ds.registrantsForDay || 0,
          attendeesForDay: ds.attendeesForDay || 0,
          notes: ds.notes || null,
        })));
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating event performance:", error);
      res.status(400).json({ error: error.message || "Failed to update event performance" });
    }
  });

  app.delete("/api/event-performance/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingEvent = await storage.getEventPerformance(id);
      if (!existingEvent) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const user = await getRequestUser(req);
      if (!isAdminUser(user) || !await canAccessClient(user, existingEvent.clientId)) {
        return forbidden(res);
      }
      
      await storage.deleteEventPerformance(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting event performance:", error);
      res.status(500).json({ error: error.message || "Failed to delete event performance" });
    }
  });

  // EVENT GOALS
  app.get("/api/clients/:clientId/event-goals", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      const eventType = req.query.eventType as string | undefined;
      const goals = await storage.getEventGoals(clientId, eventType);
      res.json(goals || null);
    } catch (error: any) {
      console.error("Error fetching event goals:", error);
      res.status(500).json({ error: "Failed to fetch event goals" });
    }
  });

  app.patch("/api/clients/:clientId/event-goals", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!isAdminUser(user) || !await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      
      const { eventType, ...goalsData } = req.body;
      const updatedGoals = await storage.updateEventGoals(clientId, eventType || null, goalsData);
      res.json(updatedGoals);
    } catch (error: any) {
      console.error("Error updating event goals:", error);
      res.status(400).json({ error: error.message || "Failed to update event goals" });
    }
  });

  // TRAINING MODULES
  app.get("/api/training/modules", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.demoLogin) return res.json([]);
      const modules = await storage.getAllTrainingModules();
      res.json(modules);
    } catch (error: any) {
      console.error("Error fetching training modules:", error);
      res.status(500).json({ error: error.message || "Failed to fetch training modules" });
    }
  });

  app.get("/api/training/videos", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.demoLogin) return res.json([]);
      const videos = await storage.getAllVideos();
      res.json(videos);
    } catch (error: any) {
      console.error("Error fetching training videos:", error);
      res.status(500).json({ error: error.message || "Failed to fetch training videos" });
    }
  });

  app.get("/api/training/modules/:moduleId/videos", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.demoLogin) return res.json([]);
      const moduleId = parseInt(req.params.moduleId);
      const videos = await storage.getVideosByModule(moduleId);
      res.json(videos);
    } catch (error: any) {
      console.error("Error fetching module videos:", error);
      res.status(500).json({ error: error.message || "Failed to fetch module videos" });
    }
  });

  app.get("/api/training/progress", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const progress = await storage.getUserProgress(userId);
      res.json(progress);
    } catch (error: any) {
      console.error("Error fetching user progress:", error);
      res.status(500).json({ error: error.message || "Failed to fetch user progress" });
    }
  });

  app.post("/api/training/videos/:videoId/complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const videoId = parseInt(req.params.videoId);
      const progress = await storage.markVideoComplete(userId, videoId);
      res.json(progress);
    } catch (error: any) {
      console.error("Error marking video complete:", error);
      res.status(500).json({ error: error.message || "Failed to mark video complete" });
    }
  });

  app.delete("/api/training/videos/:videoId/complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const videoId = parseInt(req.params.videoId);
      await storage.markVideoIncomplete(userId, videoId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error marking video incomplete:", error);
      res.status(500).json({ error: error.message || "Failed to mark video incomplete" });
    }
  });

  // HIGHLEVEL WEBHOOK
  app.post("/api/webhooks/highlevel/sale", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== "string") {
        return res.status(401).json({ error: "Missing or invalid token" });
      }
      
      // Validate token and get client
      const client = await storage.getClientByWebhookToken(token);
      if (!client) {
        return res.status(401).json({ error: "Invalid webhook token" });
      }
      
      const payload = z.object({
        amount: z.coerce.number().finite().nonnegative(),
        productName: z.string().max(500).nullish(),
        customerEmail: z.string().email().nullish(),
        customerName: z.string().max(300).nullish(),
        saleDate: z.coerce.date().optional(),
        externalId: z.string().trim().min(1).max(300).nullish(),
        status: z.enum(["paid", "completed", "refunded", "failed", "pending"]).default("paid"),
        refundAmount: z.coerce.number().finite().nonnegative().default(0),
      }).safeParse(req.body);
      if (!payload.success) return res.status(400).json({ error: payload.error.issues[0]?.message ?? "Invalid sale" });
      const { amount, productName, customerEmail, customerName, saleDate, externalId, status, refundAmount } = payload.data;
      const dedupeKey = externalId ? `highlevel:${externalId}` : null;
      const inserted = await db.insert(salesTable).values({
        clientId: client.id,
        amount: amount.toFixed(2),
        productName: productName || null,
        customerEmail: customerEmail || null,
        customerName: customerName || null,
        saleDate: saleDate || new Date(),
        externalId: externalId || null,
        source: "highlevel",
        status: status === "completed" ? "paid" : status,
        metadata: { refundAmount },
        dedupeKey,
      }).onConflictDoNothing({ target: [salesTable.clientId, salesTable.dedupeKey] }).returning({ id: salesTable.id });
      const existing = inserted[0] || (dedupeKey
        ? (await db.select({ id: salesTable.id }).from(salesTable).where(and(eq(salesTable.clientId, client.id), eq(salesTable.dedupeKey, dedupeKey))))[0]
        : undefined);
      await db.insert(salesSources).values({
        clientId: client.id, processor: "highlevel", configured: true,
        verified: true, lastSync: new Date(), error: null,
      }).onConflictDoUpdate({
        target: [salesSources.clientId, salesSources.processor],
        set: { configured: true, verified: true, lastSync: new Date(), error: null },
      });
      res.status(inserted.length ? 201 : 200).json({ success: true, saleId: existing?.id, duplicate: !inserted.length });
    } catch (error: any) {
      console.error("Error processing HighLevel webhook:", error);
      res.status(500).json({ error: error.message || "Failed to process webhook" });
    }
  });

  // NOTIFICATIONS

  // Get unread notification count for current user
  app.get("/api/notifications/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!user) {
        return res.json({ count: 0 });
      }
      
      // For agency_client users, count unread for their accessible clients
      if (user.role === "agency_client" && user.clientAccess && user.clientAccess.length > 0) {
        const count = await storage.getUnreadCountForClients(user.clientAccess);
        return res.json({ count });
      }
      
      // For other users, use userId-based count
      const count = await storage.getUnreadCount(user.id);
      res.json({ count });
    } catch (error: any) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: error.message || "Failed to fetch unread count" });
    }
  });

  // Get notifications for current user
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!user) {
        return res.json([]);
      }
      
      // For agency_client users, get notifications for their accessible clients
      if (user.role === "agency_client" && user.clientAccess && user.clientAccess.length > 0) {
        const notifications = await storage.getNotificationsForClients(user.clientAccess);
        return res.json(notifications);
      }
      
      // For other users, use userId-based lookup
      const notifications = await storage.getNotificationsForUser(user.id);
      res.json(notifications);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: error.message || "Failed to fetch notifications" });
    }
  });

  // Get notifications for a specific client (for client mode viewing)
  app.get("/api/clients/:clientId/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      
      if (!(await canAccessClient(user, clientId))) {
        return forbidden(res);
      }
      
      const notifications = await storage.getNotificationsForClient(clientId);
      res.json(notifications);
    } catch (error: any) {
      console.error("Error fetching client notifications:", error);
      res.status(500).json({ error: error.message || "Failed to fetch client notifications" });
    }
  });

  // Get unread count for a specific client
  app.get("/api/clients/:clientId/notifications/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      
      if (!(await canAccessClient(user, clientId))) {
        return forbidden(res);
      }
      
      const count = await storage.getUnreadCountForClients([clientId]);
      res.json({ count });
    } catch (error: any) {
      console.error("Error fetching client unread count:", error);
      res.status(500).json({ error: error.message || "Failed to fetch unread count" });
    }
  });

  // Mark notification as read
  app.post("/api/notifications/:recipientId/read", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!user) return forbidden(res);
      const recipientId = Number(req.params.recipientId);
      if (!Number.isSafeInteger(recipientId) || recipientId <= 0) {
        return res.status(400).json({ error: "Invalid recipient ID" });
      }
      const [current] = await db.select().from(notificationRecipients)
        .where(eq(notificationRecipients.id, recipientId)).limit(1);
      if (!current) return res.status(404).json({ error: "Notification not found" });
      if (current.recipientUserId !== user.id &&
          (current.recipientUserId || !current.clientId || !await canAccessClient(user, current.clientId))) {
        return forbidden(res);
      }
      const recipient = await storage.markNotificationRead(recipientId);
      if (!recipient) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(recipient);
    } catch (error: any) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ error: error.message || "Failed to mark notification read" });
    }
  });

  // Send notification (admin/owner only)
  app.post("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      
      // Only owner or agency_admin can send notifications
      if (!user || (user.role !== "owner" && user.role !== "agency_admin")) {
        return forbidden(res);
      }
      
      // Agency admins must have an agency assigned
      if (user.role === "agency_admin" && !user.agencyId) {
        return res.status(400).json({ error: "Agency admin must be assigned to an agency" });
      }
      
      const { subject, body, category, clientIds, sendEmail } = req.body;
      
      if (!subject || !body || !clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
        return res.status(400).json({ error: "subject, body, and clientIds are required" });
      }
      
      // Get clients and validate agency ownership
      const clients = await storage.getClientsByIds(clientIds);
      
      if (clients.length === 0) {
        return res.status(400).json({ error: "No valid clients found" });
      }
      
      // Determine agency context and validate all clients belong to it
      let agencyId: number;
      
      if (user.agencyId) {
        // User has an agency assigned - all clients MUST belong to that agency
        agencyId = user.agencyId;
        const invalidClients = clients.filter((c) => c.agencyId !== agencyId);
        if (invalidClients.length > 0) {
          return res.status(403).json({ error: "Cannot send notifications to clients outside your agency" });
        }
      } else if (user.role === "owner") {
        // Owner without agency - derive from first client, ensure all match
        agencyId = clients[0].agencyId;
        const mixedAgencies = clients.some((c) => c.agencyId !== agencyId);
        if (mixedAgencies) {
          return res.status(400).json({ error: "All selected clients must belong to the same agency" });
        }
      } else {
        return res.status(400).json({ error: "User must be assigned to an agency" });
      }
      
      const agency = await storage.getAgency(agencyId!);
      
      // Create the notification
      const notification = await storage.createNotification({
        agencyId: agencyId!,
        senderUserId: user.id,
        subject,
        body,
        category: category || "custom",
        metadata: null,
      });
      
      // Create recipients
      const recipientData = clients.map((client) => ({
        notificationId: notification.id,
        clientId: client.id,
        recipientEmail: client.email,
        emailStatus: sendEmail ? "pending" : "skipped",
      }));
      
      const recipients = await storage.createNotificationRecipients(recipientData);
      
      // Send emails if requested
      if (sendEmail) {
        const senderName = user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : undefined;
        
        for (const recipient of recipients) {
          if (recipient.recipientEmail) {
            const result = await sendNotificationEmail({
              to: recipient.recipientEmail,
              subject,
              body,
              senderName,
              agencyName: agency?.name,
            });
            
            await storage.updateRecipientEmailStatus(
              recipient.id,
              result.success ? "sent" : "failed",
              result.success ? new Date() : undefined
            );
          }
        }
      }
      
      res.status(201).json({ notification, recipientCount: recipients.length });
    } catch (error: any) {
      console.error("Error sending notification:", error);
      res.status(500).json({ error: error.message || "Failed to send notification" });
    }
  });

  // Get sent notifications history (admin view)
  app.get("/api/notifications/sent", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      
      if (!user || (user.role !== "owner" && user.role !== "agency_admin")) {
        return forbidden(res);
      }
      
      // Agency admin must have an agency assigned
      if (user.role === "agency_admin" && !user.agencyId) {
        return res.status(400).json({ error: "Agency admin must be assigned to an agency" });
      }
      
      // For owner without agency, return all notifications or empty
      if (user.role === "owner" && !user.agencyId) {
        // Owner can see all - get all agencies and fetch from the first one
        // In practice, owner should be assigned to an agency or we return empty
        const allAgencies = await storage.getAllAgencies();
        if (allAgencies.length > 0) {
          const notifications = await storage.getNotificationsByAgency(allAgencies[0].id);
          return res.json(notifications);
        }
        return res.json([]);
      }
      
      const notifications = await storage.getNotificationsByAgency(user.agencyId!);
      res.json(notifications);
    } catch (error: any) {
      console.error("Error fetching sent notifications:", error);
      res.status(500).json({ error: error.message || "Failed to fetch sent notifications" });
    }
  });

  // Calendar Entries - Get entries for a client
  app.get("/api/clients/:clientId/calendar", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId, 10);
      
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      
      const entries = await storage.getCalendarEntries(clientId);
      res.json(entries);
    } catch (error: any) {
      console.error("Error fetching calendar entries:", error);
      res.status(500).json({ error: error.message || "Failed to fetch calendar entries" });
    }
  });

  // Calendar entry CRUD and connector setup are agency-staff operations.
  app.post("/api/clients/:clientId/calendar", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId, 10);
      
      if (!isAdminUser(user)) {
        return forbidden(res);
      }
      
      // Must have access to this specific client
      if (!await canAccessClient(user, clientId)) {
        return forbidden(res);
      }
      
      // Validate the request body
      const calendarInputSchema = z.object({
        title: z.string().min(1, "Title is required"),
        eventDate: z.coerce.date(),
        endDate: z.coerce.date().nullable().optional(),
        timezone: z.string().default("America/New_York"),
        eventLink: z.string().url().nullable().optional(),
        description: z.string().nullable().optional(),
        attendeeEmails: z.array(z.string().email()).default([]),
      });
      
      const parsed = calendarInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }
      
      if (parsed.data.endDate && parsed.data.endDate <= parsed.data.eventDate) {
        return res.status(400).json({ error: "End date must be after start date" });
      }
      const entry = await storage.createCalendarEntry({
        clientId,
        title: parsed.data.title,
        eventDate: parsed.data.eventDate,
        endDate: parsed.data.endDate || null,
        timezone: parsed.data.timezone,
        eventLink: parsed.data.eventLink || null,
        description: parsed.data.description || null,
        attendeeEmails: parsed.data.attendeeEmails,
        googleEventId: null,
      });
      const connection = (await db.select().from(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, clientId)))[0];
      if (!connection) return res.status(201).json(entry);
      const googleEventId = await createGoogleCalendarEvent({
        title: entry.title, description: entry.description, eventDate: entry.eventDate,
        endDate: entry.endDate, timezone: entry.timezone,
        attendeeEmails: entry.attendeeEmails ?? [], eventLink: entry.eventLink,
      }, connection.calendarId);
      if (!googleEventId) {
        await db.update(clientCalendarConnections).set({ error: "Failed to create Google Calendar event" }).where(eq(clientCalendarConnections.clientId, clientId));
        return res.status(201).json({ ...entry, syncError: "Saved locally, but Google Calendar sync failed." });
      }
      const updated = await storage.updateCalendarEntry(entry.id, {
        googleEventId, googleCalendarId: connection.calendarId,
        googleSyncKey: `${connection.calendarId}:${googleEventId}`,
      });
      await db.update(clientCalendarConnections).set({ error: null }).where(eq(clientCalendarConnections.clientId, clientId));
      res.status(201).json(updated);
    } catch (error: any) {
      console.error("Error creating calendar entry:", error);
      res.status(500).json({ error: error.message || "Failed to create calendar entry" });
    }
  });

  // Calendar Entries - Update entry (agency staff only)
  app.patch("/api/calendar/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const entryId = parseInt(req.params.id, 10);
      
      if (!isAdminUser(user)) {
        return forbidden(res);
      }
      
      const existing = await storage.getCalendarEntry(entryId);
      if (!existing) {
        return res.status(404).json({ error: "Calendar entry not found" });
      }
      
      // Must have access to the client this entry belongs to
      if (!await canAccessClient(user, existing.clientId)) {
        return forbidden(res);
      }
      
      // Validate partial update
      const calendarUpdateSchema = z.object({
        title: z.string().min(1).optional(),
        eventDate: z.coerce.date().optional(),
        endDate: z.coerce.date().nullable().optional(),
        timezone: z.string().optional(),
        eventLink: z.string().url().nullable().optional(),
        description: z.string().nullable().optional(),
        attendeeEmails: z.array(z.string().email()).optional(),
      });
      
      const parsed = calendarUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }
      
      const updateData: Record<string, any> = {};
      if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
      if (parsed.data.eventDate !== undefined) updateData.eventDate = parsed.data.eventDate;
      if (parsed.data.endDate !== undefined) updateData.endDate = parsed.data.endDate;
      if (parsed.data.timezone !== undefined) updateData.timezone = parsed.data.timezone;
      if (parsed.data.eventLink !== undefined) updateData.eventLink = parsed.data.eventLink;
      if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
      if (parsed.data.attendeeEmails !== undefined) updateData.attendeeEmails = parsed.data.attendeeEmails;
      if ((updateData.endDate ?? existing.endDate) &&
          (updateData.endDate ?? existing.endDate) <= (updateData.eventDate ?? existing.eventDate)) {
        return res.status(400).json({ error: "End date must be after start date" });
      }
      const updated = await storage.updateCalendarEntry(entryId, updateData);
      const connection = (await db.select().from(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, existing.clientId)))[0];
      if (!connection || !updated) return res.json(updated);
      const eventData = {
        title: updated.title, description: updated.description,
        eventDate: updated.eventDate, endDate: updated.endDate,
        timezone: updated.timezone, attendeeEmails: updated.attendeeEmails ?? [],
        eventLink: updated.eventLink,
      };
      const sameCalendar = updated.googleCalendarId === connection.calendarId;
      const synced = sameCalendar && updated.googleEventId
        ? await updateGoogleCalendarEvent(updated.googleEventId, eventData, connection.calendarId)
        : false;
      if (!synced) {
        const googleEventId = sameCalendar && updated.googleEventId ? null
          : await createGoogleCalendarEvent(eventData, connection.calendarId);
        if (googleEventId) {
          await storage.updateCalendarEntry(entryId, {
            googleEventId, googleCalendarId: connection.calendarId,
            googleSyncKey: `${connection.calendarId}:${googleEventId}`,
          });
        } else {
          await db.update(clientCalendarConnections).set({ error: "Failed to update Google Calendar event" }).where(eq(clientCalendarConnections.clientId, existing.clientId));
          return res.json({ ...updated, syncError: "Saved locally, but Google Calendar sync failed." });
        }
      }
      await db.update(clientCalendarConnections).set({ error: null }).where(eq(clientCalendarConnections.clientId, existing.clientId));
      res.json(await storage.getCalendarEntry(entryId));
    } catch (error: any) {
      console.error("Error updating calendar entry:", error);
      res.status(500).json({ error: error.message || "Failed to update calendar entry" });
    }
  });

  // Calendar Entries - Delete entry (agency staff only)
  app.delete("/api/calendar/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const entryId = parseInt(req.params.id, 10);
      
      if (!isAdminUser(user)) {
        return forbidden(res);
      }
      
      const existing = await storage.getCalendarEntry(entryId);
      if (!existing) {
        return res.status(404).json({ error: "Calendar entry not found" });
      }
      
      // Must have access to the client this entry belongs to
      if (!await canAccessClient(user, existing.clientId)) {
        return forbidden(res);
      }
      
      // Do not remove the local record if its external event could not be deleted.
      const connection = (await db.select().from(clientCalendarConnections).where(eq(clientCalendarConnections.clientId, existing.clientId)))[0];
      if (existing.googleEventId && connection && existing.googleCalendarId === connection.calendarId) {
        if (!await deleteGoogleCalendarEvent(existing.googleEventId, connection.calendarId)) {
          await db.update(clientCalendarConnections).set({ error: "Failed to delete Google Calendar event" }).where(eq(clientCalendarConnections.clientId, existing.clientId));
          return res.status(502).json({ error: "Google Calendar could not delete this event. The local event was kept." });
        }
      }
      
      await storage.deleteCalendarEntry(entryId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting calendar entry:", error);
      res.status(500).json({ error: error.message || "Failed to delete calendar entry" });
    }
  });

  // Asset Templates - Get all templates for agency
  app.get("/api/asset-templates", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!user) {
        return forbidden(res);
      }
      
      // Owners can see all templates
      if (user.role === "owner") {
        const templates = await storage.getAllAssetTemplates();
        return res.json(templates);
      }
      
      const agencyId = await getEffectiveAgencyId(user);
      if (!agencyId) {
        return forbidden(res);
      }
      const templates = await storage.getAssetTemplates(agencyId);
      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching asset templates:", error);
      res.status(500).json({ error: error.message || "Failed to fetch asset templates" });
    }
  });

  // Asset Templates - Get templates by event type
  app.get("/api/asset-templates/by-type/:eventType", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!user) {
        return forbidden(res);
      }
      
      const { eventType } = req.params;
      const assetType = req.query.assetType as string | undefined;
      
      // Owners can see all templates
      if (user.role === "owner") {
        const templates = await storage.getAllAssetTemplatesByType(eventType, assetType);
        return res.json(templates);
      }
      
      const agencyId = await getEffectiveAgencyId(user);
      if (!agencyId) {
        return forbidden(res);
      }
      const templates = await storage.getAssetTemplatesByType(agencyId, eventType, assetType);
      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching asset templates by type:", error);
      res.status(500).json({ error: error.message || "Failed to fetch asset templates" });
    }
  });

  // Asset Templates - Create template (owner/admin only)
  app.post("/api/asset-templates", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!user || (user.role !== "owner" && user.role !== "agency_admin")) {
        return forbidden(res);
      }
      
      const templateSchema = z.object({
        name: z.string().min(1, "Name is required"),
        assetType: z.string().min(1, "Asset type is required"),
        eventType: z.string().min(1, "Event type is required"),
        itemCount: z.number().min(1).default(5),
        systemPrompt: z.string().min(1, "System prompt is required"),
        includeInstructions: z.string().nullable().optional(),
        outputFormat: z.string().nullable().optional(),
        isActive: z.boolean().default(true),
      });
      
      const parsed = templateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }
      
      const template = await storage.createAssetTemplate({
        ...parsed.data,
        agencyId: user.agencyId || 1,
      });
      res.status(201).json(template);
    } catch (error: any) {
      console.error("Error creating asset template:", error);
      res.status(500).json({ error: error.message || "Failed to create asset template" });
    }
  });

  // Asset Templates - Update template (owner/admin only)
  app.patch("/api/asset-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!user || (user.role !== "owner" && user.role !== "agency_admin")) {
        return forbidden(res);
      }
      
      const templateId = parseInt(req.params.id, 10);
      const existing = await storage.getAssetTemplate(templateId);
      if (!existing) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Verify template belongs to user's agency
      if (existing.agencyId !== user.agencyId) {
        return forbidden(res);
      }
      
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        assetType: z.string().min(1).optional(),
        eventType: z.string().min(1).optional(),
        itemCount: z.number().min(1).optional(),
        systemPrompt: z.string().min(1).optional(),
        includeInstructions: z.string().nullable().optional(),
        outputFormat: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }
      
      const updated = await storage.updateAssetTemplate(templateId, parsed.data);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating asset template:", error);
      res.status(500).json({ error: error.message || "Failed to update asset template" });
    }
  });

  // Asset Templates - Delete template (owner/admin only)
  app.delete("/api/asset-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      if (!user || (user.role !== "owner" && user.role !== "agency_admin")) {
        return forbidden(res);
      }
      
      const templateId = parseInt(req.params.id, 10);
      const existing = await storage.getAssetTemplate(templateId);
      if (!existing) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Verify template belongs to user's agency
      if (existing.agencyId !== user.agencyId) {
        return forbidden(res);
      }
      
      await storage.deleteAssetTemplate(templateId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting asset template:", error);
      res.status(500).json({ error: error.message || "Failed to delete asset template" });
    }
  });

  // ========== TUCK AI CHAT ROUTES ==========

  // List chats for a client
  app.get("/api/clients/:id/tuck/chats", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.id, 10);
      if (!await canAccessClient(user, clientId)) return forbidden(res);
      const chats = await storage.getTuckChats(clientId);
      res.json(chats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new chat
  app.post("/api/clients/:id/tuck/chats", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.id, 10);
      if (!await canAccessClient(user, clientId)) return forbidden(res);
      const chat = await storage.createTuckChat({ clientId, title: req.body.title || "New Chat" });
      res.json(chat);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a chat
  app.delete("/api/clients/:id/tuck/chats/:chatId", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.id, 10);
      if (!await canAccessClient(user, clientId)) return forbidden(res);
      const chat = await storage.getTuckChat(parseInt(req.params.chatId, 10));
      if (!chat || chat.clientId !== clientId) return res.status(404).json({ error: "Chat not found" });
      await storage.deleteTuckChat(chat.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get messages for a chat
  app.get("/api/clients/:id/tuck/chats/:chatId/messages", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.id, 10);
      if (!await canAccessClient(user, clientId)) return forbidden(res);
      const chat = await storage.getTuckChat(parseInt(req.params.chatId, 10));
      if (!chat || chat.clientId !== clientId) return res.status(404).json({ error: "Chat not found" });
      const messages = await storage.getTuckMessages(chat.id);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Send a message (calls OpenAI, saves both messages, returns response)
  app.post("/api/clients/:id/tuck/chats/:chatId/messages", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.id, 10);
      if (!await canAccessClient(user, clientId)) return forbidden(res);

      const chatId = parseInt(req.params.chatId, 10);
      const chat = await storage.getTuckChat(chatId);
      if (!chat || chat.clientId !== clientId) return res.status(404).json({ error: "Chat not found" });
      const { content, imageUrl, pageContext } = req.body;

      if (!content && !imageUrl) {
        return res.status(400).json({ error: "Message content or image required" });
      }

      const client = await storage.getClient(clientId);
      const history = await storage.getTuckMessages(chatId);

      // Save user message first
      const userMsg = await storage.createTuckMessage({
        chatId,
        role: "user",
        content: content || "Please analyze this image.",
        imageUrl: imageUrl || null,
      });

      // Build system prompt with client context
      const systemPrompt = `You are Neo, a friendly and highly knowledgeable AI marketing coach specializing in virtual events and digital marketing. You work directly with ${client?.name || "this client"}${client?.businessName ? ` (${client.businessName})` : ""}${client?.niche ? ` in the ${client.niche} niche` : ""}.

You have deep expertise in:
- Virtual events: webinars, challenges, summits, and live launches
- Digital marketing: email sequences, social media, paid ads (Facebook/IG), funnels
- Sales strategy: conversion optimization, offer ladders, closing rates, upsells
- Analytics: interpreting ROAS, show-up rates, attendee-to-buyer conversion
- Marketing strategy: audience building, launches, campaigns, follow-up sequences
- Copywriting: headlines, hooks, email subject lines, ad copy

When reviewing data or stats, give specific, actionable insights. Keep responses concise but substantive. Use bullet points for multiple tips. Be encouraging but honest about what the numbers show. When you see images, analyze them thoroughly for marketing effectiveness, design feedback, or data insights.${pageContext ? `\n\nContext: The user is currently viewing the "${pageContext}" page of their dashboard.` : ""}`;

      // Build messages array for OpenAI
      const openaiMessages: any[] = [{ role: "system", content: systemPrompt }];

      // Add history (last 20 messages for context)
      for (const msg of history.slice(-20)) {
        if (msg.imageUrl && msg.role === "user") {
          openaiMessages.push({
            role: "user",
            content: [
              { type: "text", text: msg.content },
              { type: "image_url", image_url: { url: msg.imageUrl, detail: "low" } },
            ],
          });
        } else {
          openaiMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
        }
      }

      // Add the current message
      if (imageUrl) {
        openaiMessages.push({
          role: "user",
          content: [
            { type: "text", text: content || "Please analyze this image." },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        });
      } else {
        openaiMessages.push({ role: "user", content });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: openaiMessages,
        max_tokens: 1500,
      });

      const assistantContent = completion.choices[0].message.content || "I couldn't generate a response. Please try again.";

      const assistantMsg = await storage.createTuckMessage({
        chatId,
        role: "assistant",
        content: assistantContent,
        imageUrl: null,
      });

      // Auto-title the chat from the first user message
      if (history.length === 0) {
        const title = content
          ? content.slice(0, 60) + (content.length > 60 ? "..." : "")
          : "Image Analysis";
        await storage.updateTuckChatTitle(chatId, title);
      } else {
        // Touch the updatedAt so it floats to top of list
        await storage.updateTuckChatTitle(chatId, (await storage.getTuckChat(chatId))?.title || "Chat");
      }

      res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
    } catch (error: any) {
      console.error("Tuck AI error:", error);
      res.status(500).json({ error: error.message || "Failed to get AI response" });
    }
  });

  // META ADS INTEGRATION
  app.get("/api/clients/:clientId/meta-ads/status", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) return forbidden(res);

      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const c = client as any;
      res.json({
        connected: !!c.metaAdsAccessToken,
        accountId: c.metaAdsAccountId || null,
        accountName: c.metaAdsAccountName || null,
        connectedAt: c.metaAdsConnectedAt || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clients/:clientId/meta-ads/authorize", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) return forbidden(res);
      if (!user) return forbidden(res);

      // Generate a nonce and bind it to the session so the callback can verify
      // the OAuth flow was initiated by this authenticated user for this client
      const nonce = randomUUID();
      req.session.metaAdsOAuth = { clientId, nonce, userId: user.id };
      await new Promise<void>((resolve, reject) =>
        req.session.save((err: any) => (err ? reject(err) : resolve()))
      );

      const { getOAuthUrl } = await import("./meta-ads");
      const authUrl = getOAuthUrl(clientId, nonce);
      res.json({ authUrl });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // OAuth callback — handles the redirect from Meta
  // isAuthenticated is included so only logged-in users can complete the flow.
  // clientId is read from the session (set during /authorize), NOT from the
  // attacker-controllable state parameter, preventing IDOR.
  app.get("/api/clients/meta-ads/callback", isAuthenticated, async (req: any, res) => {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        return res.redirect(`/?meta_ads_error=${encodeURIComponent(oauthError)}`);
      }

      if (!code) {
        return res.redirect("/?meta_ads_error=missing_code");
      }

      // Read clientId from session — this was set by the authenticated /authorize endpoint
      const oauthSession = req.session.metaAdsOAuth;
      if (!oauthSession?.clientId || !oauthSession?.nonce || !oauthSession?.userId) {
        return res.redirect("/?meta_ads_error=session_expired");
      }

      // Validate that the nonce in state matches the one we stored in the session
      let stateNonce: string | undefined;
      try {
        stateNonce = JSON.parse(decodeURIComponent(state as string)).nonce;
      } catch {
        return res.redirect("/?meta_ads_error=invalid_state");
      }

      if (stateNonce !== oauthSession.nonce) {
        return res.redirect("/?meta_ads_error=state_mismatch");
      }

      const { clientId } = oauthSession;

      // Clear the one-time nonce immediately after use
      delete req.session.metaAdsOAuth;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));

      // Enforce that the authenticated user still has access to this client
      const user = await getRequestUser(req);
      if (!await canAccessClient(user, clientId)) {
        return res.redirect("/?meta_ads_error=access_denied");
      }

      const { exchangeCodeForToken, getAdAccounts } = await import("./meta-ads");

      const accessToken = await exchangeCodeForToken(code as string);
      const adAccounts = await getAdAccounts(accessToken);

      if (adAccounts.length === 0) {
        return res.redirect(`/client/${clientId}/workspace?tab=settings&meta_ads_error=no_ad_accounts`);
      }

      // Use first ad account by default
      const account = adAccounts[0];

      await storage.updateClientMetaAds(clientId, {
        accessToken,
        accountId: account.id,
        accountName: account.name,
        connectedAt: new Date(),
      });

      res.redirect(`/client/${clientId}/workspace?tab=settings&meta_ads_connected=1`);
    } catch (error: any) {
      console.error("Meta Ads OAuth callback error:", error);
      res.redirect(`/?meta_ads_error=${encodeURIComponent(error.message)}`);
    }
  });

  app.delete("/api/clients/:clientId/meta-ads", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) return forbidden(res);

      await storage.clearClientMetaAds(clientId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch ad spend insights for multiple periods at once
  app.get("/api/clients/:clientId/meta-ads/insights", isAuthenticated, async (req: any, res) => {
    try {
      const user = await getRequestUser(req);
      const clientId = parseInt(req.params.clientId);
      if (!await canAccessClient(user, clientId)) return forbidden(res);

      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const c = client as any;
      if (!c.metaAdsAccessToken || !c.metaAdsAccountId) {
        return res.status(400).json({ error: "Meta Ads not connected" });
      }

      const { fetchAdSpend } = await import("./meta-ads");
      const { customStart, customEnd } = req.query;

      const [today, mtd, qtd, ytd] = await Promise.all([
        fetchAdSpend(c.metaAdsAccessToken, c.metaAdsAccountId, "today"),
        fetchAdSpend(c.metaAdsAccessToken, c.metaAdsAccountId, "mtd"),
        fetchAdSpend(c.metaAdsAccessToken, c.metaAdsAccountId, "qtd"),
        fetchAdSpend(c.metaAdsAccessToken, c.metaAdsAccountId, "ytd"),
      ]);

      let custom: number | null = null;
      if (customStart && customEnd) {
        custom = await fetchAdSpend(c.metaAdsAccessToken, c.metaAdsAccountId, "custom", customStart as string, customEnd as string);
      }

      res.json({ today, mtd, qtd, ytd, custom });
    } catch (error: any) {
      console.error("Meta Ads insights error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  registerPortalRoutes(app, getRequestUser, canAccessClient);
}
