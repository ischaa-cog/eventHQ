import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, Download, FileText, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Knowledge = { id: number; title: string; collection: string; trainingResourceId: number | null; source: string; wordCount: number; chunks: number; updatedAt: string };
type Lesson = { id: number; title: string; category: string; url: string; resourceType: string; vimeo: boolean; knowledge: Knowledge | null };
type Overview = { vimeoConfigured: boolean; searchIndex: { total: number; embedded: number; configured: boolean }; lessons: Lesson[]; documents: Knowledge[] };
type Passage = { title: string; collection: string; content: string };
// What the transcript dialog is editing: a lesson's transcript, a new document, or an existing one.
type Editing = { kind: "lesson"; lesson: Lesson } | { kind: "document"; doc?: Knowledge };

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marketing", masterclass: "Masterclass", webinar: "Masterclass", summit: "Summits",
  challenge: "Five-Day Challenges", bonus_training: "Bonus Training", partner_sop: "Partner SOPs",
  inner_circle: "Neo's Inner Circle",
};
const COLLECTIONS: Record<string, string> = {
  inner_circle: "Inner Circle", writing: "Neo's writing", youtube: "YouTube", instagram: "Instagram", other: "Other material", training_lab: "Training Lab",
};
const DOCUMENT_COLLECTIONS = ["inner_circle", "writing", "youtube", "instagram", "other"];
const DOCS_SHOWN = 100;
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\.|^player\./, ""); } catch { return ""; } };
// apiRequest errors read "400: {"error":"…"}"; show just the message.
const errorText = (e: unknown) => {
  if (!(e instanceof Error)) return "Something went wrong";
  const body = e.message.replace(/^\d+:\s*/, "");
  try { return JSON.parse(body).error || body; } catch { return body; }
};
const KEY = ["/api/neo/knowledge"];

export default function NeoKnowledgePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const overview = useQuery<Overview>({ queryKey: KEY });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [title, setTitle] = useState("");
  const [collection, setCollection] = useState("inner_circle");
  const [text, setText] = useState("");
  const [source, setSource] = useState<"pasted" | "file">("pasted");
  const [filter, setFilter] = useState("");
  const [docFilter, setDocFilter] = useState("");
  const [docCollection, setDocCollection] = useState("all");
  const [question, setQuestion] = useState("");
  const [importing, setImporting] = useState<{ done: number; total: number; failed: string[] } | null>(null);

  const lessons = overview.data?.lessons || [];
  const documents = overview.data?.documents || [];
  const loaded = lessons.filter(l => l.knowledge).length;
  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term ? lessons.filter(l => `${l.title} ${CATEGORY_LABELS[l.category] || ""}`.toLowerCase().includes(term)) : lessons;
  }, [lessons, filter]);

  const docCounts = useMemo(() => documents.reduce<Record<string, number>>((counts, d) => ({ ...counts, [d.collection]: (counts[d.collection] || 0) + 1 }), {}), [documents]);
  const shownDocs = useMemo(() => {
    const term = docFilter.trim().toLowerCase();
    return documents.filter(d => (docCollection === "all" || d.collection === docCollection) && (!term || d.title.toLowerCase().includes(term)));
  }, [documents, docFilter, docCollection]);

  const openLesson = async (lesson: Lesson) => {
    setEditing({ kind: "lesson", lesson }); setSource("pasted"); setText("");
    if (lesson.knowledge) setText((await (await apiRequest("GET", `/api/neo/knowledge/${lesson.knowledge.id}`)).json()).content);
  };
  const openDocument = async (doc?: Knowledge) => {
    setEditing({ kind: "document", doc }); setSource("pasted");
    setTitle(doc?.title || ""); setCollection(doc?.collection || "inner_circle"); setText("");
    if (doc) setText((await (await apiRequest("GET", `/api/neo/knowledge/${doc.id}`)).json()).content);
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(txt|vtt|srt|md|text)$/i.test(file.name)) {
      toast({ title: "Use a text file", description: "Upload .txt, .vtt, .srt or .md. For Word or Google Docs, copy the text and paste it.", variant: "destructive" });
      return;
    }
    setText(await file.text()); setSource("file");
    if (editing?.kind === "document" && !title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      if (editing.kind === "lesson") return apiRequest("PUT", `/api/neo/knowledge/lessons/${editing.lesson.id}`, { content: text, source });
      const body = { title, collection, content: text, source };
      return editing.doc ? apiRequest("PUT", `/api/neo/knowledge/documents/${editing.doc.id}`, body) : apiRequest("POST", "/api/neo/knowledge/documents", body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); setEditing(null); toast({ title: "Neo has learned it" }); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/neo/knowledge/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  // Indexes passages for meaning search in batches until none are left.
  const [indexing, setIndexing] = useState(false);
  const buildIndex = async () => {
    setIndexing(true);
    try {
      let remaining = Infinity;
      while (remaining > 0) {
        const res = await (await apiRequest("POST", "/api/neo/knowledge/embed")).json() as { embedded: number; remaining: number };
        remaining = res.embedded ? res.remaining : 0;
        qc.invalidateQueries({ queryKey: KEY });
      }
      toast({ title: "Search index is up to date" });
    } catch (e) {
      toast({ title: "Indexing stopped", description: errorText(e), variant: "destructive" });
    } finally {
      setIndexing(false);
      qc.invalidateQueries({ queryKey: KEY });
    }
  };
  const importVimeo = async (targets: Lesson[]) => {
    setImporting({ done: 0, total: targets.length, failed: [] });
    const failed: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      try { await apiRequest("POST", `/api/neo/knowledge/lessons/${targets[i].id}/vimeo`); }
      catch (e) { failed.push(`${targets[i].title}: ${errorText(e)}`); }
      setImporting({ done: i + 1, total: targets.length, failed: [...failed] });
    }
    qc.invalidateQueries({ queryKey: KEY });
    toast({ title: `Imported ${targets.length - failed.length} of ${targets.length} Vimeo transcripts`, variant: failed.length ? "destructive" : undefined });
  };
  const search = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/neo/knowledge/search", { question })).json() as Promise<Passage[]>,
  });

  const vimeoMissing = lessons.filter(l => l.vimeo && !l.knowledge);
  const totalWords = [...lessons.map(l => l.knowledge?.wordCount || 0), ...documents.map(d => d.wordCount)].reduce((a, b) => a + b, 0);

  return <AppLayout title="Neo Knowledge" mode="agency">
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><BookOpen className="h-6 w-6" />Neo Knowledge</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">What Neo AI answers from. Neo searches these transcripts and documents on every message and names the lesson it drew from. A client's Neo only uses transcripts of lessons that client can see. Inner Circle material, Neo's writing and his YouTube and Instagram content are used for every client.</p>
      </div>

      {overview.isError && <p role="alert" className="text-sm text-destructive">Couldn't load Neo's knowledge: {errorText(overview.error)}</p>}

      {overview.data && overview.data.searchIndex.embedded < overview.data.searchIndex.total && <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Search index: {overview.data.searchIndex.embedded.toLocaleString()} of {overview.data.searchIndex.total.toLocaleString()} passages</div>
            <div className="text-sm text-muted-foreground">{overview.data.searchIndex.configured ? "Indexed passages let Neo find answers by meaning, not just matching words. New documents are indexed when you save them." : "Add OPENAI_API_KEY to the server settings to index passages."}</div>
          </div>
          {overview.data.searchIndex.configured && <Button size="sm" onClick={buildIndex} disabled={indexing}>{indexing ? "Indexing…" : "Build search index"}</Button>}
        </CardContent>
      </Card>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{loaded}<span className="text-base font-normal text-muted-foreground"> / {lessons.length}</span></div><div className="text-sm text-muted-foreground">Training Lab lessons with a transcript</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{documents.length}</div><div className="text-sm text-muted-foreground">Documents, videos &amp; posts</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{totalWords.toLocaleString()}</div><div className="text-sm text-muted-foreground">Words Neo can draw on</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div><CardTitle>Neo's material</CardTitle><CardDescription>Inner Circle content, Neo's books, guides and emails, and his YouTube and Instagram transcripts. Don't add anything clients shouldn't hear back, such as contracts, prices paid or member details.</CardDescription></div>
          <Button size="sm" onClick={() => openDocument()}><Plus className="h-4 w-4" />Add document</Button>
        </CardHeader>
        <CardContent>
          {documents.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" value={docFilter} onChange={e => setDocFilter(e.target.value)} placeholder="Find a document or video" aria-label="Find a document or video" /></div>
            <Select value={docCollection} onValueChange={setDocCollection}><SelectTrigger className="w-52" aria-label="Collection"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="all">All ({documents.length})</SelectItem>
              {DOCUMENT_COLLECTIONS.filter(c => docCounts[c]).map(c => <SelectItem key={c} value={c}>{COLLECTIONS[c]} ({docCounts[c]})</SelectItem>)}
            </SelectContent></Select>
          </div>}
          {documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents yet. Add Neo's Inner Circle material here.</p> :
            shownDocs.length === 0 ? <p className="text-sm text-muted-foreground">Nothing matches that search.</p> : <>
            <ul className="divide-y">{shownDocs.slice(0, DOCS_SHOWN).map(doc => <li key={doc.id} className="flex flex-wrap items-center gap-3 py-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{doc.title}</span>
              <Badge variant="outline">{COLLECTIONS[doc.collection] || doc.collection}</Badge>
              <span className="text-xs text-muted-foreground">{doc.wordCount.toLocaleString()} words</span>
              <Button variant="ghost" size="icon" aria-label={`Edit ${doc.title}`} onClick={() => openDocument(doc)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label={`Delete ${doc.title}`} onClick={() => { if (window.confirm(`Remove "${doc.title}" from Neo's knowledge?`)) remove.mutate(doc.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </li>)}</ul>
            {shownDocs.length > DOCS_SHOWN && <p className="pt-2 text-xs text-muted-foreground">Showing {DOCS_SHOWN} of {shownDocs.length.toLocaleString()}. Search to find the rest.</p>}</>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div><CardTitle>Training Lab transcripts</CardTitle><CardDescription>Neo can only learn a lesson from its transcript, not from the video link. Paste or upload a transcript for each lesson, or import captions straight from Vimeo.</CardDescription></div>
          {overview.data?.vimeoConfigured
            ? <Button size="sm" variant="outline" disabled={!!importing && importing.done < importing.total || vimeoMissing.length === 0} onClick={() => importVimeo(vimeoMissing)}><Download className="h-4 w-4" />Import {vimeoMissing.length} from Vimeo</Button>
            : <span className="max-w-xs text-xs text-muted-foreground">Vimeo import is off. Add a <code>VIMEO_ACCESS_TOKEN</code> (scopes: public, private, video_files) to the server settings to turn it on.</span>}
        </CardHeader>
        <CardContent className="space-y-3">
          {importing && <div role="status" className="rounded-md border p-3 text-sm">
            Importing from Vimeo: {importing.done} of {importing.total}
            {importing.failed.length > 0 && <ul className="mt-2 list-disc pl-5 text-destructive">{importing.failed.map(f => <li key={f}>{f}</li>)}</ul>}
          </div>}
          <label className="relative block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Find a lesson" value={filter} onChange={e => setFilter(e.target.value)} /></label>
          <ul className="divide-y">{shown.map(lesson => <li key={lesson.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className={lesson.knowledge ? "text-emerald-600" : "text-muted-foreground/40"} aria-label={lesson.knowledge ? "Transcript loaded" : "No transcript"}>{lesson.knowledge ? <Check className="h-4 w-4" /> : <span className="block h-4 w-4 rounded-full border" />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{lesson.title}</span><span className="text-xs text-muted-foreground">{CATEGORY_LABELS[lesson.category] || lesson.category} · {host(lesson.url)}</span></span>
            {lesson.knowledge ? <span className="text-xs text-muted-foreground">{lesson.knowledge.wordCount.toLocaleString()} words{lesson.knowledge.source === "vimeo" ? " · from Vimeo" : ""}</span>
              : <Badge variant="outline" className="border-amber-500/60 text-amber-600">Neo can't learn this yet</Badge>}
            {lesson.vimeo && overview.data?.vimeoConfigured && <Button variant="ghost" size="sm" disabled={!!importing && importing.done < importing.total} onClick={() => importVimeo([lesson])}><Download className="h-4 w-4" />Vimeo</Button>}
            <Button variant="ghost" size="sm" onClick={() => openLesson(lesson)}>{lesson.knowledge ? <><Pencil className="h-4 w-4" />Edit</> : <><Plus className="h-4 w-4" />Transcript</>}</Button>
            {lesson.knowledge && <Button variant="ghost" size="icon" aria-label={`Remove transcript for ${lesson.title}`} onClick={() => { if (window.confirm(`Remove the transcript for "${lesson.title}"?`)) remove.mutate(lesson.knowledge!.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
          </li>)}</ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Test what Neo finds</CardTitle><CardDescription>Ask a question to see which passages Neo would read before it answers. Covers every lesson, whoever it's shared with.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (question.trim()) search.mutate(); }}>
            <Input value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. How do I get more people to show up to my masterclass?" />
            <Button type="submit" disabled={search.isPending}>{search.isPending ? "Searching…" : "Search"}</Button>
          </form>
          {search.isError && <p role="alert" className="text-sm text-destructive">{errorText(search.error)}</p>}
          {search.data && (search.data.length === 0
            ? <p className="text-sm text-muted-foreground">Nothing in Neo's knowledge matches that yet. Neo would answer from general marketing knowledge.</p>
            : <ol className="space-y-3">{search.data.map((p, i) => <li key={i} className="rounded-md border p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">{p.title}<Badge variant="outline">{COLLECTIONS[p.collection] || p.collection}</Badge></div>
                <p className="line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{p.content}</p>
              </li>)}</ol>)}
        </CardContent>
      </Card>
    </div>

    <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing?.kind === "lesson" ? `Transcript: ${editing.lesson.title}` : editing?.doc ? "Edit document" : "Add to Neo's knowledge"}</DialogTitle>
          <DialogDescription>Paste the text, or upload a .txt, .vtt, .srt or .md file. Caption timestamps are removed automatically.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
          {editing?.kind === "document" && <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div><Label htmlFor="neo-doc-title">Title</Label><Input id="neo-doc-title" required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Inner Circle — Offer Stacking Call" /></div>
            <div><Label>Collection</Label><Select value={collection} onValueChange={setCollection}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DOCUMENT_COLLECTIONS.map(c => <SelectItem key={c} value={c}>{COLLECTIONS[c]}</SelectItem>)}</SelectContent></Select></div>
          </div>}
          <div>
            <div className="flex items-center justify-between"><Label htmlFor="neo-text">Text</Label>
              <label className="inline-flex cursor-pointer items-center gap-1 text-sm text-primary"><Upload className="h-4 w-4" />Upload file<input type="file" accept=".txt,.vtt,.srt,.md,.text,text/plain,text/vtt" className="sr-only" onChange={e => { readFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
            </div>
            <Textarea id="neo-text" required className="mt-1 min-h-[300px] font-mono text-xs" value={text} onChange={e => { setText(e.target.value); setSource("pasted"); }} placeholder="Paste the transcript here…" />
            <p className="mt-1 text-xs text-muted-foreground">{(text.match(/\S+/g) || []).length.toLocaleString()} words</p>
          </div>
          {save.isError && <p role="alert" className="text-sm text-destructive">{errorText(save.error)}</p>}
          <DialogFooter><Button type="submit" disabled={save.isPending || !text.trim()}>{save.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AppLayout>;
}
