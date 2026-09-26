import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { scrypt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { demoCredentials, type User } from "@shared/schema";
import { db, storage } from "./storage";

const demoAttempts = new Map<string, { count: number; resetAt: number }>();
const DEMO_WINDOW_MS = 15 * 60 * 1000;
let globalDemoAttempts = { count: 0, resetAt: 0 };
let activeDemoVerifications = 0;

async function validDemoPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, "hex"), 64, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

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

export const enforceDemoReadOnly: RequestHandler = (req, res, next) => {
  if (!(req.user as any)?.demoLogin) return next();
  if (req.method !== "GET" && req.method !== "HEAD" ||
      /\/(authorize|callback|webhook-token)(\/|$)/.test(req.path)) {
    return res.status(403).json({ error: "Demo access is read-only." });
  }
  next();
};

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any, inviteToken?: string): Promise<{ authorized: boolean; reason?: string }> {
  const userId = claims["sub"];
  const email = claims["email"];
  
  // Check if user already exists by ID
  let existingUser = await storage.getUser(userId);
  
  // Fallback: look up by email (handles role mismatches / ID changes)
  if (!existingUser && email) {
    existingUser = await storage.getUserByEmail(email);
  }

  if (existingUser) {
    // A demo identity must never be claimed by the external identity provider.
    if (existingUser.id.startsWith("demo-client:")) {
      return { authorized: false, reason: "no_invite" };
    }
    // Former employee accounts are disabled, including when matched by email.
    if (existingUser.role === "agency_employee") {
      return { authorized: false, reason: "disabled" };
    }
    // Any user already in the database is allowed in — role governs permissions
    await storage.upsertUser({
      id: userId,
      email: email,
      firstName: claims["first_name"],
      lastName: claims["last_name"],
      profileImageUrl: claims["profile_image_url"],
    });
    return { authorized: true };
  }

  // Bootstrap a new installation: the first authenticated account becomes the owner.
  // Once any user exists, all new accounts must use the normal invite flow below.
  const firstOwner = await storage.bootstrapOwnerIfFirst({
    id: userId,
    email,
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
  if (firstOwner) {
    return { authorized: true };
  }
  
  // Check for valid invite token first
  if (inviteToken) {
    const invite = await storage.getInviteByToken(inviteToken);
    if (invite && (invite.role === "agency_admin" || invite.role === "agency_client") &&
        !invite.usedAt && (!invite.email || invite.email.toLowerCase() === email?.toLowerCase())) {
      const isExpired = invite.expiresAt && new Date(invite.expiresAt) < new Date();
      if (!isExpired) {
        // Create/update user and assign role from invite
        await storage.upsertUser({
          id: userId,
          email: email,
          firstName: claims["first_name"],
          lastName: claims["last_name"],
          profileImageUrl: claims["profile_image_url"],
        });
        await storage.updateUserRole(
          userId,
          invite.role,
          invite.agencyId ?? undefined,
          invite.clientAccess ?? undefined
        );
        await storage.markInviteUsed(inviteToken, userId);
        return { authorized: true };
      }
    }
  }
  
  // Check for invite by email
  if (email) {
    const emailInvite = await storage.getInviteByEmail(email);
    if (emailInvite && (emailInvite.role === "agency_admin" || emailInvite.role === "agency_client")) {
      const isExpired = emailInvite.expiresAt && new Date(emailInvite.expiresAt) < new Date();
      if (!isExpired) {
        // Create/update user and assign role from invite
        await storage.upsertUser({
          id: userId,
          email: email,
          firstName: claims["first_name"],
          lastName: claims["last_name"],
          profileImageUrl: claims["profile_image_url"],
        });
        await storage.updateUserRole(
          userId,
          emailInvite.role,
          emailInvite.agencyId ?? undefined,
          emailInvite.clientAccess ?? undefined
        );
        await storage.markInviteUsed(emailInvite.token, userId);
        return { authorized: true };
      }
    }
  }
  
  // No valid invite found - deny access
  return { authorized: false, reason: "no_invite" };
}

export function getPostLoginRedirect(
  persistedUser?: { role?: string | null; clientAccess?: number[] | null },
): string {
  if (persistedUser?.role === "agency_employee") return "/access-denied";
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

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user: any = {};
    updateUserSession(user, tokens);
    
    const authResult = await upsertUser(tokens.claims());
    if (!authResult.authorized) {
      user.accessDenied = true;
      user.denialReason = authResult.reason;
    }
    
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req: any, res, next) => {
    if (req.query.invite_token) {
      req.session.inviteToken = req.query.invite_token;
    }
    req.session.loginPortal = req.query.portal === "client" || req.query.portal === "admin"
      ? req.query.portal
      : undefined;
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  // Only separately provisioned demo identities can use password sign-in.
  app.post("/api/demo-login", async (req: any, res) => {
    const email = req.body?.email;
    const password = req.body?.password;
    if (typeof email !== "string" || email.length > 320 || typeof password !== "string" || password.length > 200) {
      return res.status(400).json({ error: "Enter an email and password." });
    }
    const ip = req.ip || "unknown";
    const now = Date.now();
    const attempts = demoAttempts.get(ip);
    if (globalDemoAttempts.resetAt <= now) {
      globalDemoAttempts = { count: 0, resetAt: now + DEMO_WINDOW_MS };
      demoAttempts.clear();
    }
    if (attempts && attempts.resetAt > now && attempts.count >= 5 ||
        globalDemoAttempts.count >= 100 || activeDemoVerifications >= 2) {
      return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    }
    // Count before asynchronous work, so concurrent requests cannot bypass the limit.
    globalDemoAttempts.count++;
    demoAttempts.set(ip, {
      count: attempts && attempts.resetAt > now ? attempts.count + 1 : 1,
      resetAt: now + DEMO_WINDOW_MS,
    });
    try {
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      const credential = user?.id.startsWith("demo-client:")
        ? (await db.select().from(demoCredentials).where(eq(demoCredentials.userId, user.id)).limit(1))[0]
        : undefined;
      let valid = false;
      if (credential && await isIsolatedDemoUser(user)) {
        activeDemoVerifications++;
        try {
          valid = await validDemoPassword(password, credential.passwordHash);
        } finally {
          activeDemoVerifications--;
        }
      }
      if (!valid || !user) {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      if (loginPortalMismatch(req.body?.portal, user.role)) {
        return res.status(403).json({
          error: user.role === "agency_client"
            ? "This is a client account. Use Client Login."
            : "This account has internal access. Use Admin Login or contact your agency administrator if you need client access.",
        });
      }
      demoAttempts.delete(ip);
      req.session.regenerate((sessionError: Error | null) => {
        if (sessionError) return res.status(500).json({ error: "Could not start session." });
        req.logIn({
          claims: { sub: user.id },
          expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
          demoLogin: true,
        }, (loginError: Error | null) => {
          if (loginError) return res.status(500).json({ error: "Could not start session." });
          return res.json({ redirect: getPostLoginRedirect(user) });
        });
      });
    } catch (error) {
      console.error("[auth] demo login failed:", error);
      return res.status(500).json({ error: "Could not sign in right now." });
    }
  });

  app.get("/api/callback", async (req: any, res, next) => {
    ensureStrategy(req.hostname);
    const strategyName = `replitauth:${req.hostname}`;
    const loginPortal = req.session?.loginPortal;

    passport.authenticate(strategyName, async (err: any, user: any) => {
      if (err || !user) {
        console.error("[auth] callback error:", err?.message ?? "no user");
        return res.redirect("/api/login");
      }

      // Re-run upsert with invite token now that we have the user
      const inviteToken = req.session?.inviteToken;
      if (inviteToken) {
        const authResult = await upsertUser(user.claims, inviteToken);
        delete req.session.inviteToken;
        if (!authResult.authorized) {
          user.accessDenied = true;
          user.denialReason = authResult.reason;
        } else {
          delete user.accessDenied;
        }
      }

      req.logIn(user, async (loginErr: any) => {
        if (loginErr) {
          console.error("[auth] logIn error:", loginErr.message);
          return res.redirect("/api/login");
        }
        if (user.accessDenied) {
          return res.redirect("/access-denied");
        }
        try {
          // Route based on persisted authorization data, never provider claims or
          // client-supplied redirect parameters.
          const persistedUser = await storage.getUser(user.claims?.sub);
          delete req.session.loginPortal;
          if (!persistedUser) return res.redirect("/access-denied");
          if (persistedUser.role === "agency_employee") return res.redirect("/access-denied");
          if (loginPortalMismatch(loginPortal, persistedUser?.role)) {
            return res.redirect(loginPortal === "client" ? "/client-login?account=internal" : "/");
          }
          return res.redirect(getPostLoginRedirect(persistedUser));
        } catch (error: any) {
          console.error("[auth] failed to load persisted user for redirect:", error?.message ?? error);
          return res.redirect("/");
        }
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    if ((req.user as any)?.demoLogin) {
      return req.logout(() => req.session.destroy(() => res.redirect("/client-login")));
    }
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (user.demoLogin && !await isIsolatedDemoUser(await storage.getUser(user.claims?.sub))) {
    return res.status(403).json({ message: "Demo workspace is not isolated." });
  }

  // Block users who were flagged as access denied
  if (user.accessDenied) {
    return res.status(403).json({ message: "Access denied. You need an invitation to use this application." });
  }
  const persistedUser = await storage.getUser(user.claims?.sub);
  if (!persistedUser || persistedUser.role === "agency_employee") {
    return res.status(403).json({ message: "This account is disabled. Contact an administrator." });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
