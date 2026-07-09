import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TechniqueBadge, BeltDot } from "@/components/technique-badge";
import { RatingStars } from "@/components/rating-stars";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  HardDrive,
  Calendar,
  Folder,
  Tag as TagIcon,
  Save,
  X,
  Plus,
  ListVideo,
  Play,
  Shirt,
} from "lucide-react";
import { formatDuration, formatBytes, formatRelative } from "@/lib/format";
import type { InstructionalVideo } from "@shared/schema";

const RULESET_OPTIONS = [
  { value: "gi", label: "Gi" },
  { value: "nogi", label: "No-Gi" },
  { value: "both", label: "Both" },
  { value: "unknown", label: "Unknown" },
] as const;

const RULESET_DISPLAY: Record<string, { label: string; cls: string }> = {
  gi: { label: "Gi", cls: "bg-blue-500/15 text-blue-400" },
  nogi: { label: "No-Gi", cls: "bg-amber-500/15 text-amber-400" },
  both: { label: "Gi + No-Gi", cls: "bg-purple-500/15 text-purple-400" },
};

export default function InstructionalDetail() {
  const { id } = useParams();
  const numId = Number(id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentVideoId, setCurrentVideoId] = useState<number | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);

  const item = useQuery({
    queryKey: ["/api/instructionals", numId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/instructionals/${numId}`));
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const videos: InstructionalVideo[] = item.data?.videos ?? [];

  const initialVideoId = useMemo(() => {
    if (videos.length === 0) return null;
    const byId = new Map(videos.map((v) => [v.id, v]));
    const prog = item.data?.progressVideoId;
    if (prog && byId.has(prog) && byId.get(prog)?.available) return prog;
    return videos.find((v) => v.available)?.id ?? videos[0].id;
  }, [item.data]);

  useEffect(() => {
    if (currentVideoId === null && initialVideoId !== null) setCurrentVideoId(initialVideoId);
  }, [initialVideoId, currentVideoId]);

  useEffect(() => {
    setCurrentVideoId(initialVideoId);
    setAutoAdvance(false);
  }, [item.data?.id, initialVideoId]);

  const currentVideo = videos.find((v) => v.id === currentVideoId) ?? videos[0] ?? null;
  const currentIndex = currentVideo ? videos.findIndex((v) => v.id === currentVideo.id) : -1;
  const nextVideo = currentIndex >= 0 && currentIndex < videos.length - 1 ? videos[currentIndex + 1] : null;

  const progressMutation = useMutation({
    mutationFn: async (data: { progress: number; watched: boolean; progressVideoId?: number | null }) =>
      apiRequest("PATCH", `/api/instructionals/${numId}/progress`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/instructionals", numId] });
      qc.invalidateQueries({ queryKey: ["/api/instructionals"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/instructionals/${numId}`),
    onSuccess: () => { toast({ title: "Deleted" }); window.location.hash = "#/"; },
  });

  const toggleWatched = () => {
    progressMutation.mutate({ progress: item.data?.progress || 0, watched: !item.data?.watched, progressVideoId: currentVideo?.id ?? null });
  };

  const switchPart = (videoId: number) => {
    setCurrentVideoId(videoId);
    setAutoAdvance(false);
    requestAnimationFrame(() => { const v = videoRef.current; if (v) v.currentTime = 0; });
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !item.data || !currentVideo) return;
    const sec = Math.floor(v.currentTime);
    if (sec % 10 === 0 && sec > 0 && sec !== item.data.progress) {
      const watched = v.duration ? v.currentTime / v.duration > 0.9 : false;
      progressMutation.mutate({ progress: sec, watched, progressVideoId: currentVideo.id });
    }
  };

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !item.data || !currentVideo) return;
    if (item.data.progressVideoId === currentVideo.id && item.data.progress > 5) {
      v.currentTime = item.data.progress;
    }
  };

  const onEnded = () => {
    if (nextVideo) {
      progressMutation.mutate({ progress: 0, watched: false, progressVideoId: nextVideo.id });
      setAutoAdvance(true);
      setCurrentVideoId(nextVideo.id);
    } else {
      progressMutation.mutate({
        progress: currentVideo?.duration ?? item.data?.duration ?? 0,
        watched: true,
        progressVideoId: currentVideo?.id ?? null,
      });
    }
  };

  if (item.isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 bg-muted rounded w-48 animate-pulse mb-4" />
        <div className="aspect-video bg-muted rounded-lg animate-pulse mb-4" />
        <div className="h-4 bg-muted rounded w-full animate-pulse mb-2" />
        <div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
      </div>
    );
  }

  if (!item.data) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-20">
        <p className="text-muted-foreground">Instructional not found.</p>
        <Link href="/"><Button variant="outline" className="mt-4">Back to library</Button></Link>
      </div>
    );
  }

  const it = item.data;
  const progVideoIdx = it.progressVideoId ? videos.findIndex((v) => v.id === it.progressVideoId) : -1;
  const aggregateBefore = progVideoIdx > 0 ? videos.slice(0, progVideoIdx).reduce((s, v) => s + (v.duration ?? 0), 0) : 0;
  const aggregateProgress = aggregateBefore + (it.progress || 0);
  const totalDuration = it.duration || videos.reduce((s, v) => s + (v.duration ?? 0), 0);
  const progressPct = totalDuration && totalDuration > 0 ? Math.min(100, Math.round((aggregateProgress / totalDuration) * 100)) : 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-4" /> Back to library
      </Link>

      {/* Player */}
      <div className="rounded-lg overflow-hidden border border-card-border bg-black mb-6">
        {currentVideo ? (
          <video
            ref={videoRef}
            key={currentVideo.id}
            src={apiUrl(`/api/videos/${currentVideo.id}/stream`)}
            controls
            autoPlay={autoAdvance}
            className="w-full aspect-video"
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            onEnded={onEnded}
            poster={it.thumbnail ? apiUrl(`/api/thumb/${it.id}?v=${it.updatedAt}`) : undefined}
            data-testid="video-player"
          />
        ) : (
          <div className="w-full aspect-video flex items-center justify-center text-muted-foreground text-sm">
            No playable video parts.
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {it.techniqueCategories?.map((cat: any) => (
              <TechniqueBadge key={cat.id} category={cat} />
            ))}
            {it.ruleset && it.ruleset !== "unknown" && RULESET_DISPLAY[it.ruleset] && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${RULESET_DISPLAY[it.ruleset].cls}`}>
                <Shirt className="size-3" />
                {RULESET_DISPLAY[it.ruleset].label}
              </span>
            )}
            {!it.available && (
              <span className="inline-flex items-center gap-1 text-amber-500 text-xs">
                <Clock className="size-3" /> Folder missing on disk
              </span>
            )}
            {videos.length > 1 && (
              <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                <ListVideo className="size-3" /> Part {currentIndex + 1} of {videos.length}
              </span>
            )}
          </div>
          <h1 className="font-display font-bold text-xl leading-tight mb-2">{it.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            {it.instructor && (
              <Link href={`/instructors/${it.instructor.id}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <BeltDot belt={it.instructor.belt} />
                <span className="font-medium text-foreground">{it.instructor.name}</span>
              </Link>
            )}
            {it.position && (
              <><span className="text-muted-foreground/40">·</span><span>{it.position.name}</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={toggleWatched} disabled={progressMutation.isPending}>
            {it.watched ? (<><CheckCircle2 className="size-4 text-emerald-500" /> Watched</>) : (<><Circle className="size-4" /> Mark watched</>)}
          </Button>
          <Button variant="outline" size="icon" onClick={() => setEditOpen(true)} aria-label="Edit">
            <Pencil className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => { if (confirm("Delete this instructional entry?")) deleteMutation.mutate(); }} aria-label="Delete" className="text-destructive hover:text-destructive">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Rating + progress */}
      <div className="flex items-center gap-6 mb-6 pb-6 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rating</span>
          <RatingStars value={it.rating || 0} />
        </div>
        {progressPct > 0 && (
          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <span className="text-xs text-muted-foreground">Progress</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-xs font-mono text-muted-foreground">{progressPct}%</span>
          </div>
        )}
      </div>

      {/* Metadata grid */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          {it.description && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">Description</h3>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{it.description}</p>
            </div>
          )}
          {it.notes && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">Notes</h3>
              <p className="text-sm leading-relaxed whitespace-pre-wrap rounded-md bg-card border border-card-border p-3">{it.notes}</p>
            </div>
          )}
          {videos.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">Parts</h3>
              <div className="rounded-md border border-card-border overflow-hidden">
                {videos.map((v, i) => {
                  const active = v.id === currentVideo?.id;
                  return (
                    <button key={v.id} onClick={() => switchPart(v.id)} data-testid={`button-part-${v.id}`}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm border-b border-card-border last:border-0 transition-colors ${
                        active ? "bg-primary/10 text-foreground" : "hover:bg-muted/60"
                      }`}
                    >
                      <Play className={`size-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} fill="currentColor" />
                      <span className="font-mono text-xs text-muted-foreground w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex-1 truncate font-mono text-xs">{v.fileName}</span>
                      {!v.available && <span className="text-[10px] text-amber-500">missing</span>}
                      {v.duration ? <span className="text-[10px] text-muted-foreground font-mono">{formatDuration(v.duration)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {it.tags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {it.tags.map((t: any) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    <TagIcon className="size-3 text-muted-foreground" />{t.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <MetaRow icon={Clock} label="Duration" value={formatDuration(it.duration)} />
          <MetaRow icon={ListVideo} label="Parts" value={String(videos.length)} />
          <MetaRow icon={HardDrive} label="Size" value={formatBytes(videos.reduce((s, v) => s + (v.fileSize ?? 0), 0))} />
          <MetaRow icon={Calendar} label="Added" value={formatRelative(it.createdAt)} />
          {it.folderPath && <MetaRow icon={Folder} label="Folder" value={it.folderPath} mono />}
        </div>
      </div>

      <EditDialog open={editOpen} onOpenChange={setEditOpen} instructional={it} />
    </div>
  );
}

function MetaRow({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-border/50">
      <Icon className="size-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground text-xs w-20 shrink-0">{label}</span>
      <span className={`text-xs truncate ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function EditDialog({
  open, onOpenChange, instructional,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; instructional: any;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "",
    description: "",
    instructorId: "",
    positionId: "",
    ruleset: "unknown",
    notes: "",
    rating: 0,
  });
  const [selectedTechniqueIds, setSelectedTechniqueIds] = useState<number[]>([]);
  const [parts, setParts] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [newTag, setNewTag] = useState("");

  const instructors = useQuery({
    queryKey: ["/api/instructors"],
    queryFn: async () => (await fetch(apiUrl("/api/instructors"))).json(),
  });
  const categories = useQuery({
    queryKey: ["/api/categories"],
    queryFn: async () => (await fetch(apiUrl("/api/categories"))).json(),
  });
  // Positions: scoped to the FIRST selected technique when editing, otherwise all
  const firstTechId = selectedTechniqueIds[0];
  const positionsQs = firstTechId ? `?techniqueCategoryId=${firstTechId}` : "";
  const positions = useQuery({
    queryKey: ["/api/positions", positionsQs],
    queryFn: async ({ queryKey }) => {
      const [, qs] = queryKey as [string, string];
      return (await fetch(apiUrl(`/api/positions${qs}`))).json();
    },
  });
  const tags = useQuery({
    queryKey: ["/api/tags"],
    queryFn: async () => (await fetch(apiUrl("/api/tags"))).json(),
  });

  useEffect(() => {
    if (open && instructional) {
      setForm({
        title: instructional.title || "",
        description: instructional.description || "",
        instructorId: instructional.instructorId ? String(instructional.instructorId) : "",
        positionId: instructional.positionId ? String(instructional.positionId) : "",
        ruleset: instructional.ruleset || "unknown",
        notes: instructional.notes || "",
        rating: instructional.rating || 0,
      });
      // Seed from M2M array; fall back to legacy single value for old rows
      const techIds: number[] =
        instructional.techniqueCategories?.map((c: any) => c.id) ??
        (instructional.techniqueCategoryId ? [instructional.techniqueCategoryId] : []);
      setSelectedTechniqueIds(techIds);
      setParts((instructional.videos ?? []).map((v: any) => v.filePath).filter(Boolean));
      setSelectedTags(instructional.tags?.map((t: any) => t.id) || []);
      setNewTag("");
    }
  }, [open, instructional?.id]);

  // When technique selection changes, clear positionId to avoid stale value
  const toggleTechnique = (id: number) => {
    setSelectedTechniqueIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      // Clear position when technique changes
      setForm((f) => ({ ...f, positionId: "" }));
      return next;
    });
  };

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => apiRequest("POST", "/api/tags", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tags"] }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleaned = parts
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => {
          const seg = p.replace(/\\/g, "/").split("/").pop() || p;
          return { filePath: p, fileName: seg, sortOrder: i, available: true };
        });
      const payload: any = {
        title: form.title,
        description: form.description || null,
        instructorId: form.instructorId ? Number(form.instructorId) : null,
        positionId: form.positionId ? Number(form.positionId) : null,
        ruleset: form.ruleset,
        notes: form.notes || null,
        rating: form.rating,
        tagIds: selectedTags,
        techniqueCategoryIds: selectedTechniqueIds,
        videos: cleaned,
      };
      return apiRequest("PATCH", `/api/instructionals/${instructional.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/instructionals"] });
      qc.invalidateQueries({ queryKey: ["/api/instructionals", instructional.id] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Saved" });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-4 shrink-0">
          <DialogTitle>Edit instructional</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-4 overflow-y-auto flex-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="f-title">Title</Label>
            <Input id="f-title" value={form.title} onChange={(e) => set("title", e.target.value)} data-testid="input-title" />
          </div>

          {/* Instructor */}
          <div className="space-y-1.5">
            <Label>Instructor</Label>
            <Select value={form.instructorId} onValueChange={(v) => set("instructorId", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {instructors.data?.map((i: any) => (
                  <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Technique (multi-select toggle grid) */}
          <div className="space-y-1.5">
            <Label>Technique <span className="text-muted-foreground text-xs font-normal">(select all that apply)</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {categories.data?.map((c: any) => {
                const active = selectedTechniqueIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleTechnique(c.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      active
                        ? "border-transparent text-white"
                        : "border-border bg-muted hover:bg-muted/70 text-muted-foreground"
                    }`}
                    style={active ? { backgroundColor: c.color } : {}}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: active ? "rgba(255,255,255,0.5)" : c.color }} />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ruleset */}
          <div className="space-y-1.5">
            <Label>Ruleset</Label>
            <div className="flex gap-2 flex-wrap">
              {RULESET_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => set("ruleset", r.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    form.ruleset === r.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-muted hover:bg-muted/70 text-muted-foreground"
                  }`}
                >
                  <Shirt className="size-3" />
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Position — scoped to selected technique */}
          <div className="space-y-1.5">
            <Label>
              Position
              {firstTechId && (
                <span className="ml-1 text-muted-foreground text-xs font-normal">(filtered by technique)</span>
              )}
            </Label>
            <Select value={form.positionId} onValueChange={(v) => set("positionId", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {positions.data?.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.group}: {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="f-desc">Description</Label>
            <Textarea id="f-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="f-notes">Notes</Label>
            <Textarea id="f-notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          {/* Rating */}
          <div className="space-y-1.5">
            <Label>Rating</Label>
            <RatingStars value={form.rating} onChange={(v) => set("rating", v)} size={20} />
          </div>

          {/* Video parts */}
          <div className="space-y-1.5">
            <Label>Video parts (file path or URL)</Label>
            <div className="space-y-2">
              {parts.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={p}
                    onChange={(e) => setParts((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                    className="font-mono text-xs"
                    placeholder="Instructor/Title/part1.mkv or https://…"
                    data-testid={`input-part-${i}`}
                  />
                  <Button variant="outline" size="icon" onClick={() => setParts((arr) => arr.filter((_, j) => j !== i))} aria-label="Remove part" data-testid={`button-remove-part-${i}`}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setParts((arr) => [...arr, ""])} data-testid="button-add-part">
                <Plus className="size-4" /> Add part
              </Button>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 min-h-8 p-2 rounded-md border border-input bg-background">
              {tags.data
                ?.filter((t: any) => selectedTags.includes(t.id))
                .map((t: any) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">
                    {t.name}
                    <button onClick={() => setSelectedTags((s) => s.filter((id) => id !== t.id))}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a tag…"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const name = newTag.trim();
                  if (!name) return;
                  const existing = tags.data?.find((t: any) => t.name.toLowerCase() === name.toLowerCase());
                  if (existing) {
                    setSelectedTags((s) => s.includes(existing.id) ? s : [...s, existing.id]);
                  } else {
                    createTagMutation.mutate(name, {
                      onSuccess: async (res) => { const created = await res.json(); setSelectedTags((s) => [...s, created.id]); },
                    });
                  }
                  setNewTag("");
                }}
              />
              <Button variant="outline" size="icon" onClick={() => {
                const name = newTag.trim();
                if (!name) return;
                const existing = tags.data?.find((t: any) => t.name.toLowerCase() === name.toLowerCase());
                if (existing) {
                  setSelectedTags((s) => s.includes(existing.id) ? s : [...s, existing.id]);
                } else {
                  createTagMutation.mutate(name, {
                    onSuccess: async (res) => { const created = await res.json(); setSelectedTags((s) => [...s, created.id]); },
                  });
                }
                setNewTag("");
              }}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="size-4" /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
