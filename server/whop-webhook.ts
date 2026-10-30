import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { db, storage } from "./storage";
import { sales, salesSources } from "@shared/schema";

// Whop sends Standard Webhooks envelopes: { id, type, timestamp, data }.
// Only completed payments and completed refunds change revenue; everything else is acknowledged and ignored.
type WhopSale = {
  dedupeKey: string; externalId: string; amount: number; currency: string; status: "paid" | "refunded";
  refundAmount: number; productName: string | null; customerEmail: string | null; customerName: string | null; saleDate: Date;
};

const num = (v: unknown) => (typeof v === "number" || typeof v === "string") && Number.isFinite(Number(v)) ? Number(v) : null;
const str = (v: unknown, max: number) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const date = (...values: unknown[]) => {
  for (const v of values) {
    const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : typeof v === "string" ? new Date(v) : null;
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  return new Date();
};
const email = (v: unknown) => { const e = str(v, 320); return e && /^[^\s@]+@[^\s@]+$/.test(e) ? e.toLowerCase() : null; };

// Returns the sale to record, "remove" when a refund was reversed, or null when the event doesn't affect revenue.
export function whopEventToSale(body: any): WhopSale | { remove: string } | null {
  const type = body?.type ?? body?.action;
  const d = body?.data;
  if (!d || typeof d !== "object" || typeof d.id !== "string") return null;
  const currency = (str(d.currency, 10) ?? "usd").toUpperCase();
  if (type === "payment.succeeded") {
    const amount = num(d.total) ?? num(d.subtotal) ?? num(d.usd_total) ?? num(d.final_amount);
    if (amount === null || amount < 0) return null;
    return {
      dedupeKey: `whop:${d.id}`, externalId: d.id, amount, currency, status: "paid", refundAmount: 0,
      productName: str(d.product?.title, 500) ?? str(d.plan?.title, 500),
      customerEmail: email(d.user?.email ?? d.email), customerName: str(d.user?.name ?? d.user?.username, 300),
      saleDate: date(d.paid_at, d.created_at, body.timestamp),
    };
  }
  if (type === "refund.created" || type === "refund.updated") {
    const key = `whop-refund:${d.id}`;
    if (d.status === "failed" || d.status === "canceled") return { remove: key };
    if (d.status !== "succeeded") return null;
    const amount = num(d.amount);
    if (amount === null || amount <= 0) return null;
    return {
      dedupeKey: key, externalId: d.id, amount, currency, status: "refunded", refundAmount: amount,
      productName: str(d.payment?.product?.title, 500) ?? "Whop refund",
      customerEmail: email(d.payment?.user?.email), customerName: str(d.payment?.user?.name, 300),
      saleDate: date(d.created_at, body.timestamp),
    };
  }
  return null;
}

export function registerWhopWebhook(app: Express) {
  app.post("/api/webhooks/whop", async (req, res) => {
    try {
      const { token } = req.query;
      if (!token || typeof token !== "string") return res.status(401).json({ error: "Missing or invalid token" });
      const client = await storage.getClientByWebhookToken(token);
      if (!client) return res.status(401).json({ error: "Invalid webhook token" });

      const sale = whopEventToSale(req.body);
      if (!sale) return res.status(200).json({ success: true, ignored: true });
      if ("remove" in sale) {
        await db.delete(sales).where(and(eq(sales.clientId, client.id), eq(sales.dedupeKey, sale.remove)));
        return res.status(200).json({ success: true, removed: true });
      }
      const value = {
        clientId: client.id, amount: sale.amount.toFixed(2), currency: sale.currency, productName: sale.productName,
        customerEmail: sale.customerEmail, customerName: sale.customerName, saleDate: sale.saleDate,
        externalId: sale.externalId, source: "whop", status: sale.status,
        metadata: { refundAmount: sale.refundAmount }, dedupeKey: sale.dedupeKey,
      };
      // Whop retries deliveries, so the same payment or refund updates its existing row.
      const [row] = await db.insert(sales).values(value as any)
        .onConflictDoUpdate({ target: [sales.clientId, sales.dedupeKey], set: value as any }).returning({ id: sales.id });
      await db.insert(salesSources).values({
        clientId: client.id, processor: "whop", configured: true, verified: true, lastSync: new Date(), error: null,
      }).onConflictDoUpdate({
        target: [salesSources.clientId, salesSources.processor],
        set: { configured: true, verified: true, lastSync: new Date(), error: null },
      });
      res.status(200).json({ success: true, saleId: row?.id });
    } catch (error: any) {
      console.error("Error processing Whop webhook:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });
}
