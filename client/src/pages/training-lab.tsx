import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowRight, Check, ChevronRight, ChevronUp, ChevronDown, ExternalLink, Lock, Pencil, Play, Plus, Search, Trash2, Upload } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { sortTrainingResources, vimeoPlayerUrl } from "@/lib/training-resources";
import { BulkUploadDialog } from "@/components/training/BulkUploadDialog";
import { useToast } from "@/hooks/use-toast";
import { hasFullAccess } from "@shared/roles";
import "./training-lab.css";

type Category = "challenge" | "marketing" | "masterclass" | "bonus_training" | "webinar" | "summit" | "partner_sop";
type Resource = { id: number | string; title: string; description?: string | null; category: Category; resourceType: "video" | "document"; url: string; orderIndex: number; visibleClientIds?: number[]; isGlobal?: boolean; legacy?: boolean };
type Form = { title: string; description: string; category: Category; resourceType: "video" | "document"; url: string; orderIndex: number; visibleClientIds: number[]; isGlobal: boolean };

// comingSoon categories are locked for clients; admins can still open them to prepare lessons.
const categories: { id: Category; label: string; detail: string; eyebrow: string; mark: string; comingSoon?: boolean }[] = [
  { id: "marketing", label: "Marketing", detail: "Podcast and social media training.", eyebrow: "01", mark: "M" },
  { id: "masterclass", label: "Masterclass", detail: "Masterclass training and resources.", eyebrow: "02", mark: "MC" },
  { id: "summit", label: "Summits", detail: "Summit training and resources.", eyebrow: "03", mark: "—", comingSoon: true },
  { id: "challenge", label: "Five-Day Challenges", detail: "Plan and run a successful challenge.", eyebrow: "04", mark: "5D" },
  { id: "bonus_training", label: "Bonus Training", detail: "Additional lessons and speaker training.", eyebrow: "05", mark: "+" },
  { id: "partner_sop", label: "Partner SOPs", detail: "Partner processes and training.", eyebrow: "06", mark: "—", comingSoon: true },
];

const inCategory = (item: Resource, category: Category) =>
  item.category === category || (category === "masterclass" && item.category === "webinar");

// Whop course lessons are members-only and can't play inside EventHQ; they open on Whop instead.
const isWhopLink = (url: string) => { try { return /(^|\.)whop\.com$/i.test(new URL(url).hostname); } catch { return false; } };
const WhopMark = ({ size }: { size: number }) => <img src="/whop-mark.png" alt="" aria-hidden="true" width={size} height={size} className="training-whop-mark" />;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export default function TrainingLabPage() {
  const [, params] = useRoute("/client/:id/training");
  const clientId = params?.id;
  const { user } = useAuth();
  const qc = useQueryClient();
  // Admins (and the original owner account) can share lessons with every client.
  const isOwner = hasFullAccess(user);
  const canEdit = isOwner || user?.role === "agency_admin";
  const isClient = user?.role === "agency_client";
  const [previewMode, setPreviewMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>("marketing");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState<Form>({
    title: "", description: "", category: "marketing", resourceType: "video", url: "", orderIndex: 0,
    visibleClientIds: clientId ? [Number(clientId)] : [], isGlobal: false,
  });

  const queryKey = [`/api/clients/${clientId}/training/resources`];
  const resources = useQuery<Resource[]>({ queryKey, enabled: !!clientId });
  const clients = useQuery<{ id: number; name: string }[]>({ queryKey: ["/api/clients"], enabled: !!canEdit });
  const list = resources.data || [];
  const selectedCategory = categories.find(category => category.id === activeCategory)!;
  const categoryResources = useMemo(() => sortTrainingResources(list.filter(item => inCategory(item, activeCategory))), [list, activeCategory]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return term ? categoryResources.filter(item => `${item.title} ${item.description || ""}`.toLocaleLowerCase().includes(term)) : categoryResources;
  }, [categoryResources, search]);
  const selected = filtered.find(item => item.id === selectedId) || filtered[0] || null;
  const nextLesson = selected ? filtered[filtered.findIndex(item => item.id === selected.id) + 1] : null;
  const player = selected?.resourceType === "video" ? vimeoPlayerUrl(selected.url) : null;
  const preview = canEdit && previewMode;
  const readOnly = isClient || preview;
  // If a client (or the client preview) is on a locked category, move to the first open one.
  useEffect(() => {
    if (readOnly && selectedCategory.comingSoon) setActiveCategory(categories.find(category => !category.comingSoon)!.id);
  }, [readOnly, activeCategory]);

  // New lessons default to every client: the owner shares with all (including future clients);
  // an agency admin gets all of their clients ticked. Either can narrow it down before saving.
  const allClientIds = () => Array.from(new Set([...(clients.data || []).map(client => client.id), ...(clientId ? [Number(clientId)] : [])]));
  const emptyForm = (category: Category = "marketing"): Form => ({
    title: "", description: "", category, resourceType: "video", url: "", orderIndex: 0,
    visibleClientIds: isOwner ? [] : allClientIds(), isGlobal: isOwner,
  });
  const clientNames = (ids: number[] = []) => ids.map(id => clients.data?.find(client => client.id === id)?.name || `Client ${id}`).join(", ");
  const save = useMutation({
    mutationFn: async (data: Form) => {
      const response = editing
        ? await apiRequest("PATCH", `/api/training/resources/${editing.id}`, data)
        : await apiRequest("POST", `/api/clients/${clientId}/training/resources`, data);
      return response.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); setDialogOpen(false); setEditing(null); },
  });
  const remove = useMutation({
    mutationFn: (id: number | string) => apiRequest("DELETE", `/api/training/resources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const reorder = useMutation({
    mutationFn: async (items: Resource[]) => {
      for (let index = 0; index < items.length; index++) {
        await apiRequest("PATCH", `/api/training/resources/${items[index].id}`, { orderIndex: index * 10 });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const canManage = (item: Resource) => !readOnly && !!canEdit && !item.legacy &&
    (isOwner || (!item.isGlobal && !!clients.data && (item.visibleClientIds || []).every(id => clients.data!.some(client => client.id === id))));
  const openEditor = (item?: Resource, category?: Category) => {
    setEditing(item || null);
    setForm(item ? {
      title: item.title, description: item.description || "", category: item.category,
      resourceType: item.resourceType, url: item.url, orderIndex: item.orderIndex || 0,
      visibleClientIds: item.visibleClientIds || [], isGlobal: !!item.isGlobal,
    } : { ...emptyForm(category), orderIndex: list.filter(resource => inCategory(resource, category ?? "marketing")).length * 10 });
    save.reset();
    setDialogOpen(true);
  };
  const move = (items: Resource[], index: number, direction: -1 | 1) => {
    const updated = [...items];
    [updated[index], updated[index + direction]] = [updated[index + direction], updated[index]];
    reorder.mutate(updated);
  };
  const chooseCategory = (id: Category) => {
    setActiveCategory(id);
    setSearch("");
    setSelectedId(null);
  };

  return <AppLayout title="Training Lab" mode="client">
    <div className="training-lab">
      <header className="training-topbar">
        <div className="training-breadcrumb"><span>Workspace</span><ChevronRight size={14} aria-hidden="true" /><strong>Training Lab</strong></div>
        <div className="training-topbar-actions">
          {canEdit && <Button variant={previewMode ? "default" : "outline"} size="sm" aria-pressed={previewMode} onClick={() => setPreviewMode(value => !value)}>
            {previewMode ? "Exit client preview" : "Preview client view"}
          </Button>}
          <span className="training-role">{preview ? "Preview · visual only" : isClient ? "Client view" : "Management view"}</span>
        </div>
      </header>
      <main className="training-content">
        {preview && <div className="training-preview-note" role="status"><strong>Preview client view — visual only.</strong> You are still signed in as an administrator; this does not impersonate client identity. Resources below remain scoped to the client selected in this workspace.</div>}
        <section className="training-intro" aria-labelledby="training-title">
          <div>
            <div className="training-kicker">EVENTHQ / TRAINING LAB</div>
            <h1 id="training-title">Learn the workflow.<br /><em>Run the room.</em></h1>
            <p>A calm place to get oriented, find the right lesson, and keep your event moving forward.</p>
          </div>
          <div className="training-intro-note"><span className="training-note-line" /><span>Pick the training for<br />the event you’re running next.</span></div>
        </section>

        {resources.isLoading && <p className="training-status" role="status">Loading training resources…</p>}
        {resources.isError && <p className="training-error" role="alert">Unable to load training resources: {errorMessage(resources.error)}</p>}
        {resources.isSuccess && <>
          {remove.isError && <p className="training-error" role="alert">Could not remove resource: {errorMessage(remove.error)}</p>}
          {reorder.isError && <p className="training-error" role="alert">Could not reorder resources: {errorMessage(reorder.error)}</p>}
          {clients.isError && canEdit && <p className="training-error" role="alert">Could not load client permissions: {errorMessage(clients.error)}</p>}
          <section className="training-category-row" aria-label="Training categories">
            {categories.map(category => {
               const count = list.filter(resource => inCategory(resource, category.id)).length;
              const active = activeCategory === category.id;
              const locked = !!category.comingSoon && readOnly;
              if (locked) return <div key={category.id} className={`training-category training-category-locked training-mark-${category.id}`} aria-disabled="true" aria-label={`${category.label}: coming soon`}>
                <span className="training-cat-top"><span>{category.eyebrow}</span></span>
                <span className="training-category-mark" aria-hidden="true"><Lock size={14} /></span>
                <span className="training-cat-copy"><strong>{category.label}</strong><small>Coming soon</small></span>
              </div>;
              return <button key={category.id} type="button" className={`training-category training-mark-${category.id}${active ? " training-category-active" : ""}${count === 0 ? " training-category-empty" : ""}`} aria-pressed={active} onClick={() => chooseCategory(category.id)}>
                <span className="training-cat-top"><span>{category.eyebrow}</span>{count > 0 && <b>{count}</b>}</span>
                <span className="training-category-mark" aria-hidden="true">{category.comingSoon ? <Lock size={14} /> : category.mark}</span>
                <span className="training-cat-copy"><strong>{category.label}</strong><small>{category.comingSoon ? "Coming soon for clients" : count ? `${count} lesson${count === 1 ? "" : "s"}` : "No resources yet"}</small></span>
                {active && <ArrowRight size={16} className="training-cat-arrow" aria-hidden="true" />}
              </button>;
            })}
          </section>

          <section className="training-learning-grid" aria-label="Training lessons">
            <div className="training-lesson-panel">
              <div className="training-section-head">
                <div><div className="training-kicker">NOW BROWSING / {selectedCategory.eyebrow}</div><h2>{selectedCategory.label}</h2><p>{selectedCategory.detail}</p></div>
                <div className="training-lesson-count"><b>{categoryResources.length.toString().padStart(2, "0")}</b><span>lessons</span></div>
              </div>
              {canEdit && !preview && <div className="training-add-category flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => openEditor(undefined, activeCategory)}><Plus size={15} />Add lesson</Button>
                <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} data-testid="button-bulk-upload"><Upload size={15} />Bulk upload</Button>
              </div>}
              {categoryResources.length === 0 ? <div className="training-empty"><span className="training-empty-ring" aria-hidden="true">+</span><h3>No lessons here yet.</h3><p>Resources for {selectedCategory.label.toLowerCase()} will appear here when they’re available.</p></div> : <>
                <label className="training-search"><Search size={16} aria-hidden="true" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a lesson" aria-label="Search lessons in this category" /></label>
                <div className="training-lesson-list" role="list" aria-label={`${selectedCategory.label} lessons`}>
                  {filtered.map((resource, index) => {
                    const isSelected = selected?.id === resource.id;
                    const movable = categoryResources.filter(item => item.isGlobal === resource.isGlobal && canManage(item));
                    const position = movable.findIndex(item => item.id === resource.id);
                    return <div className={`training-lesson-row${isSelected ? " training-lesson-selected" : ""}`} role="listitem" key={resource.id}>
                      <button type="button" className="training-lesson" aria-current={isSelected ? "true" : undefined} onClick={() => setSelectedId(resource.id)}>
                        <span className="training-lesson-num">{String(index + 1).padStart(2, "0")}</span>
                        <span className="training-play-dot" aria-hidden="true">{isSelected ? <Play size={11} fill="currentColor" /> : <span />}</span>
                        <span className="training-lesson-name">{resource.title}</span>
                        {resource.isGlobal && !readOnly && <Badge variant="secondary">Shared</Badge>}
                        {!readOnly && canEdit && resource.resourceType === "video" && !vimeoPlayerUrl(resource.url) && (isWhopLink(resource.url)
                          ? <span className="training-whop-tag" title="Hosted on Whop, so it can't play inside EventHQ. Re-host it on Vimeo to play it here."><WhopMark size={14} />Whop</span>
                          : <Badge variant="outline" className="border-rose-500/60 text-rose-600" title="This video can't play inside EventHQ. Re-host it on Vimeo and update the link.">Not playable here</Badge>)}
                        {!resource.isGlobal && !resource.legacy && !readOnly && canEdit && <Badge variant="outline" className="max-w-40 truncate border-amber-500/60 text-amber-600" title={`Only visible to: ${clientNames(resource.visibleClientIds)}`}>Only: {clientNames(resource.visibleClientIds)}</Badge>}
                        {isSelected && <Check size={15} className="training-check" aria-label="Selected" />}
                      </button>
                      {canManage(resource) && <div className="training-item-actions">
                        <Button variant="ghost" size="icon" aria-label={`Move ${resource.title} up`} title="Move up" disabled={position < 1 || reorder.isPending} onClick={() => move(movable, position, -1)}><ChevronUp size={15} /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Move ${resource.title} down`} title="Move down" disabled={position < 0 || position === movable.length - 1 || reorder.isPending} onClick={() => move(movable, position, 1)}><ChevronDown size={15} /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Edit ${resource.title}`} onClick={() => openEditor(resource)}><Pencil size={15} /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${resource.title}`} disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove "${resource.title}"?`)) remove.mutate(resource.id); }}><Trash2 size={15} className="text-destructive" /></Button>
                      </div>}
                    </div>;
                  })}
                  {filtered.length === 0 && <p className="training-no-results">No lessons match “{search}”. Try another search.</p>}
                </div>
              </>}
            </div>

            <div className="training-player-column">
              {selected ? <>
                <article className="training-player-card">
                  <div className="training-player-label"><span className="training-live-dot" />Selected lesson</div>
                  {player ? <div className="training-video"><iframe key={player} src={player} title={selected.title} loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div> :
                    (isWhopLink(selected.url)
                      ? <div className="training-resource-open"><WhopMark size={48} /><div className="training-whop-copy"><strong>Watch this lesson on Whop</strong><p>Sign in with your Whop account to play it.</p></div><a className="training-whop-button" href={selected.url} target="_blank" rel="noopener noreferrer">Open in Whop<ExternalLink size={14} /></a></div>
                      : <div className="training-resource-open"><div className="training-open-icon">{selected.resourceType === "document" ? "DOC" : <Play size={22} />}</div><p>{selected.resourceType === "document" ? "Open this lesson document in a new tab." : "This video opens in a new tab."}</p><Button variant="outline" asChild><a href={selected.url} target="_blank" rel="noopener noreferrer">Open {selected.resourceType}<ExternalLink size={15} /></a></Button></div>)}
                  <div className="training-player-meta">
                    <div><div className="training-kicker">SELECTED RESOURCE{selected.isGlobal && !readOnly ? " / SHARED" : ""}</div><h3>{selected.title}</h3>{selected.description && <p>{selected.description}</p>}</div>
                    <div className="training-duration">{selected.resourceType === "video" ? "Watch at your pace" : "Read at your pace"}</div>
                  </div>
                </article>
                {nextLesson && <button type="button" className="training-next" onClick={() => setSelectedId(nextLesson.id)}><span>UP NEXT IN {selectedCategory.label.toUpperCase()}</span><strong>{nextLesson.title}</strong><ChevronRight size={18} aria-hidden="true" /></button>}
              </> : <div className="training-no-selection">{search ? "No matching lesson selected." : "Choose a lesson to begin."}</div>}
            </div>
          </section>
        </>}
        <footer className="training-footer"><span>Private client workspace</span><span className="training-footer-rule" /><span>EventHQ Training Lab</span></footer>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit training resource" : "Add training resource"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate(form); }}>
            <div><Label htmlFor="training-title">Title</Label><Input id="training-title" required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></div>
            <div><Label htmlFor="training-description">Description</Label><Textarea id="training-description" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
               <div><Label>Category</Label><Select value={form.category === "webinar" ? "masterclass" : form.category} onValueChange={value => setForm({ ...form, category: value as Category })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(category => <SelectItem key={category.id} value={category.id}>{category.label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Type</Label><Select value={form.resourceType} onValueChange={value => setForm({ ...form, resourceType: value as Form["resourceType"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="video">Video</SelectItem><SelectItem value="document">Document</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label htmlFor="training-url">Resource URL</Label><Input id="training-url" required type="url" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} /><p className="mt-1 text-xs text-muted-foreground">Valid Vimeo video links play here. Other video links and documents open in a new tab.</p></div>
            {isOwner && <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isGlobal} onCheckedChange={checked => setForm({ ...form, isGlobal: checked === true, visibleClientIds: checked === true ? [] : (clientId ? [Number(clientId)] : []) })} />Share with every client, including future clients</label>}
            {!form.isGlobal && canEdit && <div><Label>Visible to clients</Label><div className="mt-2 max-h-32 space-y-2 overflow-auto">{(clients.data || []).map(client => <label key={client.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.visibleClientIds.includes(client.id)} onCheckedChange={checked => setForm({ ...form, visibleClientIds: checked ? [...form.visibleClientIds, client.id] : form.visibleClientIds.filter(id => id !== client.id) })} />{client.name || `Client ${client.id}`}</label>)}</div></div>}
            {save.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}
            <DialogFooter><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save resource"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {canEdit && clientId && <BulkUploadDialog open={bulkOpen} onOpenChange={setBulkOpen} clientId={clientId} isOwner={isOwner}
        clients={clients.data || []} allClientIds={allClientIds()} defaultCategory={activeCategory === "webinar" ? "masterclass" : activeCategory}
        onImported={count => { qc.invalidateQueries({ queryKey }); toast({ title: `${count} lesson${count === 1 ? "" : "s"} added` }); }} />}
    </div>
  </AppLayout>;
}