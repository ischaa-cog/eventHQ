import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Upload } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useMemo, useState } from "react";
import { BULK_TRAINING_TEMPLATE, parseTrainingCsv, type TrainingCategory } from "@shared/training-bulk";

const CATEGORY_LABELS: Record<TrainingCategory, string> = {
  marketing: "Marketing", masterclass: "Masterclass", summit: "Summits",
  challenge: "Five-Day Challenges", bonus_training: "Bonus Training", partner_sop: "Partner SOPs", inner_circle: "Neo's Inner Circle",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  isOwner: boolean;
  clients: { id: number; name: string }[];
  allClientIds: number[];
  defaultCategory: TrainingCategory;
  onImported: (count: number) => void;
};

const errorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  const body = raw.replace(/^\d+:\s*/, "");
  try { return JSON.parse(body).error || body; } catch { return body; }
};

export function BulkUploadDialog({ open, onOpenChange, clientId, isOwner, clients, allClientIds, defaultCategory, onImported }: Props) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [visibleClientIds, setVisibleClientIds] = useState<number[]>([Number(clientId)]);

  const parsed = useMemo(() => text.trim() ? parseTrainingCsv(text, defaultCategory) : null, [text, defaultCategory]);
  const upload = useMutation({
    mutationFn: async () => {
      const resources = parsed!.rows.map(({ line, ...row }) => row);
      const response = await apiRequest("POST", `/api/clients/${clientId}/training/resources/bulk`, {
        resources, isGlobal, visibleClientIds: isGlobal ? [] : visibleClientIds,
      });
      return response.json() as Promise<{ created: number }>;
    },
    onSuccess: result => { onImported(result.created); onOpenChange(false); },
  });

  // Start fresh each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    // Default to every client, the same as Add lesson; the admin can narrow it down.
    setText(""); setFileName(""); setIsGlobal(isOwner); setVisibleClientIds(isOwner ? [] : allClientIds);
    upload.reset();
  }, [open, clientId]);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  };
  const downloadTemplate = () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([BULK_TRAINING_TEMPLATE], { type: "text/csv" }));
    link.download = "training-lessons-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const canImport = !!parsed && parsed.rows.length > 0 && parsed.errors.length === 0 &&
    (isGlobal || visibleClientIds.includes(Number(clientId))) && !upload.isPending;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Bulk upload lessons</DialogTitle>
        <DialogDescription>
          Add many lessons at once from a CSV file (Google Sheets: File → Download → CSV) or by pasting rows.
          Columns: <b>title</b>, <b>url</b>, and optionally <b>category</b>, <b>type</b> (video or document) and <b>description</b>.
          Rows without a category go to {CATEGORY_LABELS[defaultCategory]}; rows without a type are detected from the link.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer"><Upload size={15} />Choose CSV file
              <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" data-testid="input-bulk-file"
                onChange={event => { readFile(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
          </Button>
          <Button variant="ghost" size="sm" onClick={downloadTemplate}><Download size={15} />Download template</Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>

        <div>
          <Label htmlFor="bulk-text">Or paste rows</Label>
          <Textarea id="bulk-text" data-testid="input-bulk-text" className="min-h-28 font-mono text-xs" value={text}
            placeholder={"title,url,category,type,description\nWelcome,https://vimeo.com/123456789,Marketing,video,Start here"}
            onChange={event => { setText(event.target.value); setFileName(""); }} />
        </div>

        {isOwner && <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isGlobal} onCheckedChange={checked => { setIsGlobal(checked === true); setVisibleClientIds(checked === true ? [] : [Number(clientId)]); }} />
          Share every lesson with every client, including future clients
        </label>}
        {!isGlobal && <div>
          <Label>Visible to clients</Label>
          <div className="mt-2 max-h-32 space-y-2 overflow-auto">
            {clients.map(client => <label key={client.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={visibleClientIds.includes(client.id)} disabled={client.id === Number(clientId)}
                onCheckedChange={checked => setVisibleClientIds(checked ? [...visibleClientIds, client.id] : visibleClientIds.filter(id => id !== client.id))} />
              {client.name || `Client ${client.id}`}{client.id === Number(clientId) ? " (this workspace)" : ""}
            </label>)}
          </div>
        </div>}

        {parsed && <div className="space-y-2" data-testid="bulk-preview">
          <p className="text-sm">
            <b>{parsed.rows.length}</b> lesson{parsed.rows.length === 1 ? "" : "s"} ready
            {parsed.errors.length > 0 && <span className="text-destructive"> · {parsed.errors.length} row{parsed.errors.length === 1 ? "" : "s"} to fix before importing</span>}
          </p>
          {parsed.errors.length > 0 && <ul className="space-y-1 rounded-md border border-destructive/40 p-2 text-sm text-destructive" role="alert">
            {parsed.errors.slice(0, 20).map(error => <li key={`${error.line}-${error.message}`}>Line {error.line}: {error.message}</li>)}
            {parsed.errors.length > 20 && <li>…and {parsed.errors.length - 20} more</li>}
          </ul>}
          {parsed.rows.length > 0 && <div className="max-h-56 overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted"><tr><th className="p-2">Title</th><th className="p-2">Category</th><th className="p-2">Type</th><th className="p-2">Link</th></tr></thead>
              <tbody>{parsed.rows.map(row => <tr key={row.line} className="border-t">
                <td className="p-2">{row.title}</td>
                <td className="p-2 whitespace-nowrap">{CATEGORY_LABELS[row.category]}</td>
                <td className="p-2">{row.resourceType}</td>
                <td className="max-w-56 truncate p-2 text-muted-foreground" title={row.url}>{row.url}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </div>}

        {upload.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(upload.error)}</p>}
      </div>

      <DialogFooter>
        <Button onClick={() => upload.mutate()} disabled={!canImport} data-testid="button-bulk-import">
          {upload.isPending ? "Importing…" : parsed?.rows.length ? `Import ${parsed.rows.length} lesson${parsed.rows.length === 1 ? "" : "s"}` : "Import"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
