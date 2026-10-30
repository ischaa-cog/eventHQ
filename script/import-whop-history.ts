// Backfills a partner's past Whop payments and refunds into the Live Sales Feed.
// A webhook only delivers new events, so this replays the history through the same webhook URL;
// sales are keyed by Whop id, so re-running (or a later webhook retry) never double-counts.
//
// Run (dry run first, then add --apply):
//   WHOP_API_KEY=apik_... npx tsx script/import-whop-history.ts "<workspace Whop webhook URL>" [--apply]
import { whopEventToSale } from "../server/whop-webhook";

const [webhookUrl] = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
const apply = process.argv.includes("--apply");
const apiKey = process.env.WHOP_API_KEY;
if (!webhookUrl || !apiKey) {
  console.error('Usage: WHOP_API_KEY=apik_... npx tsx script/import-whop-history.ts "<webhook URL>" [--apply]');
  process.exit(1);
}

async function listAll(resource: "payments" | "refunds"): Promise<any[]> {
  const rows: any[] = [];
  let after: string | undefined;
  do {
    const url = new URL(`https://api.whop.com/api/v1/${resource}`);
    url.searchParams.set("first", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`Whop ${resource}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page.data);
    after = page.page_info?.has_next_page ? page.page_info.end_cursor : undefined;
  } while (after);
  return rows;
}

const payments = await listAll("payments");
const refunds = await listAll("refunds");
const paymentsById = new Map(payments.map(payment => [payment.id, payment]));

// Shape each record like the webhook event Whop would have sent for it.
const events = [
  ...payments.filter(payment => payment.status === "paid")
    .map(payment => ({ type: "payment.succeeded", data: payment })),
  // Refunds only carry the payment id; attach the payment so the refund row names the buyer and product.
  ...refunds.map(refund => ({ type: "refund.created", data: { ...refund, payment: paymentsById.get(refund.payment_id) } })),
];

let paid = 0, refunded = 0, recorded = 0, skipped = 0;
for (const event of events) {
  const sale = whopEventToSale(event);
  if (!sale || "remove" in sale) { skipped++; continue; }
  if (sale.status === "paid") paid += sale.amount; else refunded += sale.refundAmount;
  recorded++;
  if (!apply) continue;
  const res = await fetch(webhookUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
  if (!res.ok) throw new Error(`Webhook refused ${event.data.id}: ${res.status} ${await res.text()}`);
}

console.log(`${payments.length} Whop payments and ${refunds.length} refunds found.`);
console.log(`${recorded} would change revenue: $${paid.toFixed(2)} paid, $${refunded.toFixed(2)} refunded, $${(paid - refunded).toFixed(2)} net.`);
console.log(`${skipped} skipped (unpaid, free or 100%-off orders, pending or canceled refunds).`);
console.log(apply ? "Sent to the webhook." : "Dry run: nothing sent. Add --apply to import.");
