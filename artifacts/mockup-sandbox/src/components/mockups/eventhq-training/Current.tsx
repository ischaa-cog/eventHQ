import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GraduationCap, ExternalLink, Pencil, Trash2, ChevronUp, ChevronDown, Plus } from "lucide-react";
import "./_group.css";

type Category = "challenge" | "marketing" | "masterclass" | "bonus_training" | "webinar" | "summit" | "partner_sop";
type Resource = { id: number | string; title: string; description?: string | null; category: Category; resourceType: "video" | "document"; url: string; orderIndex: number; visibleClientIds?: number[]; isGlobal?: boolean; legacy?: boolean };
type Form = { title: string; description: string; category: Category; resourceType: "video" | "document"; url: string; orderIndex: number; visibleClientIds: number[]; isGlobal: boolean };

const categories: { id: Category; label: string; detail: string }[] = [
  { id: "challenge", label: "Five-Day Challenges", detail: "Plan and run a successful challenge." },
  { id: "marketing", label: "Marketing", detail: "Podcast and social media training." },
  { id: "masterclass", label: "Masterclass", detail: "Masterclass training and resources." },
  { id: "bonus_training", label: "Bonus Training", detail: "Additional lessons and speaker training." },
  { id: "webinar", label: "Webinars", detail: "Webinar training and resources." },
  { id: "summit", label: "Summits", detail: "Summit training and resources." },
  { id: "partner_sop", label: "Partner SOPs", detail: "Partner processes and training." },
];

// These entries mirror server/training-catalog.ts's seeded Vimeo lessons.
const sampleResources: Resource[] = [
  { id: "855573003", title: "Introduction To Challenges", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855573003", orderIndex: 0, isGlobal: true },
  { id: "855573042", title: "Challenge Week At A Glance", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855573042", orderIndex: 1, isGlobal: true },
  { id: "855573062", title: "The Challenge Kick Off Call", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855573062", orderIndex: 2, isGlobal: true },
  { id: "855573076", title: "Day 1 Overview", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855573076", orderIndex: 3, isGlobal: true },
  { id: "855573097", title: "Day 2 Overview", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855573097", orderIndex: 4, isGlobal: true },
  { id: "855577007", title: "Day 3 Overview", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855577007", orderIndex: 5, isGlobal: true },
  { id: "855573112", title: "Day 4 Overview", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855573112", orderIndex: 6, isGlobal: true },
  { id: "855573145", title: "Day 5 Overview", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855573145", orderIndex: 7, isGlobal: true },
  { id: "855573154", title: "Bonus Day Overview", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855573154", orderIndex: 8, isGlobal: true },
  { id: "855573172", title: "Creating A Successful Challenge", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855573172", orderIndex: 9, isGlobal: true },
  { id: "855573201", title: "You Completed The Training", category: "challenge", resourceType: "video", url: "https://player.vimeo.com/video/855573201", orderIndex: 10, isGlobal: true },
  { id: "990690716", title: "Podcast Mastery", category: "marketing", resourceType: "video", url: "https://player.vimeo.com/video/990690716", orderIndex: 0, isGlobal: true },
  { id: "855573250", title: "Social Media Marketing Mastery — Part 1", category: "marketing", resourceType: "video", url: "https://player.vimeo.com/video/855573250", orderIndex: 1, isGlobal: true },
  { id: "855573207", title: "Social Media Marketing Mastery — Part 2", category: "marketing", resourceType: "video", url: "https://player.vimeo.com/video/855573207", orderIndex: 2, isGlobal: true },
  { id: "923148024", title: "Overview Of Masterclasses", category: "masterclass", resourceType: "video", url: "https://player.vimeo.com/video/923148024", orderIndex: 0, isGlobal: true },
  { id: "1067920493", title: "Speaker Training", category: "bonus_training", resourceType: "video", url: "https://player.vimeo.com/video/1067920493", orderIndex: 0, isGlobal: true },
];

function vimeoPlayerUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.port || u.username || u.password || u.hash) return null;
    const match = u.hostname === "player.vimeo.com"
      ? /^\/video\/([0-9]+)\/?$/.exec(u.pathname)
      : u.hostname === "vimeo.com" ? /^\/([0-9]+)\/?$/.exec(u.pathname) : null;
    if (!match || Array.from(u.searchParams.keys()).some(key => key !== "h")) return null;
    const hash = u.searchParams.get("h");
    if (hash !== null && !/^[a-f0-9]+$/i.test(hash)) return null;
    return `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${hash}` : ""}`;
  } catch {
    return null;
  }
}

function sortTrainingResources<T extends { isGlobal?: boolean; orderIndex?: number; id: string | number }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    Number(!!b.isGlobal) - Number(!!a.isGlobal) ||
    (a.orderIndex || 0) - (b.orderIndex || 0) ||
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><main className="p-4 md:p-8">{children}</main></div>;
}

export function Current() {
  const clientId = "1";
  // The original page is being viewed as a client, so management actions are hidden.
  const isOwner = false;
  const canEdit = false;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const emptyForm = (category: Category = "challenge"): Form => ({
    title: "", description: "", category, resourceType: "video", url: "", orderIndex: 0,
    visibleClientIds: [Number(clientId)], isGlobal: false,
  });
  const [form, setForm] = useState<Form>(emptyForm);

  // Static API/auth/router stubs keep the extracted page's real rendering and JSX intact.
  const resources = { data: sampleResources, isLoading: false, isError: false, isSuccess: true };
  const clients = { data: [] as { id: number; name: string }[] };
  const save = { isError: false, isPending: false, error: null as unknown, reset: () => {}, mutate: (_data: Form) => {} };
  const remove = { isError: false, isPending: false, error: null as unknown, mutate: (_id: number | string) => {} };
  const reorder = { isError: false, isPending: false, error: null as unknown, mutate: (_items: Resource[]) => {} };
  const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
  const canManage = (item: Resource) => !!canEdit && !item.legacy &&
    (isOwner || (!item.isGlobal && !!clients.data && (item.visibleClientIds || []).every(id => clients.data!.some(c => c.id === id))));
  const openEditor = (item?: Resource, category?: Category) => {
    setEditing(item || null);
    setForm(item ? {
      title: item.title, description: item.description || "", category: item.category,
      resourceType: item.resourceType, url: item.url, orderIndex: item.orderIndex || 0,
      visibleClientIds: item.visibleClientIds || [], isGlobal: !!item.isGlobal,
    } : { ...emptyForm(category), orderIndex: (resources.data || []).filter(r => r.category === category).length * 10 });
    save.reset();
    setDialogOpen(true);
  };
  const move = (items: Resource[], index: number, direction: -1 | 1) => {
    const updated = [...items];
    [updated[index], updated[index + direction]] = [updated[index + direction], updated[index]];
    reorder.mutate(updated);
  };
  const list = [...(resources.data || [])];

  return <AppLayout>
    <div className="max-w-6xl mx-auto space-y-7 pb-12">
      <Card className="bg-gradient-to-r from-blue-900/50 to-cyan-900/50 border-blue-500/30">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-9 w-9 shrink-0 text-blue-400" />
            <div><CardTitle className="text-2xl text-white">Training Lab</CardTitle><p className="text-muted-foreground mt-1">Learn at your own pace with training for every stage of your event.</p></div>
          </div>
          {canEdit && <Button className="shrink-0" onClick={() => openEditor()}><Plus className="h-4 w-4 mr-2" />Add resource</Button>}
        </CardHeader>
      </Card>
      {resources.isLoading && <p className="text-center text-muted-foreground py-12">Loading training resources…</p>}
      {resources.isError && <p className="text-center text-destructive py-12">Unable to load training resources. Please try again.</p>}
      {remove.isError && <p role="alert" className="text-destructive">Could not remove resource: {errorMessage(remove.error)}</p>}
      {reorder.isError && <p role="alert" className="text-destructive">Could not reorder resources: {errorMessage(reorder.error)}</p>}
      {resources.isSuccess && categories.map(category => {
        const items = sortTrainingResources(list.filter(item => item.category === category.id));
        return <section key={category.id} aria-labelledby={`training-${category.id}`} className="space-y-4">
          <div className="flex items-end justify-between gap-3 border-b pb-3">
            <div><h2 id={`training-${category.id}`} className="text-xl font-semibold">{category.label}</h2><p className="text-sm text-muted-foreground">{category.detail}</p></div>
            {canEdit && <Button variant="ghost" size="sm" onClick={() => openEditor(undefined, category.id)}><Plus className="h-4 w-4 mr-1" />Add</Button>}
          </div>
          {items.length === 0 ? <p className="text-sm text-muted-foreground py-4">No resources in this category yet.</p> :
            <div className="grid gap-5 md:grid-cols-2">{items.map(item => {
              const player = item.resourceType === "video" ? vimeoPlayerUrl(item.url) : null;
              // Move only within the same visibility scope; global lessons
              // never compete with client-scoped resources for order positions.
              const movable = items.filter(r => r.isGlobal === item.isGlobal && canManage(r));
              const position = movable.findIndex(m => m.id === item.id);
              return <Card key={item.id} className="flex flex-col overflow-hidden">
                {player && <div className="aspect-video bg-black"><iframe
                  className="w-full h-full" src={player} title={item.title} loading="lazy"
                  allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                /></div>}
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><CardTitle className="text-lg leading-snug">{item.title}</CardTitle>{item.isGlobal && <Badge variant="secondary" className="mt-2">Shared training</Badge>}</div>
                    {canManage(item) && <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" aria-label={`Move ${item.title} up`} title="Move up" disabled={position < 1 || reorder.isPending} onClick={() => move(movable, position, -1)}><ChevronUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Move ${item.title} down`} title="Move down" disabled={position < 0 || position === movable.length - 1 || reorder.isPending} onClick={() => move(movable, position, 1)}><ChevronDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${item.title}`} onClick={() => openEditor(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${item.title}`} disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove "${item.title}"?`)) remove.mutate(item.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  {item.description && <p className="text-sm text-muted-foreground flex-1">{item.description}</p>}
                  {!player && <Button className="mt-3 w-fit" variant="outline" asChild><a href={item.url} target="_blank" rel="noopener noreferrer">Open {item.resourceType}<ExternalLink className="h-4 w-4 ml-2" /></a></Button>}
                </CardContent>
              </Card>;
            })}</div>}
        </section>;
      })}
    </div>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit training resource" : "Add training resource"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(form); }}>
          <div><Label htmlFor="training-title">Title</Label><Input id="training-title" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label htmlFor="training-description">Description</Label><Textarea id="training-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Category</Label><Select value={form.category} onValueChange={v => setForm({ ...form, category: v as Category })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Type</Label><Select value={form.resourceType} onValueChange={v => setForm({ ...form, resourceType: v as Form["resourceType"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="video">Video</SelectItem><SelectItem value="document">Document</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label htmlFor="training-url">Resource URL</Label><Input id="training-url" required type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /><p className="text-xs text-muted-foreground mt-1">Vimeo video links play here. Other video links open in a new tab.</p></div>
          {isOwner && <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isGlobal} onCheckedChange={checked => setForm({ ...form, isGlobal: checked === true, visibleClientIds: checked === true ? [] : [Number(clientId)] })} />Share with every client, including future clients</label>}
          {!form.isGlobal && canEdit && <div><Label>Visible to clients</Label><div className="max-h-32 overflow-auto space-y-2 mt-2">{(clients.data || []).map(client => <label key={client.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.visibleClientIds.includes(client.id)} onCheckedChange={checked => setForm({ ...form, visibleClientIds: checked ? [...form.visibleClientIds, client.id] : form.visibleClientIds.filter(id => id !== client.id) })} />{client.name || `Client ${client.id}`}</label>)}</div></div>}
          {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
          <DialogFooter><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save resource"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AppLayout>;
}