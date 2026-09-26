import { useState } from "react";
import { KeyRound, Plus, Trash2, UserRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { clientLoginUrl, generatePassword, LoginDetailsDialog, PasswordField, type LoginDetails } from "@/components/LoginDetails";

interface ClientLogin {
  id: string;
  email: string | null;
  createdAt: string | null;
}

// apiRequest errors read "409: {json}"; show just the server's message.
function errorMessage(error: Error): string {
  const body = error.message.replace(/^\d+:\s*/, "");
  try { return JSON.parse(body).error || body; } catch { return body; }
}

// Email + password logins that open this one client workspace.
export function ClientAccessCard({ clientId, clientName, clientEmail }: { clientId: number; clientName: string; clientEmail?: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = [`/api/clients/${clientId}/users`];
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetFor, setResetFor] = useState<ClientLogin | null>(null);
  const [removeFor, setRemoveFor] = useState<ClientLogin | null>(null);
  const [details, setDetails] = useState<LoginDetails | null>(null);

  const { data: logins = [], isLoading } = useQuery<ClientLogin[]>({ queryKey });

  const openAdd = () => {
    setEmail(logins.length === 0 ? clientEmail ?? "" : "");
    setPassword(generatePassword());
    setAddOpen(true);
  };
  const openReset = (login: ClientLogin) => {
    setPassword(generatePassword());
    setResetFor(login);
  };

  const addMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${clientId}/users`, { email, password })).json(),
    onSuccess: (login: ClientLogin) => {
      queryClient.invalidateQueries({ queryKey });
      setAddOpen(false);
      setDetails({ title: `Login for ${clientName}`, email: login.email ?? email, password });
    },
    onError: (error: Error) => toast({ title: "Login not created", description: errorMessage(error), variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async (login: ClientLogin) =>
      apiRequest("PATCH", `/api/clients/${clientId}/users/${login.id}/password`, { password }),
    onSuccess: (_data, login) => {
      setResetFor(null);
      setDetails({ title: `New password for ${clientName}`, email: login.email ?? "", password });
    },
    onError: (error: Error) => toast({ title: "Password not changed", description: errorMessage(error), variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (login: ClientLogin) => apiRequest("DELETE", `/api/clients/${clientId}/users/${login.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setRemoveFor(null);
      toast({ title: "Login removed", description: "That person can no longer sign in." });
    },
    onError: (error: Error) => toast({ title: "Login not removed", description: errorMessage(error), variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Client Access
          </CardTitle>
          <CardDescription>
            People with these logins sign in at <span className="font-mono">{clientLoginUrl()}</span> and see only this workspace.
          </CardDescription>
        </div>
        <Button onClick={openAdd} data-testid="button-add-client-login">
          <Plus className="h-4 w-4 mr-2" /> Add login
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : logins.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-client-logins">
            No client login yet. Add one so your client can sign in.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {logins.map(login => (
              <li key={login.id} className="flex items-center justify-between gap-4 p-3" data-testid={`row-client-login-${login.id}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{login.email}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => openReset(login)} data-testid={`button-reset-password-${login.id}`}>
                    Reset password
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRemoveFor(login)} data-testid={`button-remove-login-${login.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add client login</DialogTitle>
            <DialogDescription>This person will be able to sign in and view {clientName}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-login-email">Email</Label>
              <Input id="client-login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-client-login-email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-login-password">Password</Label>
              <PasswordField id="client-login-password" value={password} onChange={setPassword} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!email.trim() || password.length < 8 || addMutation.isPending}
              data-testid="button-save-client-login"
            >
              {addMutation.isPending ? "Creating..." : "Create login"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetFor} onOpenChange={(open) => { if (!open) setResetFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetFor?.email}. They will be signed out and must use the new password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="client-reset-password">New password</Label>
            <PasswordField id="client-reset-password" value={password} onChange={setPassword} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetFor(null)}>Cancel</Button>
            <Button
              onClick={() => resetFor && resetMutation.mutate(resetFor)}
              disabled={password.length < 8 || resetMutation.isPending}
              data-testid="button-save-reset-password"
            >
              {resetMutation.isPending ? "Saving..." : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeFor} onOpenChange={(open) => { if (!open) setRemoveFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this login?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeFor?.email} will be signed out and can no longer open {clientName}. The workspace itself is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeFor && removeMutation.mutate(removeFor)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove-login"
            >
              Remove login
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LoginDetailsDialog details={details} onClose={() => setDetails(null)} />
    </Card>
  );
}
