// Who can open this client workspace. Owners (and agency staff) invite people, change roles and
// remove access; members see the list only.
import { useState, type FormEvent } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Copy, Loader2, MailPlus, Trash2, UserMinus } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Member = { id: string; email: string | null; firstName: string | null; lastName: string | null; clientRole: "owner" | "member"; createdAt: string };
type PendingInvite = { id: number; email: string | null; clientRole: "owner" | "member"; expiresAt: string | null; expired: boolean; link: string };
type Team = { members: Member[]; invites: PendingInvite[]; canManage: boolean; me: string; emailEnabled: boolean };

const ROLE_LABEL = { owner: "Owner", member: "Member" } as const;
const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  const body = raw.replace(/^\d+:\s*/, "");
  try { return JSON.parse(body).error || body; } catch { return body; }
};
const nameOf = (m: Member) => [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || "Unnamed";

export default function ClientTeamPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const key = [`/api/clients/${clientId}/team`];
  const { data, isLoading, isError } = useQuery<Team>({ queryKey: key, enabled: !!clientId });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const copy = (link: string) =>
    navigator.clipboard?.writeText(link).then(() => toast({ title: "Invite link copied" }), () => toast({ title: "Copy failed", description: link }));

  const setRole = useMutation({
    mutationFn: async ({ userId, clientRole }: { userId: string; clientRole: "owner" | "member" }) =>
      (await apiRequest("PATCH", `/api/clients/${clientId}/team/${userId}`, { clientRole })).json(),
    onSuccess: refresh,
    onError: (e) => toast({ title: "Could not change role", description: errorText(e), variant: "destructive" }),
  });
  const removeMember = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("DELETE", `/api/clients/${clientId}/team/${userId}`)).json(),
    onSuccess: () => { refresh(); toast({ title: "Access removed" }); },
    onError: (e) => toast({ title: "Could not remove", description: errorText(e), variant: "destructive" }),
  });
  const revoke = useMutation({
    mutationFn: async (inviteId: number) => (await apiRequest("DELETE", `/api/clients/${clientId}/team/invites/${inviteId}`)).json(),
    onSuccess: refresh,
  });

  return (
    <AppLayout mode="client" title="Team" pageContext="Workspace team">
      <div className="mx-auto w-full max-w-3xl space-y-5 pb-24">
        <header>
          <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">Team</h1>
          <p className="text-sm text-muted-foreground">People who can open this workspace.</p>
        </header>

        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          : isError || !data ? <p className="text-sm text-muted-foreground">Could not load the team.</p>
          : (
            <>
              {data.canManage && <InviteForm clientId={clientId!} emailEnabled={data.emailEnabled} onInvited={refresh} onCopy={copy} />}

              <Card className="rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Members</CardTitle>
                  <CardDescription>Owners see everything and manage the team. Members see everything but can't add or remove people.</CardDescription>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  {data.members.length === 0 && <p className="py-3 text-sm text-muted-foreground">No client logins yet.</p>}
                  {data.members.map((m) => (
                    <div key={m.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`member-${m.id}`}>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium">
                          <span className="truncate">{nameOf(m)}</span>
                          {m.id === data.me && <span className="text-xs text-muted-foreground">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{m.email} · since {format(new Date(m.createdAt), "MMM d, yyyy")}</p>
                      </div>
                      {data.canManage ? (
                        <div className="flex items-center gap-2">
                          <Select value={m.clientRole} onValueChange={(v) => setRole.mutate({ userId: m.id, clientRole: v as "owner" | "member" })}>
                            <SelectTrigger className="h-11 w-36" aria-label={`Role for ${nameOf(m)}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="owner">Owner</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" aria-label={`Remove ${nameOf(m)}`}
                            onClick={() => { if (window.confirm(`Remove ${nameOf(m)}? They will be signed out and lose access.`)) removeMember.mutate(m.id); }}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className="w-fit">{ROLE_LABEL[m.clientRole]}</Badge>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {data.canManage && data.invites.length > 0 && (
                <Card className="rounded-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Pending invites</CardTitle>
                    <CardDescription>Each link works once and expires after 7 days.</CardDescription>
                  </CardHeader>
                  <CardContent className="divide-y divide-border">
                    {data.invites.map((i) => (
                      <div key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`invite-${i.id}`}>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{i.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {ROLE_LABEL[i.clientRole]} · {i.expired ? "expired" : i.expiresAt ? `expires ${format(new Date(i.expiresAt), "MMM d")}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {!i.expired && (
                            <Button variant="outline" className="h-11" onClick={() => copy(i.link)}>
                              <Copy className="mr-2 h-4 w-4" />Copy link
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" aria-label={`Cancel invite for ${i.email}`} onClick={() => revoke.mutate(i.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
      </div>
    </AppLayout>
  );
}

function InviteForm({ clientId, emailEnabled, onInvited, onCopy }: {
  clientId: string; emailEnabled: boolean; onInvited: () => void; onCopy: (link: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [clientRole, setClientRole] = useState<"owner" | "member">("member");
  const [lastLink, setLastLink] = useState<{ link: string; emailed: boolean; email: string } | null>(null);
  const { toast } = useToast();
  const invite = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${clientId}/team`, { email, clientRole })).json(),
    onSuccess: (r: { link: string; emailed: boolean }) => {
      setLastLink({ ...r, email });
      setEmail("");
      onInvited();
    },
    onError: (e) => toast({ title: "Could not invite", description: errorText(e), variant: "destructive" }),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (email.trim()) invite.mutate(); };
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Invite someone</CardTitle>
        <CardDescription>
          {emailEnabled ? "They'll get an email with a link to choose their password." : "You'll get a link to send them. They choose their own password."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" className="h-11" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={clientRole} onValueChange={(v) => setClientRole(v as "owner" | "member")}>
              <SelectTrigger id="invite-role" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member: sees everything, can't manage the team</SelectItem>
                <SelectItem value="owner">Owner: sees everything and manages the team</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="h-11 w-full sm:w-auto" disabled={invite.isPending || !email.trim()}>
            {invite.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailPlus className="mr-2 h-4 w-4" />}
            Create invite
          </Button>
        </form>
        {lastLink && (
          <div className="space-y-2 rounded-lg border border-border p-3" role="status">
            <p className="text-sm">
              {lastLink.emailed ? <>Invite emailed to <span className="font-medium">{lastLink.email}</span>. You can also send the link yourself:</>
                : <>Send this link to <span className="font-medium">{lastLink.email}</span>:</>}
            </p>
            <div className="flex gap-2">
              <Input readOnly value={lastLink.link} className="h-11 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Copy invite link" onClick={() => onCopy(lastLink.link)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
