// Read and write per-client integration connections. Secrets are encrypted at rest and only
// ever leave this module masked.
import { and, eq } from "drizzle-orm";
import { integrationConnections, type IntegrationConnection, type IntegrationProvider } from "@shared/schema";
import { db } from "../storage";
import { decryptJson, decryptSecret, encryptJson, encryptSecret, maskSecret } from "../credentials";

export type ConnectionCredentials = Record<string, string>;

export type PublicConnection = {
  id: number;
  clientId: number;
  provider: string;
  externalAccountId: string;
  displayName: string | null;
  status: string;
  lastSyncAt: Date | null;
  lastWebhookAt: Date | null;
  lastError: string | null;
  hasWebhookSecret: boolean;
  credentialHints: Record<string, string>;
  settings: unknown;
};

export function toPublic(row: IntegrationConnection): PublicConnection {
  let credentialHints: Record<string, string> = {};
  try {
    const creds = decryptJson<ConnectionCredentials>(row.credentialsCiphertext) ?? {};
    credentialHints = Object.fromEntries(Object.entries(creds).map(([k, v]) => [k, maskSecret(String(v))]));
  } catch {
    credentialHints = { error: "unreadable" };
  }
  return {
    id: row.id, clientId: row.clientId, provider: row.provider, externalAccountId: row.externalAccountId,
    displayName: row.displayName, status: row.status, lastSyncAt: row.lastSyncAt, lastWebhookAt: row.lastWebhookAt,
    lastError: row.lastError, hasWebhookSecret: !!row.webhookSecretCiphertext, credentialHints, settings: row.settings,
  };
}

export async function listConnections(clientId: number): Promise<IntegrationConnection[]> {
  return db.select().from(integrationConnections).where(eq(integrationConnections.clientId, clientId));
}

export async function getConnection(id: number): Promise<IntegrationConnection | undefined> {
  const [row] = await db.select().from(integrationConnections).where(eq(integrationConnections.id, id));
  return row;
}

export async function connectionsFor(clientId: number, provider: IntegrationProvider) {
  return db.select().from(integrationConnections)
    .where(and(eq(integrationConnections.clientId, clientId), eq(integrationConnections.provider, provider)));
}

export async function activeConnections(provider?: IntegrationProvider) {
  const rows = await db.select().from(integrationConnections).where(eq(integrationConnections.status, "active"));
  return provider ? rows.filter((r) => r.provider === provider) : rows;
}

export function credentialsOf(row: IntegrationConnection): ConnectionCredentials {
  return decryptJson<ConnectionCredentials>(row.credentialsCiphertext) ?? {};
}

export function webhookSecretOf(row: IntegrationConnection): string | undefined {
  return row.webhookSecretCiphertext ? decryptSecret(row.webhookSecretCiphertext) : undefined;
}

export async function saveConnection(input: {
  clientId: number;
  provider: IntegrationProvider;
  externalAccountId?: string;
  displayName?: string | null;
  credentials?: ConnectionCredentials; // replaces stored credentials when given
  webhookSecret?: string | null; // undefined keeps, null clears
  settings?: unknown;
}): Promise<IntegrationConnection> {
  const values: Partial<typeof integrationConnections.$inferInsert> = {
    clientId: input.clientId,
    provider: input.provider,
    externalAccountId: input.externalAccountId ?? "",
    displayName: input.displayName ?? null,
    status: "active",
    lastError: null,
    updatedAt: new Date(),
  };
  if (input.credentials) values.credentialsCiphertext = encryptJson(input.credentials);
  if (input.webhookSecret !== undefined) {
    values.webhookSecretCiphertext = input.webhookSecret ? encryptSecret(input.webhookSecret) : null;
  }
  if (input.settings !== undefined) values.settings = input.settings as any;
  const [row] = await db.insert(integrationConnections).values(values as any)
    .onConflictDoUpdate({
      target: [integrationConnections.clientId, integrationConnections.provider, integrationConnections.externalAccountId],
      set: values as any,
    })
    .returning();
  return row;
}

export async function markSynced(id: number, cursor?: string | null) {
  await db.update(integrationConnections)
    .set({ lastSyncAt: new Date(), lastError: null, status: "active", ...(cursor !== undefined ? { lastSyncCursor: cursor } : {}), updatedAt: new Date() })
    .where(eq(integrationConnections.id, id));
}

export async function markFailed(id: number, error: string) {
  await db.update(integrationConnections)
    .set({ lastError: error.slice(0, 1000), status: "error", updatedAt: new Date() })
    .where(eq(integrationConnections.id, id));
}

export async function markWebhook(id: number) {
  await db.update(integrationConnections).set({ lastWebhookAt: new Date() }).where(eq(integrationConnections.id, id));
}
