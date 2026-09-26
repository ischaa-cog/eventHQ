import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, MoreHorizontal, Trash2, Pencil, KeyRound, UserCheck, UserX } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { generatePassword, LoginDetailsDialog, PasswordField, type LoginDetails } from "@/components/LoginDetails";

interface Client {
  id: number;
  name: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  businessAddress: string | null;
  businessName: string | null;
  niche: string | null;
  website: string | null;
  primaryOffer: string | null;
  headshot: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  
  const canManageClients = user?.role === "owner" || user?.role === "agency_admin";
  const canManageClientStatus = canManageClients;

  const { toast } = useToast();
  const [newClientName, setNewClientName] = useState("");
  const [newClientFullName, setNewClientFullName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientBusinessName, setNewClientBusinessName] = useState("");
  const [newClientBusinessAddress, setNewClientBusinessAddress] = useState("");
  const [newClientNiche, setNewClientNiche] = useState("");
  const [newClientWebsite, setNewClientWebsite] = useState("");
  const [newClientPrimaryOffer, setNewClientPrimaryOffer] = useState("");
  const [createLogin, setCreateLogin] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState(() => generatePassword());
  const [loginDetails, setLoginDetails] = useState<LoginDetails | null>(null);

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  const resetFormFields = () => {
    setNewClientName("");
    setNewClientFullName("");
    setNewClientEmail("");
    setNewClientPhone("");
    setNewClientBusinessName("");
    setNewClientBusinessAddress("");
    setNewClientNiche("");
    setNewClientWebsite("");
    setNewClientPrimaryOffer("");
    setCreateLogin(true);
    setLoginEmail("");
    setLoginPassword(generatePassword());
  };

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Client> & { login?: { email: string; password: string } }) => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to create client");
      return body;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setAddDialogOpen(false);
      resetFormFields();
      toast({
        title: "Client Created",
        description: `${data.name} has been added to your workspace.`,
      });
      if (data.login && variables.login) {
        setLoginDetails({ title: `Login for ${data.name}`, email: data.login.email, password: variables.login.password });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Client not created", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Client> }) => {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update client");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setEditDialogOpen(false);
      setClientToEdit(null);
      resetFormFields();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (clientId: number) => {
      const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete client");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ clientId, isActive }: { clientId: number; isActive: boolean }) => {
      const res = await fetch(`/api/clients/${clientId}/active-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update client status");
      return res.json();
    },
    onSuccess: (data: Client) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: data.isActive ? "Client Activated" : "Client Deactivated",
        description: `${data.name} is now ${data.isActive ? "active" : "inactive"}.`,
      });
    },
  });

  const handleToggleActive = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleActiveMutation.mutate({ clientId: client.id, isActive: !client.isActive });
  };

  const filteredClients = clients.filter((client) => {
    if (!canManageClientStatus) return client.isActive;
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return client.isActive;
    return !client.isActive;
  });

  const handleDeleteClick = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (clientToDelete) {
      deleteMutation.mutate(clientToDelete.id);
    }
  };

  const handleCreateClient = () => {
    if (!newClientName.trim() || !newClientEmail.trim()) return;
    createMutation.mutate({
      name: newClientName.trim(),
      fullName: newClientFullName.trim() || undefined,
      email: newClientEmail.trim(),
      phone: newClientPhone.trim() || undefined,
      businessName: newClientBusinessName.trim() || undefined,
      businessAddress: newClientBusinessAddress.trim() || undefined,
      niche: newClientNiche.trim() || undefined,
      website: newClientWebsite.trim() || undefined,
      primaryOffer: newClientPrimaryOffer.trim() || undefined,
      ...(createLogin ? { login: { email: loginEmail.trim() || newClientEmail.trim(), password: loginPassword } } : {}),
    });
  };

  const handleEditClick = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setClientToEdit(client);
    setNewClientName(client.name);
    setNewClientFullName(client.fullName || "");
    setNewClientEmail(client.email || "");
    setNewClientPhone(client.phone || "");
    setNewClientBusinessName(client.businessName || "");
    setNewClientBusinessAddress(client.businessAddress || "");
    setNewClientNiche(client.niche || "");
    setNewClientWebsite(client.website || "");
    setNewClientPrimaryOffer(client.primaryOffer || "");
    setEditDialogOpen(true);
  };

  const handleUpdateClient = () => {
    if (!clientToEdit || !newClientName.trim()) return;
    updateMutation.mutate({
      id: clientToEdit.id,
      data: {
        name: newClientName.trim(),
        fullName: newClientFullName.trim() || null,
        email: newClientEmail.trim() || null,
        phone: newClientPhone.trim() || null,
        businessName: newClientBusinessName.trim() || null,
        businessAddress: newClientBusinessAddress.trim() || null,
        niche: newClientNiche.trim() || null,
        website: newClientWebsite.trim() || null,
        primaryOffer: newClientPrimaryOffer.trim() || null,
      },
    });
  };

  const formatLastActive = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  return (
    <AppLayout title="Client Workspaces" mode="client" showSearch={true}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">Open a client workspace or create a new one.</p>
          {canManageClients && (
            <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-client">
              <Plus className="mr-2 h-4 w-4" /> Add Client
            </Button>
          )}
        </div>

        {canManageClientStatus && (
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}>
            <TabsList data-testid="tabs-client-status">
              <TabsTrigger value="active" data-testid="tab-active-clients">
                Active ({clients.filter(c => c.isActive).length})
              </TabsTrigger>
              <TabsTrigger value="inactive" data-testid="tab-inactive-clients">
                Inactive ({clients.filter(c => !c.isActive).length})
              </TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all-clients">
                All ({clients.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading clients...</div>
        ) : clients.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              {canManageClients
                ? "No client workspaces yet. Add your first client to get started."
                : "No client workspaces are assigned to your account yet."}
            </p>
            {canManageClients && (
              <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-first-client">
                <Plus className="mr-2 h-4 w-4" /> Add Your First Client
              </Button>
            )}
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              {statusFilter === "active" ? "No active clients." : statusFilter === "inactive" ? "No inactive clients." : "No clients found."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((client) => (
              <Link key={client.id} href={`/client/${client.id}/dashboard`} className="block">
                <Card className={`hover:shadow-md transition-shadow cursor-pointer group h-full ${canManageClientStatus && !client.isActive ? "opacity-60" : ""}`} data-testid={`card-client-${client.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    {client.headshot ? (
                      <img 
                        src={client.headshot} 
                        alt={client.name} 
                        className="h-12 w-12 rounded-full object-cover border-2 border-primary/20"
                        data-testid={`img-client-headshot-${client.id}`}
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                        {client.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    {canManageClients && <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" data-testid={`button-client-menu-${client.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          className="cursor-pointer"
                          onClick={(e) => handleEditClick(client, e)}
                          data-testid={`button-edit-client-${client.id}`}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit Client
                        </DropdownMenuItem>
                        {canManageClientStatus && (
                          <DropdownMenuItem 
                            className="cursor-pointer"
                            onClick={(e) => handleToggleActive(client, e)}
                            data-testid={`button-toggle-active-${client.id}`}
                          >
                            {client.isActive ? (
                              <>
                                <UserX className="mr-2 h-4 w-4" />
                                Deactivate Client
                              </>
                            ) : (
                              <>
                                <UserCheck className="mr-2 h-4 w-4" />
                                Activate Client
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive cursor-pointer"
                          onClick={(e) => handleDeleteClick(client, e)}
                          data-testid={`button-delete-client-${client.id}`}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Client
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">{client.name}</CardTitle>
                      {canManageClientStatus && !client.isActive && (
                        <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-inactive-${client.id}`}>
                          Inactive
                        </Badge>
                      )}
                    </div>
                    {client.niche && (
                      <Badge variant="secondary" className="font-normal">{client.niche}</Badge>
                    )}
                    <div className="pt-2 text-sm text-muted-foreground">
                      <p>Last updated {formatLastActive(client.updatedAt)}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetFormFields(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Create a new client and set up their brand profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Contact Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="client-name">Client/Brand Name *</Label>
                  <Input
                    id="client-name"
                    placeholder="e.g., Acme Corporation"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    data-testid="input-client-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-full-name">Contact Full Name</Label>
                  <Input
                    id="client-full-name"
                    placeholder="e.g., John Smith"
                    value={newClientFullName}
                    onChange={(e) => setNewClientFullName(e.target.value)}
                    data-testid="input-client-full-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-email">Email *</Label>
                  <Input
                    id="client-email"
                    type="email"
                    placeholder="e.g., john@example.com"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    data-testid="input-client-email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-phone">Phone</Label>
                  <Input
                    id="client-phone"
                    placeholder="e.g., (555) 123-4567"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    data-testid="input-client-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-business-name">Business Name</Label>
                  <Input
                    id="client-business-name"
                    placeholder="e.g., Acme Inc."
                    value={newClientBusinessName}
                    onChange={(e) => setNewClientBusinessName(e.target.value)}
                    data-testid="input-client-business-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-business-address">Business Address</Label>
                  <Input
                    id="client-business-address"
                    placeholder="e.g., 123 Main St, City, State"
                    value={newClientBusinessAddress}
                    onChange={(e) => setNewClientBusinessAddress(e.target.value)}
                    data-testid="input-client-business-address"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Core Identity</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="client-niche">Niche / Industry</Label>
                  <Input
                    id="client-niche"
                    placeholder="e.g., B2B SaaS, Health & Fitness"
                    value={newClientNiche}
                    onChange={(e) => setNewClientNiche(e.target.value)}
                    data-testid="input-client-niche"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-website">Website URL</Label>
                  <Input
                    id="client-website"
                    placeholder="e.g., https://example.com"
                    value={newClientWebsite}
                    onChange={(e) => setNewClientWebsite(e.target.value)}
                    data-testid="input-client-website"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-primary-offer">Primary Offer</Label>
                <Textarea
                  id="client-primary-offer"
                  placeholder="Describe the client's main product or service..."
                  value={newClientPrimaryOffer}
                  onChange={(e) => setNewClientPrimaryOffer(e.target.value)}
                  data-testid="input-client-primary-offer"
                />
              </div>
            </div>

            <div className="space-y-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="create-login"
                  checked={createLogin}
                  onCheckedChange={(checked) => setCreateLogin(checked as boolean)}
                  data-testid="checkbox-create-login"
                />
                <div className="space-y-1">
                  <Label htmlFor="create-login" className="flex items-center gap-2 cursor-pointer">
                    <KeyRound className="h-4 w-4 text-primary" />
                    Create a client login
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    The client signs in with this email and password and sees only this workspace.
                  </p>
                </div>
              </div>
              {createLogin && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Login email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder={newClientEmail.trim() || "Same as client email"}
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      data-testid="input-login-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <PasswordField id="login-password" value={loginPassword} onChange={setLoginPassword} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button 
              onClick={handleCreateClient} 
              disabled={!newClientName.trim() || !newClientEmail.trim() || (createLogin && loginPassword.length < 8) || createMutation.isPending}
              data-testid="button-save-client"
            >
              {createMutation.isPending ? "Creating..." : createLogin ? "Create Client & Login" : "Create Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) { setClientToEdit(null); resetFormFields(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>
              Update the client's profile and brand information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Contact Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-client-name">Client/Brand Name *</Label>
                  <Input
                    id="edit-client-name"
                    placeholder="e.g., Acme Corporation"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    data-testid="input-edit-client-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-client-full-name">Contact Full Name</Label>
                  <Input
                    id="edit-client-full-name"
                    placeholder="e.g., John Smith"
                    value={newClientFullName}
                    onChange={(e) => setNewClientFullName(e.target.value)}
                    data-testid="input-edit-client-full-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-client-email">Email</Label>
                  <Input
                    id="edit-client-email"
                    type="email"
                    placeholder="e.g., john@example.com"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    data-testid="input-edit-client-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-client-phone">Phone</Label>
                  <Input
                    id="edit-client-phone"
                    placeholder="e.g., (555) 123-4567"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    data-testid="input-edit-client-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-client-business-name">Business Name</Label>
                  <Input
                    id="edit-client-business-name"
                    placeholder="e.g., Acme Inc."
                    value={newClientBusinessName}
                    onChange={(e) => setNewClientBusinessName(e.target.value)}
                    data-testid="input-edit-client-business-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-client-business-address">Business Address</Label>
                  <Input
                    id="edit-client-business-address"
                    placeholder="e.g., 123 Main St, City, State"
                    value={newClientBusinessAddress}
                    onChange={(e) => setNewClientBusinessAddress(e.target.value)}
                    data-testid="input-edit-client-business-address"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Core Identity</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-client-niche">Niche / Industry</Label>
                  <Input
                    id="edit-client-niche"
                    placeholder="e.g., B2B SaaS, Health & Fitness"
                    value={newClientNiche}
                    onChange={(e) => setNewClientNiche(e.target.value)}
                    data-testid="input-edit-client-niche"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-client-website">Website URL</Label>
                  <Input
                    id="edit-client-website"
                    placeholder="e.g., https://example.com"
                    value={newClientWebsite}
                    onChange={(e) => setNewClientWebsite(e.target.value)}
                    data-testid="input-edit-client-website"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-client-primary-offer">Primary Offer</Label>
                <Textarea
                  id="edit-client-primary-offer"
                  placeholder="Describe the client's main product or service..."
                  value={newClientPrimaryOffer}
                  onChange={(e) => setNewClientPrimaryOffer(e.target.value)}
                  data-testid="input-edit-client-primary-offer"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateClient} 
              disabled={!newClientName.trim() || updateMutation.isPending}
              data-testid="button-update-client"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{clientToDelete?.name}"? This action cannot be undone and will remove all associated events and assets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <LoginDetailsDialog details={loginDetails} onClose={() => setLoginDetails(null)} />
    </AppLayout>
  );
}
