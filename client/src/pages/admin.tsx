import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Save, Plus, Trash2, Users, Shield, Building2, Copy, Link, Mail, FileText, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import type { User, Invite, AssetTemplate } from "@shared/schema";

interface Agency {
  id: number;
  name: string;
  defaultLanguage: string | null;
}

interface Client {
  id: number;
  name: string;
  agencyId: number;
}

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedAgency, setSelectedAgency] = useState<string>("");
  const [selectedClients, setSelectedClients] = useState<number[]>([]);
  const [agencyName, setAgencyName] = useState("");
  const [agencyDefaultLanguage, setAgencyDefaultLanguage] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState("agency_client");
  const [inviteAgency, setInviteAgency] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteClients, setInviteClients] = useState<number[]>([]);
  const [generatedLink, setGeneratedLink] = useState("");
  
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AssetTemplate | null>(null);
  const [newAgencyName, setNewAgencyName] = useState("");
  const [newAgencyLanguage, setNewAgencyLanguage] = useState("English (US)");
  const [createAgencyDialogOpen, setCreateAgencyDialogOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    assetType: "email",
    eventType: "webinar",
    itemCount: 5,
    systemPrompt: "",
    includeInstructions: "",
    outputFormat: "",
    isActive: true,
  });

  const agencyId = currentUser?.agencyId ?? null;

  const { data: currentAgency } = useQuery<Agency>({
    queryKey: [`/api/agencies/${agencyId}`],
    queryFn: async () => {
      const res = await fetch(`/api/agencies/${agencyId}`);
      if (!res.ok) throw new Error("Failed to fetch agency");
      return res.json();
    },
    enabled: agencyId !== null,
  });

  useEffect(() => {
    if (currentAgency) {
      setAgencyName(currentAgency.name);
      setAgencyDefaultLanguage(currentAgency.defaultLanguage || "English (US)");
    }
  }, [currentAgency]);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: currentUser?.role === "owner",
  });

  const { data: agencies = [] } = useQuery<Agency[]>({
    queryKey: ["/api/agencies"],
    enabled: currentUser?.role === "owner",
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: currentUser?.role === "owner",
  });

  const { data: invites = [] } = useQuery<Invite[]>({
    queryKey: ["/api/invites"],
    enabled: currentUser?.role === "owner" || currentUser?.role === "agency_admin",
  });

  const { data: templates = [] } = useQuery<AssetTemplate[]>({
    queryKey: ["/api/asset-templates"],
    enabled: currentUser?.role === "owner" || currentUser?.role === "agency_admin",
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateForm) => {
      const res = await apiRequest("POST", "/api/asset-templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/asset-templates"] });
      toast({ title: "Success", description: "Template created successfully" });
      setTemplateDialogOpen(false);
      resetTemplateForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create template", variant: "destructive" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof templateForm> }) => {
      const res = await apiRequest("PATCH", `/api/asset-templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/asset-templates"] });
      toast({ title: "Success", description: "Template updated successfully" });
      setTemplateDialogOpen(false);
      setEditingTemplate(null);
      resetTemplateForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update template", variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/asset-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/asset-templates"] });
      toast({ title: "Success", description: "Template deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete template", variant: "destructive" });
    },
  });

  const resetTemplateForm = () => {
    setTemplateForm({
      name: "",
      assetType: "email",
      eventType: "webinar",
      itemCount: 5,
      systemPrompt: "",
      includeInstructions: "",
      outputFormat: "",
      isActive: true,
    });
    setEditingTemplate(null);
  };

  const handleEditTemplate = (template: AssetTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      assetType: template.assetType,
      eventType: template.eventType,
      itemCount: template.itemCount ?? 5,
      systemPrompt: template.systemPrompt,
      includeInstructions: template.includeInstructions || "",
      outputFormat: template.outputFormat || "",
      isActive: template.isActive ?? true,
    });
    setTemplateDialogOpen(true);
  };

  const handleSaveTemplate = () => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({
        id: editingTemplate.id,
        data: templateForm,
      });
    } else {
      createTemplateMutation.mutate(templateForm);
    }
  };

  const createInviteMutation = useMutation({
    mutationFn: async (data: { role: string; agencyId?: number; email?: string; clientAccess?: number[] }) => {
      const res = await apiRequest("POST", "/api/invites", data);
      return res.json();
    },
    onSuccess: (invite) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
      const link = `${window.location.origin}/api/login?invite_token=${invite.token}`;
      setGeneratedLink(link);
      toast({ title: "Invite Created", description: "Share the link with the user to invite them." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create invite", variant: "destructive" });
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
      toast({ title: "Success", description: "Invite deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete invite", variant: "destructive" });
    },
  });

  const sendInviteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/invites/${id}/send`);
      return res.json();
    },
    onSuccess: () => toast({ title: "Invitation sent", description: "The existing invitation was emailed. No new workspace was created." }),
    onError: (error: Error) => toast({ title: "Invitation not sent", description: error.message, variant: "destructive" }),
  });

  const handleCreateInvite = () => {
    createInviteMutation.mutate({
      role: inviteRole,
      agencyId: inviteAgency ? parseInt(inviteAgency) : undefined,
      email: inviteEmail || undefined,
      clientAccess: inviteRole === "agency_client" ? inviteClients : undefined,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Link copied to clipboard" });
  };

  const resetInviteForm = () => {
    setInviteRole("agency_client");
    setInviteAgency("");
    setInviteEmail("");
    setInviteClients([]);
    setGeneratedLink("");
  };

  const toggleInviteClient = (clientId: number) => {
    setInviteClients(prev => prev.includes(clientId) ? [] : [clientId]);
  };

  const updateAgencyMutation = useMutation({
    mutationFn: async ({ name, defaultLanguage }: { name: string; defaultLanguage: string }) => {
      if (agencyId === null) throw new Error("No agency is assigned to this account");
      await apiRequest("PATCH", `/api/agencies/${agencyId}`, { name, defaultLanguage });
    },
    onSuccess: () => {
      if (agencyId !== null) {
        queryClient.invalidateQueries({ queryKey: [`/api/agencies/${agencyId}`] });
      }
      toast({ title: "Success", description: "Agency profile updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update agency profile", variant: "destructive" });
    },
  });

  const handleSaveAgencyProfile = () => {
    if (agencyId === null) return;
    updateAgencyMutation.mutate({ name: agencyName, defaultLanguage: agencyDefaultLanguage });
  };

  const createAgencyMutation = useMutation({
    mutationFn: async ({ name, defaultLanguage }: { name: string; defaultLanguage: string }) => {
      return await apiRequest("POST", "/api/agencies", { name, defaultLanguage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agencies"] });
      toast({ title: "Success", description: "Agency created successfully" });
      setNewAgencyName("");
      setNewAgencyLanguage("English (US)");
      setCreateAgencyDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create agency", variant: "destructive" });
    },
  });

  const deleteAgencyMutation = useMutation({
    mutationFn: async (agencyId: number) => {
      return await apiRequest("DELETE", `/api/agencies/${agencyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agencies"] });
      toast({ title: "Success", description: "Agency deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete agency. Make sure it has no clients or users.", variant: "destructive" });
    },
  });

  const handleCreateAgency = () => {
    if (!newAgencyName.trim()) {
      toast({ title: "Error", description: "Agency name is required", variant: "destructive" });
      return;
    }
    createAgencyMutation.mutate({ name: newAgencyName.trim(), defaultLanguage: newAgencyLanguage });
  };

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role, agencyId, clientAccess }: { userId: string; role: string; agencyId?: number; clientAccess?: number[] }) => {
      await apiRequest("PATCH", `/api/users/${userId}/role`, { role, agencyId, clientAccess });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Success", description: "User role updated successfully" });
      setEditingUser(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update user role", variant: "destructive" });
    },
  });

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setSelectedRole(user.role === "agency_client" ? "agency_client" : "agency_admin");
    setSelectedAgency(user.agencyId?.toString() || "");
    setSelectedClients(user.clientAccess || []);
  };

  const handleSaveRole = () => {
    if (!editingUser) return;
    updateRoleMutation.mutate({
      userId: editingUser.id,
      role: selectedRole,
      agencyId: selectedAgency ? parseInt(selectedAgency) : undefined,
      clientAccess: selectedRole === "agency_client" ? selectedClients : undefined,
    });
  };

  const toggleClientAccess = (clientId: number) => {
    setSelectedClients(prev => prev.includes(clientId) ? [] : [clientId]);
  };

  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case "owner":
      case "agency_admin":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Admin</Badge>;
      case "agency_employee":
        return <Badge variant="outline">Disabled</Badge>;
      case "agency_client":
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Client</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Member</Badge>;
    }
  };

  const getInitials = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user.email?.[0]?.toUpperCase() || "U";
  };

  return (
    <AppLayout title="Admin Settings">
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        <Tabs defaultValue="agency" className="w-full">
          <div className="overflow-x-auto mb-8 -mx-1 px-1">
            <TabsList className="inline-flex min-w-full h-auto flex-wrap gap-1 bg-card border border-border p-1">
              <TabsTrigger value="agency" className="flex-1 min-w-[120px]" data-testid="tab-agency">Agency Profile</TabsTrigger>
              {currentUser?.role === "owner" && (
                <TabsTrigger value="agencies" className="flex-1 min-w-[100px]" data-testid="tab-agencies">
                  <Building2 className="mr-2 h-4 w-4" />
                  Agencies
                </TabsTrigger>
              )}
              {currentUser?.role === "owner" && (
                <TabsTrigger value="users" className="flex-1 min-w-[80px]" data-testid="tab-users">
                  <Users className="mr-2 h-4 w-4" />
                  Users
                </TabsTrigger>
              )}
              <TabsTrigger value="templates" className="flex-1 min-w-[140px]" data-testid="tab-templates">Prompt Templates</TabsTrigger>
            </TabsList>
          </div>

          {currentUser?.role === "owner" && (
            <TabsContent value="agencies" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-medium">Agency Management</h3>
                  <p className="text-sm text-muted-foreground">Create and manage agencies on the platform.</p>
                </div>
                <Dialog open={createAgencyDialogOpen} onOpenChange={setCreateAgencyDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-agency">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Agency
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create New Agency</DialogTitle>
                      <DialogDescription>Add a new agency to the platform. You can then invite an agency admin to manage it.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-agency-name">Agency Name</Label>
                        <Input
                          id="new-agency-name"
                          placeholder="Enter agency name"
                          value={newAgencyName}
                          onChange={(e) => setNewAgencyName(e.target.value)}
                          data-testid="input-new-agency-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-agency-language">Default Language</Label>
                        <Select value={newAgencyLanguage} onValueChange={setNewAgencyLanguage}>
                          <SelectTrigger data-testid="select-new-agency-language">
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="English (US)">English (US)</SelectItem>
                            <SelectItem value="English (UK)">English (UK)</SelectItem>
                            <SelectItem value="Spanish">Spanish</SelectItem>
                            <SelectItem value="French">French</SelectItem>
                            <SelectItem value="German">German</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button 
                        onClick={handleCreateAgency} 
                        className="w-full"
                        disabled={createAgencyMutation.isPending}
                        data-testid="button-submit-create-agency"
                      >
                        {createAgencyMutation.isPending ? "Creating..." : "Create Agency"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>All Agencies</CardTitle>
                  <CardDescription>Agencies registered on the platform</CardDescription>
                </CardHeader>
                <CardContent>
                  {agencies.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Building2 className="mx-auto h-12 w-12 mb-4 opacity-50" />
                      <p>No agencies yet. Create your first agency to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {agencies.map((agency) => (
                        <div key={agency.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{agency.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {agency.defaultLanguage || "English (US)"} • ID: {agency.id}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-100"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete "${agency.name}"? This cannot be undone.`)) {
                                  deleteAgencyMutation.mutate(agency.id);
                                }
                              }}
                              disabled={deleteAgencyMutation.isPending}
                              data-testid={`button-delete-agency-${agency.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Next Steps</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>1. <strong>Create an agency</strong> using the button above</p>
                  <p>2. <strong>Go to Users tab</strong> and click "Invite User"</p>
                  <p>3. <strong>Select Admin</strong> and assign them to the new agency</p>
                  <p>4. <strong>Share the invite link</strong> with the admin</p>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {currentUser?.role === "owner" && (
            <TabsContent value="users" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-medium">User Management</h3>
                  <p className="text-sm text-muted-foreground">Admin and Client accounts. Former employee accounts are disabled.</p>
                </div>
                <Dialog open={inviteDialogOpen} onOpenChange={(open) => { setInviteDialogOpen(open); if (!open) resetInviteForm(); }}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-invite-user">
                      <Plus className="mr-2 h-4 w-4" />
                      Invite User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Invite New User</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {!generatedLink ? (
                        <>
                          <div className="space-y-2">
                            <Label>Email (optional)</Label>
                            <Input
                              type="email"
                              placeholder="user@example.com"
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              data-testid="input-invite-email"
                            />
                            <p className="text-xs text-muted-foreground">If provided, the invite will be associated with this email.</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Role</Label>
                            <Select value={inviteRole} onValueChange={setInviteRole}>
                              <SelectTrigger data-testid="select-invite-role">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="agency_admin">Admin</SelectItem>
                                <SelectItem value="agency_client">Client</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {(inviteRole === "agency_admin" || inviteRole === "agency_client") && (
                            <div className="space-y-2">
                              <Label>Agency</Label>
                              <Select value={inviteAgency} onValueChange={(value) => { setInviteAgency(value); setInviteClients([]); }}>
                                <SelectTrigger data-testid="select-invite-agency">
                                  <SelectValue placeholder="Select agency" />
                                </SelectTrigger>
                                <SelectContent>
                                  {agencies.map((agency) => (
                                    <SelectItem key={agency.id} value={agency.id.toString()}>
                                      {agency.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {inviteRole === "agency_client" && inviteAgency && (
                            <div className="space-y-2">
                              <Label>Assigned Clients</Label>
                              <div className="grid gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                                {clients
                                  .filter(c => c.agencyId === parseInt(inviteAgency))
                                  .map((client) => (
                                    <div key={client.id} className="flex items-center space-x-2">
                                      <Switch
                                        id={`invite-client-${client.id}`}
                                        checked={inviteClients.includes(client.id)}
                                        onCheckedChange={() => toggleInviteClient(client.id)}
                                        data-testid={`switch-invite-client-${client.id}`}
                                      />
                                      <Label htmlFor={`invite-client-${client.id}`} className="text-sm">
                                        {client.name}
                                      </Label>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                          <Button 
                            onClick={handleCreateInvite} 
                            className="w-full"
                            disabled={createInviteMutation.isPending || !inviteAgency || (inviteRole === "agency_client" && inviteClients.length !== 1)}
                            data-testid="button-generate-invite"
                          >
                            {createInviteMutation.isPending ? "Generating..." : "Generate Invite Link"}
                          </Button>
                        </>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                            <Link className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <Input 
                              value={generatedLink} 
                              readOnly 
                              className="border-0 bg-transparent text-sm"
                              data-testid="input-generated-link"
                            />
                          </div>
                          <Button 
                            onClick={() => copyToClipboard(generatedLink)} 
                            className="w-full"
                            data-testid="button-copy-link"
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Link
                          </Button>
                          <Button 
                            onClick={resetInviteForm} 
                            variant="outline"
                            className="w-full"
                            data-testid="button-create-another"
                          >
                            Create Another Invite
                          </Button>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4">
                {users.map((user) => (
                  <Card key={user.id} data-testid={`card-user-${user.id}`}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={user.profileImageUrl || undefined} />
                          <AvatarFallback>{getInitials(user)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {user.firstName && user.lastName 
                              ? `${user.firstName} ${user.lastName}` 
                              : user.email || "Unknown User"}
                          </div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {getRoleBadge(user.role)}
                        {user.agencyId && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Building2 className="h-4 w-4" />
                            Agency {user.agencyId}
                          </div>
                        )}
                        <Dialog open={editingUser?.id === user.id} onOpenChange={(open) => !open && setEditingUser(null)}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleEditUser(user)}
                              data-testid={`button-edit-user-${user.id}`}
                            >
                              <Shield className="mr-2 h-4 w-4" />
                              Manage Role
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Manage User Role</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>User</Label>
                                <div className="text-sm text-muted-foreground">
                                  {user.firstName} {user.lastName} ({user.email})
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Role</Label>
                                <Select value={selectedRole} onValueChange={setSelectedRole}>
                                  <SelectTrigger data-testid="select-role">
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="agency_admin">Admin</SelectItem>
                                    <SelectItem value="agency_client">Client</SelectItem>
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  {selectedRole === "agency_admin" && "Can manage an agency and its clients."}
                                  {selectedRole === "agency_client" && "Can access one assigned client workspace."}
                                </p>
                              </div>

                              {(selectedRole === "agency_admin" || selectedRole === "agency_client") && user.role !== "owner" && (
                                <div className="space-y-2">
                                  <Label>Agency</Label>
                                  <Select value={selectedAgency} onValueChange={(value) => { setSelectedAgency(value); setSelectedClients([]); }}>
                                    <SelectTrigger data-testid="select-agency">
                                      <SelectValue placeholder="Select agency" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {agencies.map((agency) => (
                                        <SelectItem key={agency.id} value={agency.id.toString()}>
                                          {agency.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {selectedRole === "agency_client" && selectedAgency && user.role !== "owner" && (
                                <div className="space-y-2">
                                  <Label>Assigned Clients</Label>
                                  <div className="grid gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                                    {clients
                                      .filter(c => c.agencyId === parseInt(selectedAgency))
                                      .map((client) => (
                                        <div key={client.id} className="flex items-center space-x-2">
                                          <Switch
                                            id={`client-${client.id}`}
                                            checked={selectedClients.includes(client.id)}
                                            onCheckedChange={() => toggleClientAccess(client.id)}
                                            data-testid={`switch-client-${client.id}`}
                                          />
                                          <Label htmlFor={`client-${client.id}`} className="text-sm">
                                            {client.name}
                                          </Label>
                                        </div>
                                      ))}
                                    {clients.filter(c => c.agencyId === parseInt(selectedAgency)).length === 0 && (
                                      <p className="text-sm text-muted-foreground">No clients in this agency.</p>
                                    )}
                                  </div>
                                </div>
                              )}

                              <Button 
                                onClick={handleSaveRole} 
                                className="w-full"
                                disabled={updateRoleMutation.isPending || (user.role !== "owner" && !selectedAgency) || (selectedRole === "agency_client" && selectedClients.length !== 1)}
                                data-testid="button-save-role"
                              >
                                {updateRoleMutation.isPending ? "Saving..." : "Save Changes"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {users.length === 0 && (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No users have signed up yet.</p>
                      <p className="text-sm">Users will appear here after they log in for the first time.</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {invites.filter(i => !i.usedAt).length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Pending Invites</h3>
                  <div className="grid gap-4">
                    {invites.filter(i => !i.usedAt).map((invite) => (
                      <Card key={invite.id} data-testid={`card-invite-${invite.id}`}>
                        <CardContent className="flex items-center justify-between py-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              <Mail className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="font-medium">
                                {invite.email || "No email specified"}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Role: {invite.role === "agency_client" ? "Client" : invite.role === "agency_admin" ? "Admin" : "Disabled legacy invite"} {invite.agencyId ? `• Agency ${invite.agencyId}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {invite.email && invite.role === "agency_client" && invite.clientAccess?.length === 1 && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={sendInviteMutation.isPending || !!(invite.expiresAt && new Date(invite.expiresAt) < new Date())}
                                onClick={() => sendInviteMutation.mutate(invite.id)}
                                data-testid={`button-send-invite-${invite.id}`}
                              >
                                <Mail className="h-4 w-4 mr-2" /> Send email
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(`${window.location.origin}/api/login?invite_token=${invite.token}`)}
                              data-testid={`button-copy-invite-${invite.id}`}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteInviteMutation.mutate(invite.id)}
                              disabled={deleteInviteMutation.isPending}
                              data-testid={`button-delete-invite-${invite.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value="templates" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium">Asset Templates</h3>
                <p className="text-sm text-muted-foreground">Configure system prompts and item counts for AI generation.</p>
              </div>
              <Dialog open={templateDialogOpen} onOpenChange={(open) => { setTemplateDialogOpen(open); if (!open) resetTemplateForm(); }}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-new-template">
                    <Plus className="mr-2 h-4 w-4" /> New Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingTemplate ? "Edit Template" : "Create New Template"}</DialogTitle>
                    <DialogDescription>
                      Configure how AI generates assets for this event and asset type combination.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Template Name</Label>
                        <Input
                          placeholder="e.g., Masterclass Email Sequence"
                          value={templateForm.name}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                          data-testid="input-template-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Number of Items</Label>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={templateForm.itemCount}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, itemCount: parseInt(e.target.value) || 1 }))}
                          data-testid="input-item-count"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Event Type</Label>
                        <Select 
                          value={templateForm.eventType} 
                          onValueChange={(v) => setTemplateForm(prev => ({ ...prev, eventType: v }))}
                        >
                          <SelectTrigger data-testid="select-event-type">
                            <SelectValue placeholder="Select event type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="webinar">Masterclass</SelectItem>
                            <SelectItem value="summit">Summit</SelectItem>
                            <SelectItem value="challenge">Challenge</SelectItem>
                            <SelectItem value="workshop">Workshop</SelectItem>
                            <SelectItem value="masterclass">Masterclass</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Asset Type</Label>
                        <Select 
                          value={templateForm.assetType} 
                          onValueChange={(v) => setTemplateForm(prev => ({ ...prev, assetType: v }))}
                        >
                          <SelectTrigger data-testid="select-asset-type">
                            <SelectValue placeholder="Select asset type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="email">Email Sequence</SelectItem>
                            <SelectItem value="sms">SMS Messages</SelectItem>
                            <SelectItem value="social_linkedin">LinkedIn Posts</SelectItem>
                            <SelectItem value="social_facebook">Facebook Posts</SelectItem>
                            <SelectItem value="social_instagram">Instagram Posts</SelectItem>
                            <SelectItem value="script">Video Scripts</SelectItem>
                            <SelectItem value="slides">Slide Outline</SelectItem>
                            <SelectItem value="ad_copy">Ad Copy</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>System Prompt</Label>
                      <Textarea
                        className="font-mono text-xs h-40"
                        placeholder="You are an expert copywriter. Generate [itemCount] [assetType] for a [eventType] about..."
                        value={templateForm.systemPrompt}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, systemPrompt: e.target.value }))}
                        data-testid="input-system-prompt"
                      />
                      <p className="text-xs text-muted-foreground">
                        Use placeholders like {"{eventName}"}, {"{clientName}"}, {"{brandVoice}"}, {"{targetAudience}"} that will be replaced with real data.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Include Instructions (Optional)</Label>
                      <Textarea
                        className="font-mono text-xs h-24"
                        placeholder="Additional instructions to append to the prompt, such as formatting requirements..."
                        value={templateForm.includeInstructions}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, includeInstructions: e.target.value }))}
                        data-testid="input-include-instructions"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Output Format (Optional)</Label>
                      <Textarea
                        className="font-mono text-xs h-16"
                        placeholder="JSON schema or format specification for structured output..."
                        value={templateForm.outputFormat}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, outputFormat: e.target.value }))}
                        data-testid="input-output-format"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="template-active"
                        checked={templateForm.isActive}
                        onCheckedChange={(checked) => setTemplateForm(prev => ({ ...prev, isActive: checked }))}
                        data-testid="switch-template-active"
                      />
                      <Label htmlFor="template-active">Template Active</Label>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => { setTemplateDialogOpen(false); resetTemplateForm(); }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveTemplate}
                        disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending || !templateForm.name || !templateForm.systemPrompt}
                        data-testid="button-save-template"
                      >
                        {(createTemplateMutation.isPending || updateTemplateMutation.isPending) ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4">
              {templates.map((template) => (
                <Card key={template.id} data-testid={`card-template-${template.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        {!template.isActive && (
                          <Badge variant="outline" className="text-xs">Inactive</Badge>
                        )}
                      </div>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{template.eventType === "webinar" ? "Masterclass" : template.eventType}</Badge>
                        <Badge variant="outline" className="text-xs">{template.assetType}</Badge>
                        <span className="text-xs">• {template.itemCount} items</span>
                      </CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleEditTemplate(template)}
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => deleteTemplateMutation.mutate(template.id)}
                        disabled={deleteTemplateMutation.isPending}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="text-xs font-mono bg-muted/50 rounded p-3 max-h-24 overflow-y-auto text-muted-foreground">
                      {template.systemPrompt.length > 200 
                        ? `${template.systemPrompt.substring(0, 200)}...` 
                        : template.systemPrompt}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {templates.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No templates configured yet.</p>
                    <p className="text-sm">Create templates to define how AI generates different asset types.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="agency" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Agency Profile</CardTitle>
                <CardDescription>Manage your agency settings and global defaults.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {agencyId === null ? (
                  <p className="text-sm text-muted-foreground">
                    This account is not assigned to an agency. Create an agency from the Agencies tab, then assign an agency admin to manage its profile.
                  </p>
                ) : (
                  <>
                <div className="space-y-2">
                  <Label>Agency Name</Label>
                  <Input 
                    value={agencyName} 
                    onChange={(e) => setAgencyName(e.target.value)}
                    data-testid="input-agency-name" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Default Language</Label>
                  <Input 
                    value={agencyDefaultLanguage} 
                    onChange={(e) => setAgencyDefaultLanguage(e.target.value)}
                    data-testid="input-default-language" 
                  />
                </div>
                <Button 
                  onClick={handleSaveAgencyProfile}
                  disabled={updateAgencyMutation.isPending}
                  data-testid="button-save-agency-profile"
                >
                  {updateAgencyMutation.isPending ? "Saving..." : "Save Profile"}
                </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
