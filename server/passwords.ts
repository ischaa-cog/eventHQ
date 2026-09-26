import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Stored as "salt:hash" (16-byte salt, 64-byte scrypt key, both hex). The plain password is never stored.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const actual = await derive(password, Buffer.from(salt, "hex"));
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

// Burns the same work as a real check, so unknown emails can't be told apart by response time.
const DUMMY_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;
export async function verifyAgainstNothing(password: string): Promise<false> {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}

export function passwordProblem(password: unknown): string | undefined {
  if (typeof password !== "string") return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  return undefined;
}
