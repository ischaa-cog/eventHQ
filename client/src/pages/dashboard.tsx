import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  Clock3,
  Layers3,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Client {
  id: number;
  name: string;
  niche: string | null;
  createdAt: string;
}

interface Event {
  id: number;
  clientId: number;
  name: string;
  type: string;
  status: string | null;
  startDate: string | null;
  createdAt: string;
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "Date not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not set" : dateFormatter.format(date);
}

function statusLabel(status: string | null) {
  if (!status) return "Status not set";
  return status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusStyle(status: string | null) {
  switch (status?.toLowerCase()) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "in_progress":
    case "generating":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "cancelled":
    case "archived":
      return "border-stone-200 bg-stone-100 text-stone-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function LoadingRows() {
  return (
    <div className="space-y-3" aria-label="Loading dashboard data">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-4 rounded-xl border border-border/70 p-4">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted/70" />
          </div>
          <div className="hidden h-6 w-20 animate-pulse rounded-full bg-muted sm:block" />
        </div>
      ))}
    </div>
  );
}

function QueryError({
  onRetry,
  message,
}: {
  onRetry: () => void;
  message: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium text-foreground">We couldn’t load this information</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}

export default function DashboardPage() {
  const clientsQuery = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const response = await fetch("/api/clients", { credentials: "include" });
      if (!response.ok) throw new Error("Your workspaces could not be fetched.");
      return response.json();
    },
  });

  const eventsQuery = useQuery<Event[]>({
    queryKey: ["/api/events"],
    queryFn: async () => {
      const response = await fetch("/api/events", { credentials: "include" });
      if (!response.ok) throw new Error("Your events could not be fetched.");
      return response.json();
    },
  });

  const clients = clientsQuery.data;
  const events = eventsQuery.data;

  const sortedClients = useMemo(
    () =>
      [...(clients ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [clients],
  );
  const recentEvents = useMemo(
    () =>
      [...(events ?? [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [events],
  );
  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return (events ?? [])
      .filter((event) => {
        if (!event.startDate) return false;
        const start = new Date(event.startDate).getTime();
        return Number.isFinite(start) && start >= now;
      })
      .sort(
        (a, b) =>
          new Date(a.startDate as string).getTime() -
          new Date(b.startDate as string).getTime(),
      )
      .slice(0, 4);
  }, [events]);

  const clientById = useMemo(
    () => new Map((clients ?? []).map((client) => [client.id, client])),
    [clients],
  );
  const activeEventCount = events?.filter(
    (event) => event.status === "in_progress" || event.status === "generating",
  ).length;

  return (
    <AppLayout title="Home">
      <div className="mx-auto w-full max-w-[1400px] space-y-8 pb-8">
        <header className="flex flex-col justify-between gap-5 border-b border-border/70 pb-7 sm:flex-row sm:items-end">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <span className="h-px w-6 bg-primary" />
              EventHQ · Home
            </p>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Your event work, at a glance.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              A clear view of the client workspaces you can access and the events moving through them.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/clients" data-testid="button-open-workspaces">
              Open workspaces
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </header>

        <section aria-label="Workspace overview" className="grid gap-4 sm:grid-cols-3">
          <Card className="relative overflow-hidden border-border/80 shadow-sm">
            <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
            <CardContent className="flex items-start justify-between p-5 pl-6 sm:p-6 sm:pl-7">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Client workspaces</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums" data-testid="text-total-clients-count">
                  {clientsQuery.isLoading ? <span className="inline-block h-9 w-12 animate-pulse rounded bg-muted align-middle" /> : clientsQuery.isError ? "—" : clients?.length ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Workspaces available to you</p>
              </div>
              <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <UsersRound className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-border/80 shadow-sm">
            <div className="absolute inset-y-0 left-0 w-1 bg-sky-600/80" />
            <CardContent className="flex items-start justify-between p-5 pl-6 sm:p-6 sm:pl-7">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Events</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums" data-testid="text-total-events-count">
                  {eventsQuery.isLoading ? <span className="inline-block h-9 w-12 animate-pulse rounded bg-muted align-middle" /> : eventsQuery.isError ? "—" : events?.length ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Across your workspaces</p>
              </div>
              <span className="rounded-xl bg-sky-50 p-2.5 text-sky-800">
                <Layers3 className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-border/80 shadow-sm">
            <div className="absolute inset-y-0 left-0 w-1 bg-amber-500/80" />
            <CardContent className="flex items-start justify-between p-5 pl-6 sm:p-6 sm:pl-7">
              <div>
                <p className="text-sm font-medium text-muted-foreground">In progress</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums" data-testid="text-active-events-count">
                  {eventsQuery.isLoading ? <span className="inline-block h-9 w-12 animate-pulse rounded bg-muted align-middle" /> : eventsQuery.isError ? "—" : activeEventCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Events currently being worked on</p>
              </div>
              <span className="rounded-xl bg-amber-50 p-2.5 text-amber-800">
                <Clock3 className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>
        </section>

        {(clientsQuery.isError || eventsQuery.isError) && (
          <div className="space-y-3">
            {clientsQuery.isError && (
              <QueryError
                message={clientsQuery.error instanceof Error ? clientsQuery.error.message : "Please try again."}
                onRetry={() => void clientsQuery.refetch()}
              />
            )}
            {eventsQuery.isError && (
              <QueryError
                message={eventsQuery.error instanceof Error ? eventsQuery.error.message : "Please try again."}
                onRetry={() => void eventsQuery.refetch()}
              />
            )}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
          <Card className="overflow-hidden border-border/80 shadow-sm" data-testid="card-recent-events">
            <CardHeader className="flex flex-row items-end justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-[0.13em] text-muted-foreground">The latest</p>
                <CardTitle className="text-xl">Recent events</CardTitle>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:block">
                {eventsQuery.isError ? "Unavailable" : `${events?.length ?? 0} total`}
              </span>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              {eventsQuery.isLoading ? (
                <LoadingRows />
              ) : eventsQuery.isError ? (
                <p className="py-5 text-sm text-muted-foreground">Recent events will appear here once the connection is restored.</p>
              ) : recentEvents.length === 0 ? (
                <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-border bg-muted/25 px-5 py-7 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-foreground">No events yet</p>
                    <p className="mt-1 max-w-md text-sm leading-5 text-muted-foreground">
                      Once an event is added to a workspace, you’ll find its latest status and date here.
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link href="/clients">
                      View workspaces
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border/70">
                  {recentEvents.map((event) => {
                    const client = clientById.get(event.clientId);
                    return (
                      <Link
                        key={event.id}
                        href={client ? `/client/${client.id}/dashboard` : "/clients"}
                        className="group flex items-center gap-3 py-4 first:pt-0 last:pb-0 sm:gap-4"
                        data-testid={`row-event-${event.id}`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                          <CalendarDays className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                            {event.name}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {client?.name ?? "Workspace"} <span aria-hidden="true">·</span> {event.type}
                          </span>
                        </span>
                        <span className="hidden shrink-0 text-right sm:block">
                          <span className="block text-xs font-medium text-foreground">{formatDate(event.startDate)}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">Event date</span>
                        </span>
                        <Badge variant="outline" className={`hidden shrink-0 sm:inline-flex ${statusStyle(event.status)}`}>
                          {statusLabel(event.status)}
                        </Badge>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="overflow-hidden border-border/80 shadow-sm" data-testid="card-upcoming-events">
              <CardHeader className="border-b border-border/70 px-5 py-5 sm:px-6">
                <p className="mb-1 text-xs font-medium uppercase tracking-[0.13em] text-muted-foreground">On the horizon</p>
                <CardTitle className="text-xl">Upcoming dates</CardTitle>
              </CardHeader>
              <CardContent className="p-5 sm:p-6">
                {eventsQuery.isLoading ? (
                  <LoadingRows />
                ) : eventsQuery.isError ? (
                  <p className="py-3 text-sm text-muted-foreground">Upcoming dates are unavailable right now.</p>
                ) : upcomingEvents.length === 0 ? (
                  <div className="rounded-xl bg-muted/35 px-4 py-5">
                    <p className="text-sm font-medium text-foreground">Nothing scheduled ahead</p>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      Events with a future date will show up here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {upcomingEvents.map((event) => {
                      const client = clientById.get(event.clientId);
                      return (
                        <Link
                          key={event.id}
                          href={client ? `/client/${client.id}/dashboard` : "/clients"}
                          className="group flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/45"
                        >
                          <span className="min-w-[54px] rounded-lg border border-border bg-card px-2 py-1.5 text-center">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {event.startDate ? new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(event.startDate)) : ""}
                            </span>
                            <span className="block text-lg font-semibold leading-5 tabular-nums text-foreground">
                              {event.startDate ? new Intl.DateTimeFormat("en", { day: "numeric" }).format(new Date(event.startDate)) : ""}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{event.name}</span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">{client?.name ?? "Workspace"}</span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-primary" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-primary/15 bg-primary/[0.035] shadow-none" data-testid="card-workspaces">
              <CardHeader className="flex flex-row items-center justify-between px-5 pb-3 pt-5 sm:px-6">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-[0.13em] text-muted-foreground">Your spaces</p>
                  <CardTitle className="text-xl">Client workspaces</CardTitle>
                </div>
                <UsersRound className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                {clientsQuery.isLoading ? (
                  <div className="space-y-3 py-2">
                    {[0, 1].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-muted" />)}
                  </div>
                ) : clientsQuery.isError ? (
                  <p className="py-2 text-sm text-muted-foreground">Your workspaces are unavailable right now.</p>
                ) : sortedClients.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-primary/20 bg-background/70 p-4">
                    <p className="text-sm font-medium">No workspaces to open yet</p>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      Visit workspaces to see what’s available to you or set one up.
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-4">
                      <Link href="/clients">
                        Go to workspaces
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-border/70">
                      {sortedClients.slice(0, 3).map((client) => (
                        <Link
                          key={client.id}
                          href={`/client/${client.id}/dashboard`}
                          className="group flex items-center gap-3 py-3 first:pt-1 last:pb-1"
                          data-testid={`link-workspace-${client.id}`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                            {client.name.trim().slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{client.name}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{client.niche || "Client workspace"}</span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-primary" />
                        </Link>
                      ))}
                    </div>
                    <Button asChild variant="outline" className="mt-4 w-full justify-between">
                      <Link href="/clients">
                        All workspaces
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}