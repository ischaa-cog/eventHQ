import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { History } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";

type Entry = {
  id: number; userId: string | null; userEmail: string | null; userName: string | null; userRole: string | null;
  clientId: number | null; clientName: string | null; action: string; item: string | null; createdAt: string;
};
type Person = { userId: string | null; userName: string | null; userEmail: string | null };
type Page = { entries: Entry[]; people: Person[]; hasMore: boolean };

const ROLE_LABELS: Record<string, string> = {
  owner: "Admin", agency_admin: "Admin", team_member: "Team Member", agency_client: "Client",
};
const ALL = "all";

export default function ActivityLogPage() {
  const [clientId, setClientId] = useState(ALL);
  const [userId, setUserId] = useState(ALL);

  const { data: clients = [] } = useQuery<{ id: number; name: string }[]>({ queryKey: ["/api/clients"] });
  const log = useInfiniteQuery({
    queryKey: ["/api/activity", clientId, userId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "100" });
      if (clientId !== ALL) params.set("clientId", clientId);
      if (userId !== ALL) params.set("userId", userId);
      if (pageParam) params.set("before", String(pageParam));
      const response = await apiRequest("GET", `/api/activity?${params}`);
      return response.json() as Promise<Page>;
    },
    getNextPageParam: (last: Page) => last.hasMore ? last.entries[last.entries.length - 1]?.id : undefined,
  });

  const entries = log.data?.pages.flatMap(page => page.entries) ?? [];
  const people = (log.data?.pages[0]?.people ?? []).filter(person => person.userId);

  return (
    <AppLayout title="Activity Log" mode="agency">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2"><History size={18} />Activity Log</CardTitle>
              <CardDescription>Every change made in EventHQ: who made it, when, and in which client workspace.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="w-56" data-testid="select-activity-client"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All clients</SelectItem>
                  {clients.map(client => <SelectItem key={client.id} value={String(client.id)}>{client.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="w-56" data-testid="select-activity-person"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Everyone</SelectItem>
                  {people.map(person => <SelectItem key={person.userId!} value={person.userId!}>
                    {person.userName || person.userEmail}
                  </SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {log.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading activity…</p>
              : log.isError ? <p role="alert" className="py-8 text-center text-sm text-destructive">Could not load the activity log. Please refresh the page.</p>
              : entries.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No activity yet. Changes appear here as soon as someone makes them.</p>
              : <>
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Client</TableHead><TableHead>What changed</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map(entry => <TableRow key={entry.id} data-testid={`activity-row-${entry.id}`}>
                      <TableCell className="whitespace-nowrap align-top">
                        <div className="text-sm">{format(new Date(entry.createdAt), "MMM d, yyyy · h:mm a")}</div>
                        <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="text-sm font-medium">{entry.userName || entry.userEmail || "Unknown user"}</div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {entry.userEmail}
                          {entry.userRole && <Badge variant="outline" className="text-[10px]">{ROLE_LABELS[entry.userRole] ?? entry.userRole}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm">{entry.clientName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="align-top text-sm">
                        <div>{entry.action}</div>
                        {entry.item && <div className="text-xs text-muted-foreground">{entry.item}</div>}
                      </TableCell>
                    </TableRow>)}
                  </TableBody>
                </Table>
                {log.hasNextPage && <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={() => log.fetchNextPage()} disabled={log.isFetchingNextPage}>
                    {log.isFetchingNextPage ? "Loading…" : "Load older activity"}
                  </Button>
                </div>}
              </>}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
