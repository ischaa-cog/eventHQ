import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Upload, FileText, Trash2, Eye, Pencil, Save, Check, Camera, RefreshCw, Copy, Link, HardDrive, ExternalLink, Unlink, Megaphone } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface VaultAsset {
  id: number;
  clientId: number;
  name: string;
  fileType: string;
  content: string | null;
  url: string | null;
  createdAt: string;
}

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
  brandVoiceTone: string[] | null;
  brandVoiceDos: string | null;
  brandVoiceDonts: string | null;
  bannedWords: string | null;
  styleGuide: string | null;
  headshot: string | null;
  onboardingComplete: boolean;
}

const AVAILABLE_TONES = [
  "Professional",
  "Authoritative",
  "Direct",
  "Friendly",
  "Conversational",
  "Bold",
  "Inspiring",
  "Educational",
  "Empathetic",
  "Witty",
  "Casual",
  "Urgent",
  "Luxurious",
  "Playful",
  "Confident",
  "Trustworthy",
  "Passionate",
  "No-nonsense",
];

interface GoogleDriveStatus {
  connected: boolean;
  email: string | null;
  folderUrl: string | null;
}

interface MetaAdsStatus {
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  connectedAt: string | null;
}

function MetaAdsCard({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<MetaAdsStatus>({
    queryKey: [`/api/clients/${clientId}/meta-ads/status`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/meta-ads/status`);
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
  });

  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/meta-ads/authorize`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to authorize");
      }
      const data = await res.json();
      window.location.href = data.authUrl;
    } catch (error: any) {
      setIsConnecting(false);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/meta-ads`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/meta-ads/status`] });
      toast({ title: "Disconnected", description: "Meta Ads has been disconnected from this client." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect Meta Ads.", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Meta Ads Integration
        </CardTitle>
        <CardDescription>
          Connect this client's Meta (Facebook) Ads account to see live ad spend on the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : status?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Check className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-medium text-blue-700 dark:text-blue-300">Connected</p>
                {status.accountName && (
                  <p className="text-sm text-blue-600 dark:text-blue-400">{status.accountName}</p>
                )}
                {status.accountId && (
                  <p className="text-xs text-blue-500 dark:text-blue-500">{status.accountId}</p>
                )}
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="button-disconnect-meta-ads"
            >
              <Unlink className="mr-2 h-4 w-4" />
              {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect Meta Ads"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect this client's Meta Ads account to pull live ad spend data (Today, MTD, QTD, YTD) 
              directly into the client dashboard.
            </p>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3 space-y-1">
              <p className="font-medium">Requirements:</p>
              <p>• A Meta Developer App with <code>ads_read</code> permission</p>
              <p>• META_APP_ID and META_APP_SECRET must be set in environment secrets</p>
            </div>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              data-testid="button-connect-meta-ads"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {isConnecting ? "Connecting..." : "Connect Meta Ads"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GoogleDriveCard({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: driveStatus, isLoading } = useQuery<GoogleDriveStatus>({
    queryKey: [`/api/clients/${clientId}/google-drive/status`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/google-drive/status`);
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
  });

  const [isConnecting, setIsConnecting] = useState(false);
  const [folderLink, setFolderLink] = useState("");
  useEffect(() => { if (driveStatus) setFolderLink(driveStatus.folderUrl || ""); }, [driveStatus?.folderUrl]);
  const folderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/google-drive/folder`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: folderLink.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Unable to save folder link");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/google-drive/status`] });
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/portal-summary`] });
      toast({ title: "Drive folder link saved" });
    },
    onError: (error: Error) => toast({ title: "Could not save folder", description: error.message, variant: "destructive" }),
  });

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/google-drive/authorize`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to authorize");
      }
      const data = await res.json();
      window.location.href = data.authUrl;
    } catch (error: any) {
      setIsConnecting(false);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/google-drive`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/google-drive/status`] });
      toast({
        title: "Disconnected",
        description: "Google Drive has been disconnected from this client.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect Google Drive.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Google Drive Integration
        </CardTitle>
        <CardDescription>
          Connect this client's Google Drive to automatically upload generated assets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : driveStatus?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-medium text-green-700 dark:text-green-300">Connected</p>
                <p className="text-sm text-green-600 dark:text-green-400">{driveStatus.email}</p>
              </div>
            </div>
            
            <Button
              variant="destructive"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="button-disconnect-gdrive"
            >
              <Unlink className="mr-2 h-4 w-4" />
              {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect Google Drive"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect this client's Google Drive account to automatically save generated assets 
              directly to their Drive. A dedicated folder will be created for this client.
            </p>
            
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              data-testid="button-connect-gdrive"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {isConnecting ? "Connecting..." : "Connect Google Drive"}
            </Button>
          </div>
        )}
        <div className="border-t pt-4 space-y-2">
          <Label htmlFor="client-drive-folder-link">Client Drive folder link</Label>
          <div className="flex gap-2">
            <Input id="client-drive-folder-link" type="url" value={folderLink} onChange={e => setFolderLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
            <Button type="button" variant="outline" disabled={folderMutation.isPending} onClick={() => folderMutation.mutate()}>Save link</Button>
          </div>
          <p className="text-xs text-muted-foreground">Share a folder without connecting Google Drive. Clients will see this link on their dashboard.</p>
          {driveStatus?.folderUrl && <a className="inline-flex items-center gap-1 text-sm text-primary underline" target="_blank" rel="noopener noreferrer" href={driveStatus.folderUrl}>Open folder <ExternalLink className="h-3 w-3" /></a>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClientWorkspacePage() {
  const [, params] = useRoute("/client/:id/workspace");
  const clientId = params?.id ? parseInt(params.id) : 1;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "agency_admin";

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toneDialogOpen, setToneDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<VaultAsset | null>(null);

  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetType, setNewAssetType] = useState("TXT");
  const [newAssetContent, setNewAssetContent] = useState("");

  const [brandVoiceDos, setBrandVoiceDos] = useState("");
  const [brandVoiceDonts, setBrandVoiceDonts] = useState("");
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  const [tempSelectedTones, setTempSelectedTones] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState("profile");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [niche, setNiche] = useState("");
  const [website, setWebsite] = useState("");
  const [primaryOffer, setPrimaryOffer] = useState("");
  const [styleGuide, setStyleGuide] = useState("");
  const [bannedWords, setBannedWords] = useState("");
  const [headshot, setHeadshot] = useState("");
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  const { data: client } = useQuery<Client>({
    queryKey: [`/api/clients/${clientId}`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}`);
      if (!res.ok) throw new Error("Failed to fetch client");
      return res.json();
    },
  });

  const { data: webhookConfig } = useQuery<{ webhookToken: string | null }>({
    queryKey: [`/api/clients/${clientId}/webhook-token`],
    enabled: isAdmin,
  });

  // Fetch headshot separately since it's excluded from the main client response for performance
  const { data: headshotData } = useQuery<{ headshot: string | null }>({
    queryKey: [`/api/clients/${clientId}/headshot`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/headshot`);
      if (!res.ok) throw new Error("Failed to fetch headshot");
      return res.json();
    },
  });

  useEffect(() => {
    if (client) {
      setBrandVoiceDos(client.brandVoiceDos || "");
      setBrandVoiceDonts(client.brandVoiceDonts || "");
      setSelectedTones(client.brandVoiceTone || []);
      setFullName(client.fullName || "");
      setEmail(client.email || "");
      setPhone(client.phone || "");
      setBusinessAddress(client.businessAddress || "");
      setBusinessName(client.businessName || "");
      setNiche(client.niche || "");
      setWebsite(client.website || "");
      setPrimaryOffer(client.primaryOffer || "");
      setStyleGuide(client.styleGuide || "");
      setBannedWords(client.bannedWords || "");
      setOnboardingComplete(client.onboardingComplete || false);
    }
  }, [client]);

  // Update headshot when fetched (handles both setting and clearing headshot)
  useEffect(() => {
    if (headshotData !== undefined) {
      setHeadshot(headshotData?.headshot || "");
    }
  }, [headshotData]);

  const { data: vaultAssets = [], isLoading: assetsLoading } = useQuery<VaultAsset[]>({
    queryKey: [`/api/clients/${clientId}/vault-assets`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/vault-assets`);
      if (!res.ok) throw new Error("Failed to fetch vault assets");
      return res.json();
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async (data: Partial<Client>) => {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update client");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/webhook-token`] });
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/headshot`] });
      toast({
        title: "Saved",
        description: "Brand voice settings have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createAssetMutation = useMutation({
    mutationFn: async (data: { name: string; fileType: string; content: string }) => {
      const res = await fetch(`/api/clients/${clientId}/vault-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create vault asset");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/vault-assets`] });
      setUploadDialogOpen(false);
      setNewAssetName("");
      setNewAssetType("TXT");
      setNewAssetContent("");
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/vault-assets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete vault asset");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/vault-assets`] });
      setDeleteDialogOpen(false);
      setSelectedAsset(null);
    },
  });

  const handleSaveProfile = () => {
    updateClientMutation.mutate({
      ...(isAdmin ? { name: fullName || client?.name } : {}),
      fullName,
      email,
      phone,
      businessAddress,
      businessName,
      niche,
      website,
      primaryOffer,
    });
  };

  const handleSaveBrandVoice = () => {
    updateClientMutation.mutate({
      brandVoiceDos,
      brandVoiceDonts,
      brandVoiceTone: selectedTones,
    });
  };

  const handleSaveStyleGuide = () => {
    updateClientMutation.mutate({
      styleGuide,
      bannedWords,
    });
  };

  const regenerateTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/regenerate-webhook-token`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to regenerate token");
      return res.json();
    },
    onSuccess: (data: { webhookToken: string }) => {
      queryClient.setQueryData([`/api/clients/${clientId}/webhook-token`], data);
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/webhook-token`] });
      toast({
        title: "Token Regenerated",
        description: "Your webhook token has been regenerated. Update your HighLevel webhook URL.",
      });
    },
  });

  const handleCopyWebhookUrl = () => {
    if (webhookConfig?.webhookToken) {
      const url = `${window.location.origin}/api/webhooks/highlevel/sale?token=${webhookConfig.webhookToken}`;
      navigator.clipboard.writeText(url);
      toast({
        title: "Copied!",
        description: "Webhook URL copied to clipboard.",
      });
    }
  };

  const handleHeadshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Could not read the selected image."));
          reader.onerror = () => reject(new Error("Could not read the selected image."));
          reader.readAsDataURL(file);
        });

        const response = await fetch('/api/convert-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData: base64 }),
        });

        if (!response.ok) {
          const rejection = await response.json().catch(() => null);
          throw new Error(rejection?.error || rejection?.message || "Image conversion was rejected.");
        }

        const { imageData: jpegBase64 } = await response.json();
        setHeadshot(jpegBase64);
        updateClientMutation.mutate({ headshot: jpegBase64 });
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error
            ? error.message
            : "Failed to process image. Please try a different file.",
          variant: "destructive",
        });
      }
    }
  };

  const handleOpenToneDialog = () => {
    setTempSelectedTones([...selectedTones]);
    setToneDialogOpen(true);
  };

  const handleToneToggle = (tone: string) => {
    if (tempSelectedTones.includes(tone)) {
      setTempSelectedTones(tempSelectedTones.filter(t => t !== tone));
    } else if (tempSelectedTones.length < 3) {
      setTempSelectedTones([...tempSelectedTones, tone]);
    }
  };

  const handleSaveTones = () => {
    setSelectedTones(tempSelectedTones);
    setToneDialogOpen(false);
    updateClientMutation.mutate({
      brandVoiceTone: tempSelectedTones,
    });
  };

  const handleUpload = () => {
    if (!newAssetName.trim() || !newAssetContent.trim()) return;
    createAssetMutation.mutate({
      name: newAssetName.trim(),
      fileType: newAssetType,
      content: newAssetContent.trim(),
    });
  };

  const handleView = (asset: VaultAsset) => {
    setSelectedAsset(asset);
    setViewDialogOpen(true);
  };

  const handleDeleteClick = (asset: VaultAsset) => {
    setSelectedAsset(asset);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedAsset) {
      deleteAssetMutation.mutate(selectedAsset.id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const clientName = client?.name || "Client";
  const clientInitials = clientName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const displayTones = selectedTones.length > 0 ? selectedTones : ["Professional", "Authoritative", "Direct"];

  return (
    <AppLayout title={`Client Profile: ${clientName}`} mode="client">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {headshot ? (
              <img 
                src={headshot} 
                alt={clientName} 
                className="h-16 w-16 rounded-full object-cover border-2 border-primary/20"
                data-testid="img-client-avatar"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl">
                {clientInitials}
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold">{clientName}</h2>
              <div className="flex items-center gap-2 text-muted-foreground">
                {client?.niche && <Badge variant="outline">{client.niche}</Badge>}
              </div>
            </div>
          </div>
          {activeTab === "profile" && (
            <Button 
              onClick={handleSaveProfile}
              disabled={updateClientMutation.isPending}
              data-testid="button-save-profile"
            >
              <Save className="mr-2 h-4 w-4" />
              {updateClientMutation.isPending ? "Saving..." : "Save Profile"}
            </Button>
          )}
        </div>

        <Tabs defaultValue="profile" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
            <TabsTrigger 
              value="profile" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-profile"
            >
              Profile & Strategy
            </TabsTrigger>
            <TabsTrigger 
              value="voice" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-voice"
            >
              Brand Voice
            </TabsTrigger>
            <TabsTrigger 
              value="vault" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-vault"
            >
              Upload Vault
            </TabsTrigger>
            <TabsTrigger 
              value="style" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-style"
            >
              Style Guide
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              data-testid="tab-settings"
            >
              Webhook Settings
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="profile" className="space-y-6">
               <Card>
                 <CardHeader>
                   <CardTitle>Client Headshot</CardTitle>
                   <CardDescription>Upload a profile photo for the client.</CardDescription>
                 </CardHeader>
                 <CardContent>
                   <div className="flex items-center gap-6">
                     <div className="relative">
                       {headshot ? (
                         <img 
                           src={headshot} 
                           alt="Client headshot" 
                           className="w-24 h-24 rounded-full object-cover border-2 border-border"
                           data-testid="img-headshot-preview"
                         />
                       ) : (
                         <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-border">
                           <Camera className="h-8 w-8 text-muted-foreground" />
                         </div>
                       )}
                     </div>
                     <div className="space-y-2">
                       <Label htmlFor="headshot-upload" className="cursor-pointer">
                         <Button variant="outline" asChild>
                           <span>
                             <Upload className="mr-2 h-4 w-4" />
                             Upload Photo
                           </span>
                         </Button>
                       </Label>
                       <input
                         id="headshot-upload"
                         type="file"
                         accept="image/*"
                         onChange={handleHeadshotUpload}
                         className="hidden"
                         data-testid="input-headshot-upload"
                       />
                       <p className="text-xs text-muted-foreground">
                         Recommended: Square image, at least 200x200 pixels
                       </p>
                     </div>
                   </div>
                 </CardContent>
               </Card>

               <Card>
                 <CardHeader>
                   <CardTitle>Contact Information</CardTitle>
                   <CardDescription>Client contact and business details.</CardDescription>
                 </CardHeader>
                 <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input 
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Doe"
                        data-testid="input-full-name" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input 
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="john@example.com"
                        data-testid="input-email" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(555) 123-4567"
                        data-testid="input-phone" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Business Name</Label>
                      <Input 
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Acme Corp"
                        data-testid="input-business-name" 
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-2 space-y-2">
                      <Label>Business Address</Label>
                      <Input 
                        value={businessAddress}
                        onChange={(e) => setBusinessAddress(e.target.value)}
                        placeholder="123 Main St, City, State 12345"
                        data-testid="input-business-address" 
                      />
                    </div>
                 </CardContent>
               </Card>

               <Card>
                 <CardHeader>
                   <CardTitle>Core Identity</CardTitle>
                   <CardDescription>Business positioning and strategy.</CardDescription>
                 </CardHeader>
                 <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Niche / Industry</Label>
                      <Input 
                        value={niche}
                        onChange={(e) => setNiche(e.target.value)}
                        placeholder="Health & Wellness"
                        data-testid="input-niche" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Website URL</Label>
                      <Input 
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://example.com"
                        data-testid="input-website" 
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Primary Offer</Label>
                      <Textarea 
                        value={primaryOffer}
                        onChange={(e) => setPrimaryOffer(e.target.value)}
                        placeholder="Describe the client's main product or service offering..."
                        data-testid="input-primary-offer" 
                      />
                    </div>
                 </CardContent>
               </Card>

               <Card>
                 <CardHeader>
                   <CardTitle>Client Status</CardTitle>
                   <CardDescription>Control the client's onboarding visibility.</CardDescription>
                 </CardHeader>
                 <CardContent>
                   <div className="flex items-center justify-between">
                     <div className="space-y-0.5">
                       <Label htmlFor="onboarding-complete">Onboarding Complete</Label>
                       <p className="text-sm text-muted-foreground">
                          When enabled, clients see their saved setup summary instead of the onboarding form.
                       </p>
                     </div>
                     <Switch
                       id="onboarding-complete"
                       checked={onboardingComplete}
                       onCheckedChange={(checked) => {
                         setOnboardingComplete(checked);
                         updateClientMutation.mutate({ onboardingComplete: checked });
                       }}
                       data-testid="switch-onboarding-complete"
                     />
                   </div>
                 </CardContent>
               </Card>
            </TabsContent>

            <TabsContent value="voice" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>Brand Voice Rules</CardTitle>
                      <CardDescription>How the AI should sound when generating content.</CardDescription>
                    </div>
                    <Button 
                      onClick={handleSaveBrandVoice}
                      disabled={updateClientMutation.isPending}
                      data-testid="button-save-brand-voice"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {updateClientMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Tone</Label>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleOpenToneDialog}
                        data-testid="button-edit-tone"
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {displayTones.map((tone, i) => (
                        <Badge key={i} variant="secondary">{tone}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Do's</Label>
                      <Textarea 
                        className="h-32" 
                        value={brandVoiceDos}
                        onChange={(e) => setBrandVoiceDos(e.target.value)}
                        placeholder="- Use data to back up claims&#10;- Short, punchy sentences&#10;- Focus on ROI"
                        data-testid="input-dos"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Don'ts</Label>
                      <Textarea 
                        className="h-32" 
                        value={brandVoiceDonts}
                        onChange={(e) => setBrandVoiceDonts(e.target.value)}
                        placeholder="- No fluff or jargon&#10;- No em dashes (—)&#10;- Avoid passive voice"
                        data-testid="input-donts"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vault" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between">
                    <div>
                      <CardTitle>Asset Vault</CardTitle>
                      <CardDescription>Past performing assets to train the AI.</CardDescription>
                    </div>
                    <Button 
                      variant="secondary" 
                      onClick={() => setUploadDialogOpen(true)}
                      data-testid="button-upload-asset"
                    >
                      <Upload className="mr-2 h-4 w-4" /> Upload New
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {assetsLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading assets...</div>
                  ) : vaultAssets.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No assets uploaded yet.</p>
                      <p className="text-sm">Upload past performing content to help train the AI.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {vaultAssets.map((asset) => (
                        <div 
                          key={asset.id} 
                          className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 transition-colors"
                          data-testid={`vault-asset-${asset.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{asset.name}</p>
                              <p className="text-xs text-muted-foreground">{asset.fileType} • {formatDate(asset.createdAt)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleView(asset)}
                              data-testid={`button-view-asset-${asset.id}`}
                            >
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleDeleteClick(asset)}
                              data-testid={`button-delete-asset-${asset.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="style" className="space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Style Guide</CardTitle>
                          <CardDescription>Formatting rules and banned words for content generation.</CardDescription>
                        </div>
                        <Button 
                          onClick={handleSaveStyleGuide}
                          disabled={updateClientMutation.isPending}
                          data-testid="button-save-style-guide"
                        >
                          <Save className="mr-2 h-4 w-4" />
                          {updateClientMutation.isPending ? "Saving..." : "Save Style Guide"}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-muted/30 rounded-md border">
                            <h4 className="font-semibold mb-2">Formatting Rules</h4>
                            <Textarea 
                              className="min-h-32"
                              value={styleGuide}
                              onChange={(e) => setStyleGuide(e.target.value)}
                              placeholder="- Use H2 for main section headers&#10;- Bullet points should never exceed 3 lines&#10;- Always bold key benefits&#10;- CTA should always be on its own line"
                              data-testid="input-style-guide"
                            />
                        </div>
                        <div className="p-4 bg-muted/30 rounded-md border">
                            <h4 className="font-semibold mb-2">Banned Words</h4>
                            <Textarea 
                              className="min-h-24"
                              value={bannedWords}
                              onChange={(e) => setBannedWords(e.target.value)}
                              placeholder="Enter words or phrases to avoid, separated by commas or new lines..."
                              data-testid="input-banned-words"
                            />
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link className="h-5 w-5" />
                    HighLevel Webhook Integration
                  </CardTitle>
                  <CardDescription>
                    Use this webhook URL in HighLevel to automatically track sales for this client.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Webhook URL</Label>
                    <div className="flex gap-2">
                      <Input 
                        readOnly
                        value={webhookConfig?.webhookToken ? `${window.location.origin}/api/webhooks/highlevel/sale?token=${webhookConfig.webhookToken}` : "Loading..."}
                        className="font-mono text-sm"
                        data-testid="input-webhook-url"
                      />
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={handleCopyWebhookUrl}
                        data-testid="button-copy-webhook"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Copy this URL and add it as a webhook in your HighLevel workflow.
                    </p>
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <Label>Regenerate Token</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      If you need to invalidate the current webhook URL, you can regenerate the token. 
                      This will require updating the webhook URL in HighLevel.
                    </p>
                    <Button 
                      variant="destructive"
                      onClick={() => regenerateTokenMutation.mutate()}
                      disabled={regenerateTokenMutation.isPending}
                      data-testid="button-regenerate-token"
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${regenerateTokenMutation.isPending ? 'animate-spin' : ''}`} />
                      {regenerateTokenMutation.isPending ? "Regenerating..." : "Regenerate Token"}
                    </Button>
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <Label>Expected Webhook Payload</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      HighLevel should send a POST request with JSON body containing these fields:
                    </p>
                    <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
{`{
  "amount": 997.00,           // Required: Sale amount
  "productName": "VIP Course", // Optional: Product name
  "customerEmail": "john@example.com", // Optional
  "customerName": "John Doe", // Optional
  "saleDate": "2025-12-12T10:30:00Z", // Optional (defaults to now)
  "externalId": "hl_12345"    // Optional: HighLevel transaction ID
}`}
                    </pre>
                  </div>
                </CardContent>
              </Card>
              )}

              {isAdmin ? (
                <>
                  <GoogleDriveCard clientId={clientId} />
                  <MetaAdsCard clientId={clientId} />
                </>
              ) : <p className="text-sm text-muted-foreground">Connection settings are managed by your administrator.</p>}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <Dialog open={toneDialogOpen} onOpenChange={setToneDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Brand Tone</DialogTitle>
            <DialogDescription>
              Select up to 3 tones that best describe how the AI should sound when generating content for this client.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="grid grid-cols-3 gap-3">
              {AVAILABLE_TONES.map((tone) => {
                const isSelected = tempSelectedTones.includes(tone);
                const isDisabled = !isSelected && tempSelectedTones.length >= 3;
                return (
                  <div
                    key={tone}
                    className={`flex items-center space-x-2 p-2 rounded-md border cursor-pointer transition-colors ${
                      isSelected 
                        ? "bg-primary/10 border-primary" 
                        : isDisabled 
                          ? "opacity-50 cursor-not-allowed" 
                          : "hover:bg-muted"
                    }`}
                    onClick={() => !isDisabled && handleToneToggle(tone)}
                    data-testid={`tone-option-${tone.toLowerCase()}`}
                  >
                    <Checkbox 
                      checked={isSelected} 
                      disabled={isDisabled}
                      onCheckedChange={() => handleToneToggle(tone)}
                    />
                    <span className="text-sm">{tone}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              {tempSelectedTones.length}/3 tones selected
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToneDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveTones}
              disabled={tempSelectedTones.length === 0}
              data-testid="button-save-tones"
            >
              <Check className="mr-2 h-4 w-4" /> Save Tones
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload New Asset</DialogTitle>
            <DialogDescription>
              Add a past performing asset to help train the AI for this client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="asset-name">Asset Name</Label>
              <Input
                id="asset-name"
                placeholder="e.g., Best Performing Email Sequence"
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
                data-testid="input-new-asset-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-type">File Type</Label>
              <Select value={newAssetType} onValueChange={setNewAssetType}>
                <SelectTrigger data-testid="select-asset-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TXT">Text (TXT)</SelectItem>
                  <SelectItem value="MD">Markdown (MD)</SelectItem>
                  <SelectItem value="Email">Email Copy</SelectItem>
                  <SelectItem value="Script">Script</SelectItem>
                  <SelectItem value="Ad">Ad Copy</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-content">Content</Label>
              <Textarea
                id="asset-content"
                placeholder="Paste the content of your asset here..."
                className="min-h-[200px]"
                value={newAssetContent}
                onChange={(e) => setNewAssetContent(e.target.value)}
                data-testid="input-new-asset-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload} 
              disabled={!newAssetName.trim() || !newAssetContent.trim() || createAssetMutation.isPending}
              data-testid="button-confirm-upload"
            >
              {createAssetMutation.isPending ? "Uploading..." : "Upload Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedAsset?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedAsset?.fileType} • Uploaded {selectedAsset && formatDate(selectedAsset.createdAt)}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-muted/50 rounded-md p-4 max-h-[400px] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono">{selectedAsset?.content}</pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedAsset?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteAssetMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
