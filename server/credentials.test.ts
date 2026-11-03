import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, maskSecret, needsReencryption } from "./credentials";

test("credentials round-trip and are not stored in plain text", () => {
  process.env.SESSION_SECRET ||= "test-session-secret";
  const stored = encryptSecret("sk_live_abc123");
  assert.ok(!stored.includes("sk_live_abc123"));
  assert.equal(decryptSecret(stored), "sk_live_abc123");
  assert.notEqual(encryptSecret("same"), encryptSecret("same"), "each encryption uses a fresh IV");
});

test("tampered ciphertext is rejected", () => {
  process.env.SESSION_SECRET ||= "test-session-secret";
  const [v, iv, tag, ct] = encryptSecret("secret").split(":");
  const flipped = Buffer.from(ct, "base64url");
  flipped[0] ^= 1;
  assert.throws(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join(":")));
});

test("values made before CREDENTIALS_KEY was set stay readable and are flagged for re-encryption", () => {
  process.env.SESSION_SECRET ||= "test-session-secret";
  const saved = process.env.CREDENTIALS_KEY;
  delete process.env.CREDENTIALS_KEY;
  const old = encryptSecret("token");
  process.env.CREDENTIALS_KEY = "a-long-random-credentials-key-for-tests";
  try {
    assert.equal(decryptSecret(old), "token");
    assert.equal(needsReencryption(old), true);
    assert.equal(needsReencryption(encryptSecret("token")), false);
  } finally {
    if (saved === undefined) delete process.env.CREDENTIALS_KEY; else process.env.CREDENTIALS_KEY = saved;
  }
});

test("masking keeps the provider prefix and last four characters only", () => {
  assert.equal(maskSecret("sk_live_51Habcdefghij1234"), "sk_live_…1234");
  assert.equal(maskSecret("short"), "••••");
});
