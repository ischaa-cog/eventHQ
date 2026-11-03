// Client workspace teams, invites and password reset.
//
// Inside a client workspace there are two roles: an "owner" manages the team, a "member" sees the
// workspace but cannot add or remove people. Client logins made before roles existed have no value
// and count as owners. Staff (owner, agency admin, team member) can manage any team they can open.
import type { Express, Request, Response } from "express";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { clients, invites, passwordResetTokens, users, type User } from "@shared/schema";
import { db, storage } from "./storage";
import { hasActiveWorkspace, isAuthenticated, startLoginSession, TOO_MANY_ATTEMPTS, LOGIN_WINDOW_MS } from "./auth";
import { appUrl, features } from "./config";
import { passwordProblem } from "./passwords";
import { sendInviteEmail, sendPasswordResetEmail } from "./email";
import { countAttempt } from "./rate-limit";

type GetUser = (req: any) => Promise<User | undefined>;
type CanAccess = (user: User | undefined, clientId: number) => Promise<boolean>;
export type ClientRole = "owner" | "member";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const FORGOT_MESSAGE = "If that email has an EventHQ account, a reset link is on its way.";

const isStaff = (u: User | undefined) => u?.role === "owner" || u?.role === "agency_admin" || u?.role === "team_member";
export const clientRoleOf = (u: Pick<User, "clientRole">): ClientRole => (u.clientRole === "member" ? "member" : "owner");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const inviteLink = (token: string) => `${appUrl()}/accept-invite/${token}`;

const memberView = (u: User) => ({
  id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName,
  clientRole: clientRoleOf(u), createdAt: u.createdAt,
});

export function registerClientTeamRoutes(app: Express, getRequestUser: GetUser, canAccessClient: CanAccess) {
  // Who may look at, and who may change, this workspace's team.
  async function access(req: Request, res: Response, write: boolean) {
    const user = await getRequestUser(req);
    const clientId = Number(req.params.clientId);
    if (!Number.isSafeInteger(clientId) || clientId <= 0) {
      res.status(400).json({ error: "Invalid client ID" });
      return undefined;
    }
    const isClientUser = user?.role === "agency_client" && !!user.clientAccess?.includes(clientId);
    const canView = isClientUser || (isStaff(user) && await canAccessClient(user, clientId));
    const canManage = canView && (isStaff(user) || (isClientUser && clientRoleOf(user!) === "owner"));
    if (!canView || (write && !canManage)) {
      res.status(403).json({ error: write ? "Only workspace owners can manage the team." : "Forbidden" });
      return undefined;
    }
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return undefined;
    }
    return { user: user!, client, canManage };
  }

  async function owners(clientId: number) {
    return (await storage.getClientUsers(clientId)).filter((u) => clientRoleOf(u) === "owner");
  }

  async function pendingInvites(clientId: number) {
    return db.select().from(invites).where(and(
      eq(invites.role, "agency_client"),
      sql`${clientId} = ANY(${invites.clientAccess})`,
      isNull(invites.usedAt),
    ));
  }

  app.get("/api/clients/:clientId/team", isAuthenticated, async (req, res) => {
    const ctx = await access(req, res, false);
    if (!ctx) return;
    const members = (await storage.getClientUsers(ctx.client.id)).map(memberView);
    const now = Date.now();
    const pending = ctx.canManage
      ? (await pendingInvites(ctx.client.id)).map((i) => ({
          id: i.id, email: i.email, clientRole: i.clientRole === "member" ? "member" : "owner",
          createdAt: i.createdAt, expiresAt: i.expiresAt,
          expired: !!i.expiresAt && i.expiresAt.getTime() < now,
          link: inviteLink(i.token),
        }))
      : [];
    res.json({ members, invites: pending, canManage: ctx.canManage, me: ctx.user.id, emailEnabled: features().email });
  });

  const inviteSchema = z.object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
    clientRole: z.enum(["owner", "member"]).default("member"),
  });

  app.post("/api/clients/:clientId/team", isAuthenticated, async (req, res) => {
    const ctx = await access(req, res, true);
    if (!ctx) return;
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid invite" });
    const { email, clientRole } = parsed.data;
    if (await storage.getUserByEmail(email)) {
      return res.status(409).json({ error: "That email already has an EventHQ login." });
    }
    // A new invite to the same person replaces the old one, so only the latest link works.
    for (const old of await pendingInvites(ctx.client.id)) {
      if (old.email?.toLowerCase() === email) await db.delete(invites).where(eq(invites.id, old.id));
    }
    const token = newToken();
    const [invite] = await db.insert(invites).values({
      token, email, role: "agency_client", clientRole, agencyId: ctx.client.agencyId, clientAccess: [ctx.client.id],
      createdById: ctx.user.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    }).returning();
    const link = inviteLink(token);
    let emailed = false;
    if (features().email) {
      try {
        const inviterName = [ctx.user.firstName, ctx.user.lastName].filter(Boolean).join(" ") || null;
        await sendInviteEmail({ to: email, workspaceName: ctx.client.name, inviterName, link });
        emailed = true;
      } catch (error) {
        console.error("[team] invite email failed:", (error as Error).message);
      }
    }
    res.status(201).json({
      invite: { id: invite.id, email, clientRole, expiresAt: invite.expiresAt }, link, emailed,
    });
  });

  app.delete("/api/clients/:clientId/team/invites/:inviteId", isAuthenticated, async (req, res) => {
    const ctx = await access(req, res, true);
    if (!ctx) return;
    const deleted = await db.delete(invites).where(and(
      eq(invites.id, Number(req.params.inviteId)),
      sql`${ctx.client.id} = ANY(${invites.clientAccess})`,
      isNull(invites.usedAt),
    )).returning({ id: invites.id });
    if (!deleted.length) return res.status(404).json({ error: "Invite not found" });
    res.json({ success: true });
  });

  async function teamMember(clientId: number, userId: string) {
    const target = await storage.getUser(userId);
    return target?.role === "agency_client" && target.clientAccess?.includes(clientId) ? target : undefined;
  }

  app.patch("/api/clients/:clientId/team/:userId", isAuthenticated, async (req, res) => {
    const ctx = await access(req, res, true);
    if (!ctx) return;
    const parsed = z.object({ clientRole: z.enum(["owner", "member"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose owner or member." });
    const target = await teamMember(ctx.client.id, String(req.params.userId));
    if (!target) return res.status(404).json({ error: "Not on this workspace's team" });
    if (parsed.data.clientRole === "member" && clientRoleOf(target) === "owner" && (await owners(ctx.client.id)).length <= 1) {
      return res.status(400).json({ error: "A workspace needs at least one owner." });
    }
    await db.update(users).set({ clientRole: parsed.data.clientRole, updatedAt: new Date() }).where(eq(users.id, target.id));
    res.json(memberView({ ...target, clientRole: parsed.data.clientRole }));
  });

  app.delete("/api/clients/:clientId/team/:userId", isAuthenticated, async (req, res) => {
    const ctx = await access(req, res, true);
    if (!ctx) return;
    const target = await teamMember(ctx.client.id, String(req.params.userId));
    if (!target) return res.status(404).json({ error: "Not on this workspace's team" });
    if (clientRoleOf(target) === "owner" && (await owners(ctx.client.id)).length <= 1) {
      return res.status(400).json({ error: "A workspace needs at least one owner. Make someone else an owner first." });
    }
    // Deleting the login also ends every session it has.
    await storage.deleteUser(target.id);
    res.json({ success: true });
  });

  // ---- Accepting an invite (no login needed) ----

  async function findInvite(token: string) {
    if (!token || token.length > 200) return undefined;
    const [invite] = await db.select().from(invites).where(eq(invites.token, token));
    return invite?.role === "agency_client" && invite.clientAccess?.length === 1 ? invite : undefined;
  }

  app.get("/api/invites/:token", async (req, res) => {
    const invite = await findInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: "This invite link isn't valid." });
    const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, invite.clientAccess![0]));
    const status = invite.usedAt ? "used" : invite.expiresAt && invite.expiresAt.getTime() < Date.now() ? "expired" : "valid";
    res.json({ email: invite.email, workspaceName: client?.name ?? "EventHQ", clientRole: invite.clientRole ?? "owner", status });
  });

  const acceptSchema = z.object({
    firstName: z.string().trim().min(1, "Enter your first name.").max(100),
    lastName: z.string().trim().max(100).optional().default(""),
    password: z.string(),
  });

  app.post("/api/invites/:token/accept", async (req: any, res) => {
    try {
      if (await countAttempt(`invite:${req.ip || "unknown"}`, LOGIN_WINDOW_MS) > 20) {
        return res.status(429).json({ error: TOO_MANY_ATTEMPTS });
      }
      const parsed = acceptSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Fill in every field." });
      const problem = passwordProblem(parsed.data.password);
      if (problem) return res.status(400).json({ error: problem });
      const invite = await findInvite(req.params.token);
      if (!invite || !invite.email) return res.status(404).json({ error: "This invite link isn't valid." });
      if (invite.usedAt) return res.status(410).json({ error: "This invite was already used. Sign in instead." });
      if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
        return res.status(410).json({ error: "This invite has expired. Ask for a new one." });
      }
      if (await storage.getUserByEmail(invite.email)) {
        return res.status(409).json({ error: "That email already has a login. Sign in instead." });
      }
      const clientId = invite.clientAccess![0];
      const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
      if (!client?.isActive) return res.status(403).json({ error: "This workspace is not active. Contact your administrator." });

      // Claim the invite first, so two tabs racing the same link cannot both create a login.
      const claimed = await db.update(invites).set({ usedAt: new Date() })
        .where(and(eq(invites.id, invite.id), isNull(invites.usedAt))).returning({ id: invites.id });
      if (!claimed.length) return res.status(410).json({ error: "This invite was already used. Sign in instead." });

      let user: User;
      try {
        user = await storage.createUserWithPassword({
          email: invite.email,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName || null,
          role: "agency_client",
          agencyId: client.agencyId,
          clientAccess: [clientId],
          clientRole: invite.clientRole === "member" ? "member" : "owner",
        }, parsed.data.password);
      } catch (error) {
        await db.update(invites).set({ usedAt: null }).where(eq(invites.id, invite.id));
        throw error;
      }
      await db.update(invites).set({ usedById: user.id }).where(eq(invites.id, invite.id));
      if (!await hasActiveWorkspace(user)) return res.status(403).json({ error: "This workspace is not active." });
      startLoginSession(req, res, user);
    } catch (error) {
      console.error("[team] accept invite failed:", error);
      res.status(500).json({ error: "Could not accept the invite right now." });
    }
  });

  // ---- Forgot / reset password (no login needed) ----

  app.post("/api/password/forgot", async (req, res) => {
    const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(320) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid email address." });
    try {
      const [byIp, byEmail] = await Promise.all([
        countAttempt(`forgot-ip:${req.ip || "unknown"}`, LOGIN_WINDOW_MS),
        countAttempt(`forgot-email:${parsed.data.email}`, LOGIN_WINDOW_MS),
      ]);
      if (byIp > 5 || byEmail > 3) return res.status(429).json({ error: TOO_MANY_ATTEMPTS });
      const user = await storage.getUserByEmail(parsed.data.email);
      // Same answer whether or not the account exists, so the form can't be used to find accounts.
      if (user && user.role !== "agency_employee" && !user.id.startsWith("demo-client:")) {
        if (!features().email) {
          console.warn("[auth] password reset requested but email is not configured");
        } else {
          const token = newToken();
          await db.insert(passwordResetTokens).values({
            userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS),
          });
          await sendPasswordResetEmail({ to: user.email!, link: `${appUrl()}/reset-password/${token}` });
        }
      }
      res.json({ message: FORGOT_MESSAGE });
    } catch (error) {
      console.error("[auth] forgot password failed:", (error as Error).message);
      res.json({ message: FORGOT_MESSAGE });
    }
  });

  async function liveResetToken(token: string) {
    if (!token || token.length > 200) return undefined;
    const [row] = await db.select().from(passwordResetTokens).where(and(
      eq(passwordResetTokens.tokenHash, sha256(token)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    ));
    return row;
  }

  app.get("/api/password/reset/:token", async (req, res) => {
    res.json({ valid: !!await liveResetToken(req.params.token) });
  });

  app.post("/api/password/reset", async (req, res) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      const problem = passwordProblem(req.body?.password);
      if (problem) return res.status(400).json({ error: problem });
      const row = await liveResetToken(token);
      if (!row) return res.status(400).json({ error: "This reset link has expired or was already used. Ask for a new one." });
      const used = await db.update(passwordResetTokens).set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt))).returning({ id: passwordResetTokens.id });
      if (!used.length) return res.status(400).json({ error: "This reset link was already used." });
      // Setting the password also signs the account out everywhere.
      await storage.setUserPassword(row.userId, req.body.password);
      // Any other reset links for this account stop working too.
      await db.update(passwordResetTokens).set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, row.userId), isNull(passwordResetTokens.usedAt)));
      res.json({ success: true });
    } catch (error) {
      console.error("[auth] password reset failed:", error);
      res.status(500).json({ error: "Could not reset the password right now." });
    }
  });
}
