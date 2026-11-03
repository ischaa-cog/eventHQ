// Encryption for per-client integration secrets (API keys, access tokens, webhook signing secrets).
// AES-256-GCM. Stored as "<keyVersion>:<iv>:<tag>:<ciphertext>" (base64url parts).
//
// Key: CREDENTIALS_KEY when set (any long random string). Until it is added in Vercel, a key is
// derived from SESSION_SECRET with a separate label, so integrations work without dashboard
// access. The version prefix records which key encrypted each value; once CREDENTIALS_KEY is set,
// `rotateCredentials()` re-encrypts old values with it. Rotating SESSION_SECRET before that would
// make "s1" values unreadable, so set CREDENTIALS_KEY first.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

type KeyVersion = "k1" | "s1";

function deriveKey(secret: string, label: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "eventhq-credentials", label, 32));
}

function keyFor(version: KeyVersion): Buffer {
  if (version === "k1") {
    const secret = process.env.CREDENTIALS_KEY;
    if (!secret) throw new Error("CREDENTIALS_KEY is not set; cannot read this credential.");
    return deriveKey(secret, "k1");
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set; cannot read this credential.");
  return deriveKey(secret, "s1");
}

export function currentKeyVersion(): KeyVersion {
  return process.env.CREDENTIALS_KEY ? "k1" : "s1";
}

const b64 = (buf: Buffer) => buf.toString("base64url");

export function encryptSecret(plaintext: string): string {
  const version = currentKeyVersion();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(version), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [version, b64(iv), b64(cipher.getAuthTag()), b64(ciphertext)].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if ((version !== "k1" && version !== "s1") || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unrecognized credential format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFor(version), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T>(stored: string | null | undefined): T | undefined {
  return stored ? (JSON.parse(decryptSecret(stored)) as T) : undefined;
}

// True when a value was encrypted with an older key than the one now configured.
export function needsReencryption(stored: string | null | undefined): boolean {
  return !!stored && !stored.startsWith(`${currentKeyVersion()}:`);
}

// Shows enough of a secret to recognize it ("sk_live_…a1b2") without revealing it.
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••";
  const prefix = secret.match(/^[a-z]+_(?:live_|test_)?/i)?.[0] ?? "";
  return `${prefix}…${secret.slice(-4)}`;
}
