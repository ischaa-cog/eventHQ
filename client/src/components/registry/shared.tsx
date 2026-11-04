// Shared pieces for the Event Registry screens: types, formatting, the list-of-values input,
// and the event form.
import { useId, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const TIERS = ["vip", "platinum", "mainOffer", "postCart"] as const;
export type Tier = typeof TIERS[number];
export const TIER_LABEL: Record<Tier, string> = { vip: "VIP", platinum: "Platinum", mainOffer: "Main offer", postCart: "Post-cart / back-end" };
export type TierProducts = Partial<Record<Tier, string[]>>;

export type Offer = { id: number; name: string; productNames: string[]; priceText: string | null; soldThrough: string | null; sharePercent: string; notes: string | null };
export type RegistryEventRow = {
  id: number; registryId: string | null; title: string; eventType: string; funnelRole: "main" | "mini" | null; feedsIntoId: number | null;
  eventStart: string; eventEnd: string | null; adsStart: string | null; cartOpen: string | null; cartClose: string | null; postCartEnd: string | null;
  pageLinks: string[]; adCampaignIds: string[]; products: TierProducts; notes: string | null; offers: Offer[];
};
export type Numbers = {
  adSpend: number; impressions: number; clicks: number; cpm: number | null; cpc: number | null; adLeads: number;
  optIns: number; optInRate: number | null; costPerOptIn: number | null;
  tiers: Record<Tier, { count: number; revenue: number }>;
  offers: Array<{ id: number; name: string; share: number; count: number; revenue: number; ourRevenue: number }>;
  contracted: number; collected: number; refunds: number; netRevenue: number; roas: number | null;
  cartOpenRevenue: number; postCartRevenue: number; buyers: number; orders: number;
};
export type Report = {
  id: number; registryId: string | null; title: string; type: string; role: "main" | "mini"; feedsIntoId: number | null;
  startDate: string; endDate: string | null; adsStart: string | null; cartOpen: string | null; cartClose: string | null; postCartEnd: string | null;
  own: Numbers; withMinis: Numbers | null; miniIds: number[];
  unmatchedInWindow: { sales: number; salesCount: number; adSpend: number; optIns: number }; conflicts: number;
};
export type Problem = { eventId: number | null; level: "error" | "warning"; message: string };
export type RegistryData = {
  settings: {
    eventCode: string | null; defaultProducts: TierProducts; contractValues: Array<{ productName: string; fullValue: string }>;
    dateRules?: DateRules;
  };
  events: RegistryEventRow[]; reports: Report[]; problems: Problem[];
  unmatched: { sales: number; spend: number; optIns: number; conflicts: number };
};
export type Suggestions = {
  products: Array<{ name: string; source: string; orders: number; lastSale: string }>;
  pages: Array<{ url: string; adSpend: number; optIns: number }>;
  campaigns: Array<{ id: string; name: string | null; spend: number }>;
};

export const usd = (v: number) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const usdCents = (v: number | null) => v === null ? "—" : (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
export const roasText = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}x`);
export const shortDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};
export const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  const body = raw.replace(/^\d+:\s*/, "");
  try { return JSON.parse(body).error || body; } catch { return body; }
};

// A list of values (product names, page links, campaign IDs) with suggestions from synced data.
export function ListInput({ label, values, onChange, suggestions = [], placeholder, help, testId }: {
  label: string; values: string[]; onChange: (v: string[]) => void;
  suggestions?: Array<{ value: string; hint?: string }>; placeholder?: string; help?: string; testId?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(";").map((p) => p.trim()).filter(Boolean);
    if (parts.length) onChange(Array.from(new Set([...values, ...parts])));
    setDraft("");
  };
  const options = useMemo(() => suggestions.filter((s) => !values.includes(s.value)).slice(0, 200), [suggestions, values]);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="max-w-full gap-1 py-1 pl-2.5 pr-1 text-xs font-normal">
              <span className="truncate">{v}</span>
              <button type="button" className="rounded p-1 hover:bg-background/50" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          id={id} list={`${id}-list`} className="h-11" placeholder={placeholder} value={draft} data-testid={testId}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
        />
        <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => add(draft)} disabled={!draft.trim()}>Add</Button>
      </div>
      <datalist id={`${id}-list`}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.hint}</option>)}
      </datalist>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

export type DateRules = { cartDays: number; followUpDays: number; adsLookbackDays: number };

export type EventFormValue = {
  title: string; eventType: string; funnelRole: "main" | "mini"; feedsIntoId: number | null;
  adsStart: string; eventStart: string; eventEnd: string; cartOpen: string; cartClose: string; postCartEnd: string;
  pageLinks: string[]; adCampaignIds: string[]; products: TierProducts; notes: string;
};

export function toFormValue(e?: RegistryEventRow): EventFormValue {
  return {
    title: e?.title ?? "", eventType: e?.eventType ?? "webinar", funnelRole: e?.funnelRole ?? "mini", feedsIntoId: e?.feedsIntoId ?? null,
    adsStart: e?.adsStart ?? "", eventStart: e?.eventStart ?? "", eventEnd: e?.eventEnd ?? "", cartOpen: e?.cartOpen ?? "",
    cartClose: e?.cartClose ?? "", postCartEnd: e?.postCartEnd ?? "", pageLinks: e?.pageLinks ?? [], adCampaignIds: e?.adCampaignIds ?? [],
    products: e?.products ?? {}, notes: e?.notes ?? "",
  };
}

export function toPayload(v: EventFormValue) {
  const d = (s: string) => (s ? s : null);
  return {
    title: v.title.trim(), eventType: v.eventType, funnelRole: v.funnelRole, feedsIntoId: v.funnelRole === "mini" ? v.feedsIntoId : null,
    adsStart: d(v.adsStart), eventStart: v.eventStart, eventEnd: d(v.eventEnd), cartOpen: d(v.cartOpen), cartClose: d(v.cartClose),
    postCartEnd: d(v.postCartEnd), pageLinks: v.pageLinks, adCampaignIds: v.adCampaignIds, products: v.products, notes: v.notes || null,
  };
}

const DATE_FIELDS: Array<[keyof EventFormValue, string, string]> = [
  ["adsStart", "Ads start", "Spend and opt-ins count from here"],
  ["eventStart", "Event start", "Required"],
  ["eventEnd", "Event end", ""],
  ["cartOpen", "Cart open", "Sales count from here, including ticket sales while ads run"],
  ["cartClose", "Cart close", "End of the open/close cart sequence"],
  ["postCartEnd", "Post-cart end", "Sales team follow-up counts until here"],
];

export function EventForm({ value, onChange, mains, suggestions, defaults, afterPages }: {
  value: EventFormValue; onChange: (v: EventFormValue) => void; mains: RegistryEventRow[];
  suggestions?: Suggestions; defaults: TierProducts;
  afterPages?: ReactNode; // e.g. "Fill dates from ads", which needs the page links
}) {
  const set = <K extends keyof EventFormValue>(k: K, v: EventFormValue[K]) => onChange({ ...value, [k]: v });
  const productOptions = (suggestions?.products ?? []).map((p) => ({ value: p.name, hint: `${p.source} · ${p.orders} sales` }));
  const pageOptions = (suggestions?.pages ?? []).map((p) => ({ value: p.url, hint: `$${Math.round(p.adSpend)} ad spend · ${p.optIns} opt-ins` }));
  const campaignOptions = (suggestions?.campaigns ?? []).map((c) => ({ value: c.id, hint: c.name ?? "" }));
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="ev-title">Event name</Label>
        <Input id="ev-title" className="h-11" value={value.title} onChange={(e) => set("title", e.target.value)} placeholder="Nov Masterclass" data-testid="input-event-title" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Size</Label>
          <Select value={value.funnelRole} onValueChange={(v) => set("funnelRole", v as "main" | "mini")}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mini">Mini (small)</SelectItem>
              <SelectItem value="main">Main (big)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Kind</Label>
          <Select value={value.eventType} onValueChange={(v) => set("eventType", v)}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="webinar">Masterclass</SelectItem>
              <SelectItem value="challenge">Challenge</SelectItem>
              <SelectItem value="summit">Summit / live event</SelectItem>
              <SelectItem value="workshop">Workshop</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {value.funnelRole === "mini" && (
        <div className="space-y-1.5">
          <Label>Feeds into (Main event)</Label>
          <Select value={value.feedsIntoId ? String(value.feedsIntoId) : "none"} onValueChange={(v) => set("feedsIntoId", v === "none" ? null : Number(v))}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Pick the Main event" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not picked yet</SelectItem>
              {mains.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.registryId} · {m.title}</SelectItem>)}
            </SelectContent>
          </Select>
          {!value.feedsIntoId && <p className="text-xs text-amber-300">Without this, the Main event total leaves this event out.</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {DATE_FIELDS.map(([k, labelText, help]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`ev-${k}`}>{labelText}</Label>
            <Input id={`ev-${k}`} type="date" className="h-11" value={value[k] as string} onChange={(e) => set(k, e.target.value as never)} />
            {help && <p className="text-[11px] leading-tight text-muted-foreground">{help}</p>}
          </div>
        ))}
      </div>
      <ListInput
        label="Page links people see (not the editor)" values={value.pageLinks} onChange={(v) => set("pageLinks", v)}
        suggestions={pageOptions} placeholder="yourclient.com/masterclass" testId="input-page-link"
        help="Ad spend and opt-ins match these pages. UTMs, https:// and www. are ignored."
      />
      {afterPages}
      <div className="space-y-4 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">Products sold at this event</p>
        <p className="-mt-3 text-xs text-muted-foreground">Leave a box empty to use the client's usual product. Names must match the payment platform exactly.</p>
        {TIERS.map((t) => (
          <ListInput
            key={t} label={TIER_LABEL[t]} values={value.products[t] ?? []}
            onChange={(v) => set("products", { ...value.products, [t]: v })} suggestions={productOptions}
            placeholder={defaults[t]?.length ? `Usual: ${defaults[t]!.join("; ")}` : "Exact product name"}
          />
        ))}
      </div>
      <ListInput
        label="Ad campaign IDs (only if two events run at once)" values={value.adCampaignIds} onChange={(v) => set("adCampaignIds", v)}
        suggestions={campaignOptions} placeholder="120242569567240554"
        help="When filled, ad spend matches these campaigns instead of the page links."
      />
      <div className="space-y-1.5">
        <Label htmlFor="ev-notes">Notes</Label>
        <Textarea id="ev-notes" value={value.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
      </div>
    </div>
  );
}

export function NumberGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
