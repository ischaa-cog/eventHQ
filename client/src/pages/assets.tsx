// Assets: one place to open the client's assets doc or folder (logos, headshots, ad creatives,
// funnel links). The agency team pastes the link here; the client sees an "Open" button.
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FolderOpen, Pencil } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ClientRecord = { id: number; name: string; assetsUrl: string | null; googleDriveFolderId: string | null };
type GeneratedAsset = { id: number; title: string; assetType: string; content: string; eventName: string };

const hostLabel = (url: string) => {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === "docs.google.com") {
      const kind = pathname.split("/")[1];
      return kind === "spreadsheets" ? "Google Sheet" : kind === "presentation" ? "Google Slides" : kind === "forms" ? "Google Form" : "Google Doc";
    }
    if (hostname === "drive.google.com") return pathname.includes("/folders/") ? "Google Drive folder" : "Google Drive file";
    if (hostname.endsWith("dropbox.com")) return "Dropbox";
    if (hostname.endsWith("notion.so") || hostname.endsWith("notion.site")) return "Notion";
    if (hostname.endsWith("canva.com")) return "Canva";
    return hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
};

export default function AssetsPage() {
  const [, params] = useRoute("/client/:id/assets");
  const clientId = Number(params?.id);
  const { user } = useAuth();
  const isStaff = !!user && user.role !== "agency_client" && !String(user.id ?? "").startsWith("demo-client:");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: client, isLoading } = useQuery<ClientRecord>({ queryKey: [`/api/clients/${clientId}`], enabled: Number.isFinite(clientId) });
  const { data: generated = [] } = useQuery<GeneratedAsset[]>({ queryKey: [`/api/clients/${clientId}/assets`], enabled: isStaff && Number.isFinite(clientId) });

  const link = client?.assetsUrl || (client?.googleDriveFolderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(client.googleDriveFolderId)}` : null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { setDraft(client?.assetsUrl ?? link ?? ""); }, [client?.assetsUrl, link]);

  const save = useMutation({
    mutationFn: async (assetsUrl: string | null) => (await apiRequest("PATCH", `/api/clients/${clientId}/assets-url`, { assetsUrl })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}`] });
      setEditing(false);
      toast({ title: "Assets link saved" });
    },
    onError: (error: Error) => toast({ title: "Couldn't save the link", description: error.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  const download = (asset: GeneratedAsset) => {
    const url = URL.createObjectURL(new Blob([asset.content], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${asset.title.replace(/[^a-z0-9]/gi, "_")}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title="Assets" mode="client">
      <div className="mx-auto max-w-2xl space-y-4">
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{client?.name ? `${client.name}'s assets` : "Assets"}</CardTitle>
            <p className="text-sm text-muted-foreground">Logos, headshots, ad creatives, copy and links, all in one doc.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="h-11 animate-pulse rounded-lg bg-muted" />
            ) : link && !editing ? (
              <>
                <Button asChild size="lg" className="h-12 w-full text-base" data-testid="button-open-assets">
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    <FolderOpen className="mr-2 h-5 w-5" /> Open assets
                    <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
                  </a>
                </Button>
                <p className="text-center text-xs text-muted-foreground">Opens the {hostLabel(link)} in a new tab.</p>
                {isStaff && (
                  <Button variant="ghost" size="sm" className="h-10 w-full" onClick={() => setEditing(true)} data-testid="button-edit-assets-link">
                    <Pencil className="mr-2 h-4 w-4" /> Change link
                  </Button>
                )}
              </>
            ) : isStaff ? (
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); save.mutate(draft.trim() || null); }}>
                <Label htmlFor="assets-link">Link to the assets doc or folder</Label>
                <Input
                  id="assets-link" type="url" inputMode="url" className="h-11" value={draft}
                  onChange={(e) => setDraft(e.target.value)} placeholder="https://drive.google.com/…" data-testid="input-assets-link"
                />
                <p className="text-xs text-muted-foreground">A Google Doc, Sheet, Slides or Drive folder, Dropbox, Notion or Canva link. Make sure the client can open it.</p>
                <div className="flex gap-2">
                  <Button type="submit" className="h-11 flex-1" disabled={save.isPending} data-testid="button-save-assets-link">
                    {save.isPending ? "Saving…" : "Save link"}
                  </Button>
                  {editing && <Button type="button" variant="outline" className="h-11" onClick={() => { setEditing(false); setDraft(client?.assetsUrl ?? link ?? ""); }}>Cancel</Button>}
                </div>
                {editing && client?.assetsUrl && (
                  <Button type="button" variant="ghost" size="sm" className="w-full text-destructive" disabled={save.isPending} onClick={() => save.mutate(null)}>
                    Remove link
                  </Button>
                )}
              </form>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Your team hasn't added your assets doc yet.
              </p>
            )}
          </CardContent>
        </Card>

        {isStaff && generated.length > 0 && (
          <Card className="rounded-xl">
            <CardHeader className="pb-2"><CardTitle className="text-base">Generated drafts</CardTitle></CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {generated.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{asset.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{asset.eventName}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => download(asset)} aria-label={`Download ${asset.title}`}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
