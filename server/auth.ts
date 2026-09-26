import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import type { User } from "@shared/schema";
import { storage } from "./storage";
import { verifyAgainstNothing, verifyPassword } from "./passwords";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
let globalLoginAttempts = { count: 0, resetAt: 0 };
let activeVerifications = 0;

async function isIsolatedDemoUser(user: User | undefined): Promise<boolean> {
  if (!user?.id.startsWith("demo-client:") ||
      (user.role !== "agency_client" && user.role !== "agency_admin") ||
      !user.agencyId || user.clientAccess?.length !== 1) return false;
  const [assignedClient, agencyClients] = await Promise.all([
    storage.getClient(user.clientAccess[0]),
    storage.getClients(user.agencyId),
  ]);
  return assignedClient?.agencyId === user.agencyId &&
    agencyClients.length === 1 && agencyClients[0].id === assignedClient.id;
}

// A client can only sign in while their workspace is active.
async function hasActiveWorkspace(user: User): Promise<boolean> {
  if (user.role !== "agency_client") return true;
  const clientId = user.clientAccess?.[0];
  if (!clientId) return false;
  return (await storage.getClient(clientId))?.isActive === true;
}

export const enforceDemoReadOnly: RequestHandler = (req, res, next) => {
  if (!(req.user as any)?.demoLogin) return next();
  if (req.method !== "GET" && req.method !== "HEAD" ||
      /\/(authorize|callback|webhook-token)(\/|$)/.test(req.path)) {
    return res.status(403).json({ error: "Demo access is read-only." });
  }
  next();
};

export function getSession() {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: SESSION_TTL_MS,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Production is served over https; local dev over plain http, where a secure cookie is never set.
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_MS,
    },
  });
}

export function getPostLoginRedirect(
  persistedUser?: { role?: string | null; clientAccess?: number[] | null },
): string {
  if (persistedUser?.role !== "agency_client") return "/";

  const assignedClientIds = persistedUser.clientAccess;
  if (!Array.isArray(assignedClientIds)) return "/";

  const uniqueClientIds = assignedClientIds.filter(
    (clientId, index) => assignedClientIds.indexOf(clientId) === index,
  );
  if (
    uniqueClientIds.length === 1 &&
    Number.isSafeInteger(uniqueClientIds[0]) &&
    uniqueClientIds[0] > 0
  ) {
    return `/client/${uniqueClientIds[0]}/dashboard`;
  }

  return "/";
}

export function loginPortalMismatch(portal: unknown, role: string | null | undefined): boolean {
  return (portal === "client" && role !== "agency_client") ||
    (portal === "admin" && role === "agency_client");
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.post("/api/login", async (req: any, res) => {
    const email = req.body?.email;
    const password = req.body?.password;
    if (typeof email !== "string" || email.length > 320 || typeof password !== "string" || password.length > 200) {
      return res.status(400).json({ error: "Enter an email and password." });
    }
    const ip = req.ip || "unknown";
    const now = Date.now();
    const attempts = loginAttempts.get(ip);
    if (globalLoginAttempts.resetAt <= now) {
      globalLoginAttempts = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
      loginAttempts.clear();
    }
    if (attempts && attempts.resetAt > now && attempts.count >= 5 ||
        globalLoginAttempts.count >= 100 || activeVerifications >= 2) {
      return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    }
    // Count before asynchronous work, so concurrent requests cannot bypass the limit.
    globalLoginAttempts.count++;
    loginAttempts.set(ip, {
      count: attempts && attempts.resetAt > now ? attempts.count + 1 : 1,
      resetAt: now + LOGIN_WINDOW_MS,
    });
    try {
      const user = await storage.getUserByEmail(email);
      const passwordHash = user ? await storage.getPasswordHash(user.id) : undefined;
      const isDemo = !!user?.id.startsWith("demo-client:");
      let valid = false;
      activeVerifications++;
      try {
        valid = passwordHash
          ? await verifyPassword(password, passwordHash)
          : await verifyAgainstNothing(password);
      } finally {
        activeVerifications--;
      }
      if (valid && isDemo) valid = await isIsolatedDemoUser(user);
      if (!valid || !user) {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      if (loginPortalMismatch(req.body?.portal, user.role)) {
        return res.status(403).json({
          error: user.role === "agency_client"
            ? "This is a client account. Use Client Login."
            : "This is a staff account. Use Staff Login.",
        });
      }
      if (!await hasActiveWorkspace(user)) {
        return res.status(403).json({ error: "This workspace is not active. Contact your administrator." });
      }
      loginAttempts.delete(ip);
      req.session.regenerate((sessionError: Error | null) => {
        if (sessionError) return res.status(500).json({ error: "Could not start session." });
        req.logIn({
          claims: { sub: user.id },
          expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_MS / 1000,
          ...(isDemo ? { demoLogin: true } : {}),
        }, (loginError: Error | null) => {
          if (loginError) return res.status(500).json({ error: "Could not start session." });
          return res.json({ redirect: getPostLoginRedirect(user) });
        });
      });
    } catch (error) {
      console.error("[auth] login failed:", error);
      return res.status(500).json({ error: "Could not sign in right now." });
    }
  });

  app.get("/api/logout", async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const user = userId ? await storage.getUser(userId).catch(() => undefined) : undefined;
    const target = user?.role === "agency_client" || req.user?.demoLogin ? "/client-login" : "/admin-login";
    req.logout(() => req.session.destroy(() => res.redirect(target)));
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at || Math.floor(Date.now() / 1000) > user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (user.demoLogin && !await isIsolatedDemoUser(await storage.getUser(user.claims?.sub))) {
    return res.status(403).json({ message: "Demo workspace is not isolated." });
  }
  return next();
};
