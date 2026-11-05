// Every synced sale, newest first, as a phone-friendly list with search and filters.
// Totals live on the Revenue & Ad Spend dashboard; this page is for finding individual sales.
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Sale { id: number; amount: string; currency?: string; saleDate: string; productName: string | null; customerName: string | null; source?: string | null; status?: string | null; reference?: string | null }
interface PaginatedSalesResponse { sales: Sale[]; total: number; page: number; totalPages: number }

const PROCESSORS = [["", "All"], ["stripe", "Stripe"], ["whop", "Whop"], ["fanbasis", "Fanbasis"]] as const;
const LIMIT = 25;
const money = (n: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
const sourceName = (s?: string | null) => PROCESSORS.find(([id]) => id === s)?.[1] ?? (s ? s[0].toUpperCase() + s.slice(1) : "—");
const isBad = (status?: string | null) => /refund|fail|dispute|chargeback|void/i.test(status ?? "");
const statusLabel = (status?: string | null) => {
  const s = (status ?? "").toLowerCase();
  if (!s || ["paid", "succeeded", "completed", "complete", "success"].includes(s)) return null; // the normal case needs no label
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
};

export default function LiveSalesFeed() {
  const { id: clientId } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [processor, setProcessor] = useState("");
  const [start, setStart] = useState<Date>();
  const [end, setEnd] = useState<Date>();

  // Search after typing pauses, not on every key.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (search) query.set("search", search);
  if (processor) query.set("processor", processor);
  if (start) query.set("startDate", start.toISOString());
  if (end) query.set("endDate", new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).toISOString());
  const salesQuery = useQuery<PaginatedSalesResponse>({
    queryKey: [`/api/clients/${clientId}/sales/paginated`, page, search, processor, start?.toISOString(), end?.toISOString()],
    queryFn: async () => {
      const r = await fetch(`/api/clients/${clientId}/sales/paginated?${query}`);
      if (!r.ok) throw new Error("Unable to load sales");
      return r.json();
    },
    placeholderData: (prev) => prev,
  });
  const data = salesQuery.data;
  const filtered = !!(search || processor || start || end);

  const DateButton = ({ value, onChange, label }: { value?: Date; onChange: (d?: Date) => void; label: string }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-10 flex-1 justify-start px-3 text-sm", !value && "text-muted-foreground")}>
          <Calendar className="mr-2 h-4 w-4" />{value ? format(value, "MMM d, yyyy") : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarComponent mode="single" selected={value} onSelect={(d) => { onChange(d); setPage(1); }} />
      </PopoverContent>
    </Popover>
  );

  return (
    <AppLayout title="Live Sales Feed" mode="client">
      <div className="mx-auto max-w-3xl space-y-4">
        <header>
          <h1 className="font-heading text-2xl font-bold md:text-3xl">Live Sales Feed</h1>
          <p className="text-sm text-muted-foreground">Every sale from your connected accounts, newest first.</p>
        </header>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search" inputMode="search" placeholder="Search name, product or reference" aria-label="Search sales" value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)} className="h-11 pl-9" data-testid="input-search-sales"
            />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Processor">
            {PROCESSORS.map(([id, label]) => (
              <button
                key={id} type="button" role="tab" aria-selected={processor === id} onClick={() => { setProcessor(id); setPage(1); }}
                className={cn("h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
                  processor === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <DateButton value={start} onChange={setStart} label="From" />
            <DateButton value={end} onChange={setEnd} label="To" />
            {filtered && (
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Clear filters"
                onClick={() => { setSearchInput(""); setSearch(""); setProcessor(""); setStart(undefined); setEnd(undefined); setPage(1); }}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <Card className="rounded-xl" data-testid="live-sales-feed">
          <CardContent className="p-0">
            {salesQuery.isLoading ? (
              <div className="space-y-px">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-16 animate-pulse bg-muted/40" />)}</div>
            ) : salesQuery.isError ? (
              <p className="p-8 text-center text-sm text-destructive">Couldn't load sales. Try again in a moment.</p>
            ) : !data?.sales.length ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{filtered ? "No sales match these filters." : "No sales yet."}</p>
            ) : (
              <ul className={cn("divide-y divide-border", salesQuery.isFetching && "opacity-60 transition-opacity")}>
                {data.sales.map((s) => {
                  const bad = isBad(s.status);
                  const label = statusLabel(s.status);
                  return (
                    <li key={s.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.customerName || s.productName || "Sale"}</p>
                        {s.customerName && s.productName && <p className="truncate text-sm text-muted-foreground">{s.productName}</p>}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {format(new Date(s.saleDate), "MMM d, yyyy · h:mm a")} · {sourceName(s.source)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("font-semibold tabular-nums", bad && "text-destructive line-through decoration-1")}>{money(Number(s.amount), s.currency || "USD")}</p>
                        {label && <p className={cn("text-xs", bad ? "text-destructive" : "text-muted-foreground")}>{label}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{((data.page - 1) * LIMIT + 1).toLocaleString()}–{Math.min(data.page * LIMIT, data.total).toLocaleString()} of {data.total.toLocaleString()}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Newer sales" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Older sales" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
