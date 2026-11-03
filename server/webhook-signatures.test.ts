import test from "node:test";
import assert from "node:assert/strict";
import { signStandardWebhook, signStripe, verifyStandardWebhook, verifyStripeSignature } from "./webhook-signatures";

const body = JSON.stringify({ type: "payment.succeeded", data: { id: "pay_1" } });
const now = Date.UTC(2026, 10, 3, 12);
const ts = Math.floor(now / 1000);

test("Standard Webhooks signatures verify for raw and whsec_ secrets", () => {
  for (const secret of ["raw-whop-secret", `whsec_${Buffer.from("k3y-bytes").toString("base64")}`]) {
    const headers = { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": signStandardWebhook(body, secret, "msg_1", ts) };
    assert.equal(verifyStandardWebhook(body, headers, secret, now), true);
    assert.equal(verifyStandardWebhook(body + " ", headers, secret, now), false, "changed body");
    assert.equal(verifyStandardWebhook(body, headers, "other-secret", now), false, "wrong secret");
    assert.equal(verifyStandardWebhook(body, headers, secret, now + 10 * 60_000), false, "stale timestamp");
  }
  assert.equal(verifyStandardWebhook(body, {}, "s", now), false, "missing headers");
});

test("Stripe signatures verify and reject tampering", () => {
  const header = signStripe(body, "whsec_stripe", ts);
  assert.equal(verifyStripeSignature(body, header, "whsec_stripe", now), true);
  assert.equal(verifyStripeSignature(body.replace("pay_1", "pay_2"), header, "whsec_stripe", now), false);
  assert.equal(verifyStripeSignature(body, header, "whsec_other", now), false);
  assert.equal(verifyStripeSignature(body, undefined, "whsec_stripe", now), false);
});
