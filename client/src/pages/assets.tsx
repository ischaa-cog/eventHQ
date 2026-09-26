import { useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, File, Mail, MessageSquare, Presentation, Video, Image } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface Asset {
  id: number;
  eventId: number;
  assetType: string;
  title: string;
  content: string;
  status: string | null;
  version: number | null;
  ownerRole: string | null;
  driveUrl: string | null;
  createdAt: string;
  updatedAt: string;
  eventName: string;
  clientName: string;
}

interface PortalSummary {
  driveUrl: string | null;
}

const getAssetIcon = (assetType: string) => {
  switch (assetType.toLowerCase()) {
    case "email_sequence":
    case "email":
      return Mail;
    case "social_posts":
    case "social":
      return MessageSquare;
    case "slide_outline":
    case "slides":
      return Presentation;
    case "video_script":
      return Video;
    case "image":
      return Image;
    default:
      return FileText;
  }
};

const formatAssetType = (assetType: string) => {
  return assetType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins} min ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

type FilterStatus = "all" | "draft" | "approved";

export default function AssetsPage() {
  const [, params] = useRoute("/client/:id/assets");
  const clientId = params?.id ? parseInt(params.id) : null;
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterStatus>("all");

  if (!clientId || isNaN(clientId)) {
    return (
      <AppLayout title="Assets Library" mode="client">
        <div className="text-center py-12 text-muted-foreground">
          Invalid client. Please select a client from the dashboard.
        </div>
      </AppLayout>
    );
  }

  const { data: assets, isLoading, isError } = useQuery<Asset[]>({
    queryKey: [`/api/clients/${clientId}/assets`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/assets`);
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
  });

  const { data: portalSummary } = useQuery<PortalSummary>({
    queryKey: [`/api/clients/${clientId}/portal-summary`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/portal-summary`);
      if (!res.ok) throw new Error("Failed to fetch portal summary");
      return res.json();
    },
  });

  const handleDownload = (asset: Asset) => {
    const blob = new Blob([asset.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${asset.title.replace(/[^a-z0-9]/gi, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Downloaded",
      description: `${asset.title} has been downloaded.`,
    });
  };

  return (
    <AppLayout title="Assets Library" mode="client">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Button 
              variant={filter === "all" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setFilter("all")}
              data-testid="button-filter-all"
            >
              All
            </Button>
            <Button 
              variant={filter === "draft" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setFilter("draft")}
              data-testid="button-filter-drafts"
            >
              Drafts
            </Button>
            <Button 
              variant={filter === "approved" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setFilter("approved")}
              data-testid="button-filter-approved"
            >
              Approved
            </Button>
          </div>
          {portalSummary?.driveUrl ? (
            <a href={portalSummary.driveUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" data-testid="button-open-drive">
                <ExternalLink className="mr-2 h-4 w-4" /> Open Drive Folder
              </Button>
            </a>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="outline"
                disabled
                title="No Drive folder has been connected for this client."
                data-testid="button-open-drive"
              >
                <ExternalLink className="mr-2 h-4 w-4" /> Drive folder unavailable
              </Button>
              <span className="text-xs text-muted-foreground">No Drive folder connected for this client.</span>
            </div>
          )}
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Asset Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading assets...
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-destructive">
                    Unable to load assets. Please try again.
                  </TableCell>
                </TableRow>
              ) : !assets || assets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No assets yet. Generate assets from the Event Builder.
                  </TableCell>
                </TableRow>
              ) : (
                assets
                  .filter((asset) => {
                    if (filter === "all") return true;
                    if (filter === "approved") return asset.status === "approved";
                    if (filter === "draft") return !asset.status || asset.status === "draft";
                    return true;
                  })
                  .map((asset) => {
                  const IconComponent = getAssetIcon(asset.assetType);
                  return (
                    <TableRow key={asset.id} data-testid={`row-asset-${asset.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted rounded-md">
                            <IconComponent className="h-4 w-4 text-primary" />
                          </div>
                          {asset.title}
                        </div>
                      </TableCell>
                      <TableCell>{formatAssetType(asset.assetType)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{asset.clientName}</span>
                          <span className="text-xs text-muted-foreground">{asset.eventName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            asset.status === "approved"
                              ? "default"
                              : asset.status === "in_review"
                              ? "secondary"
                              : "outline"
                          }
                          className={
                            asset.status === "approved"
                              ? "bg-green-100 text-green-700 hover:bg-green-200 border-green-200 shadow-none"
                              : asset.status === "in_review"
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200 shadow-none"
                              : "text-muted-foreground"
                          }
                        >
                          {asset.status ? formatAssetType(asset.status) : "Draft"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(asset.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(asset)}
                          data-testid={`button-download-${asset.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
