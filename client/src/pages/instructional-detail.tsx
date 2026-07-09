import { useState, useEffect, useRef } from "react";
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
  Tag as TagIcon,
  Save,
  X,
  Plus,
} from "lucide-react";
import { formatDuration, formatBytes, formatRelative } from "@/lib/format";

export default function InstructionalDetail() {
  const { id } = useParams();
  const numId = Number(id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const item = useQuery({
    queryKey: ["/api/instructionals", numId],
    queryFn: async ({ queryKey }) => {
      const res = await fetch(apiUrl(`/api/instructionals/${numId}`));
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const progressMutation = useMutation({
    mutationFn: async (data: { progress: number; watched: boolean }) =>
      apiRequest("PATCH", `/api/instructionals/${numId}/progress`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/instructionals", numId] });
      qc.invalidateQueries({ queryKey: ["/api/instructionals"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/instructionals/${numId}`),
    onSuccess: () => {
      toast({ title: "Deleted" });
      window.location.hash = "#/";
    },
  });

  const toggleWatched = () => {
    progressMutation.mutate({
      progress: item.data?.progress || 0,
      watched: !item.data?.watched,
    });
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !item.data) return;
    // throttle: only persist every ~10s
    const sec = Math.floor(v.currentTime);
    if (sec % 10 === 0 && sec > 0 && sec !== item.data.progress) {
      const watched = v.duration ? v.currentTime / v.duration > 0.9 : false;
      progressMutation.mutate({ progress: sec, watched });
    }
  };

  const onEnded = () => {
    progressMutation.mutate({
      progress: item.data?.duration || 0,
      watched: true,
    });
  };

  useEffect(() => {
    const v = videoRef.current;
    if (v && item.data?.progress && item.data.progress > 5) {
      v.currentTime = item.data.progress;
    }
  }, [item.data?.id]);

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
        <Link href="/">
          <Button variant="outline" className="mt-4">
            Back to library
          </Button>
        </Link>
      </div>
    );
  }

  const it = item.data;
  const progressPct =
    it.duration && it.duration > 0
      ? Math.min(100, Math.round((it.progress / it.duration) * 100))
      : 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" />
        Back to library
      </Link>

      {/* Player */}
      <div className="rounded-lg overflow-hidden border border-card-border bg-black mb-6">
        <video
          ref={videoRef}
          src={apiUrl(`/api/stream/${it.id}`)}
          controls
          className="w-full aspect-video"
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          poster={it.thumbnail || undefined}
          data-testid="video-player"
        />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {it.techniqueCategory && (
              <TechniqueBadge category={it.techniqueCategory} />
            )}
            {!it.available && (
              <span className="inline-flex items-center gap-1 text-amber-500 text-xs">
                <Clock className="size-3" /> File missing on disk
              </span>
            )}
          </div>
          <h1 className="font-display font-bold text-xl leading-tight mb-2">
            {it.title}
          </h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            {it.instructor && (
              <Link
                href={`/instructors/${it.instructor.id}`}
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <BeltDot belt={it.instructor.belt} />
                <span className="font-medium text-foreground">
                  {it.instructor.name}
                </span>
              </Link>
            )}
            {it.position && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{it.position.name}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleWatched}
            disabled={progressMutation.isPending}
          >
            {it.watched ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-500" />
                Watched
              </>
            ) : (
              <>
                <Circle className="size-4" />
                Mark watched
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setEditOpen(true)}
            aria-label="Edit"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (confirm("Delete this instructional entry?")) deleteMutation.mutate();
            }}
            aria-label="Delete"
            className="text-destructive hover:text-destructive"
          >
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
              <div
                className="h-full bg-primary"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {progressPct}%
            </span>
          </div>
        )}
      </div>

      {/* Metadata grid */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          {it.description && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">
                Description
              </h3>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {it.description}
              </p>
            </div>
          )}
          {it.notes && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">
                Notes
              </h3>
              <p className="text-sm leading-relaxed whitespace-pre-wrap rounded-md bg-card border border-card-border p-3">
                {it.notes}
              </p>
            </div>
          )}
          {it.tags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {it.tags.map((t: any) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs"
                  >
                    <TagIcon className="size-3 text-muted-foreground" />
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <MetaRow icon={Clock} label="Duration" value={formatDuration(it.duration)} />
          <MetaRow
            icon={HardDrive}
            label="File size"
            value={formatBytes(it.fileSize)}
          />
          <MetaRow
            icon={Calendar}
            label="Added"
            value={formatRelative(it.createdAt)}
          />
          <MetaRow icon={TagIcon} label="File" value={it.fileName} mono />
        </div>
      </div>

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        instructional={it}
      />
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: any;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-border/50">
      <Icon className="size-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground text-xs w-20 shrink-0">{label}</span>
      <span className={`text-xs truncate ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function EditDialog({
  open,
  onOpenChange,
  instructional,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instructional: any;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: "",
    description: "",
    instructorId: "",
    positionId: "",
    techniqueCategoryId: "",
    notes: "",
    filePath: "",
    rating: 0,
  });
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [newTag, setNewTag] = useState("");

  const instructors = useQuery({
    queryKey: ["/api/instructors"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });
  const positions = useQuery({
    queryKey: ["/api/positions"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });
  const categories = useQuery({
    queryKey: ["/api/categories"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });
  const tags = useQuery({
    queryKey: ["/api/tags"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });

  useEffect(() => {
    if (open && instructional) {
      setForm({
        title: instructional.title || "",
        description: instructional.description || "",
        instructorId: instructional.instructorId
          ? String(instructional.instructorId)
          : "",
        positionId: instructional.positionId
          ? String(instructional.positionId)
          : "",
        techniqueCategoryId: instructional.techniqueCategoryId
          ? String(instructional.techniqueCategoryId)
          : "",
        notes: instructional.notes || "",
        filePath: instructional.filePath || "",
        rating: instructional.rating || 0,
      });
      setSelectedTags(instructional.tags?.map((t: any) => t.id) || []);
      setNewTag("");
    }
  }, [open, instructional?.id]);

  const createTagMutation = useMutation({
    mutationFn: async (name: string) =>
      apiRequest("POST", "/api/tags", { name }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["/api/tags"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: form.title,
        description: form.description || null,
        instructorId: form.instructorId ? Number(form.instructorId) : null,
        positionId: form.positionId ? Number(form.positionId) : null,
        techniqueCategoryId: form.techniqueCategoryId
          ? Number(form.techniqueCategoryId)
          : null,
        notes: form.notes || null,
        filePath: form.filePath,
        rating: form.rating,
        tagIds: selectedTags,
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
          <div className="space-y-1.5">
            <Label htmlFor="f-title">Title</Label>
            <Input
              id="f-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              data-testid="input-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Instructor</Label>
              <Select
                value={form.instructorId}
                onValueChange={(v) => set("instructorId", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {instructors.data?.map((i: any) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Technique</Label>
              <Select
                value={form.techniqueCategoryId}
                onValueChange={(v) => set("techniqueCategoryId", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {categories.data?.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Position</Label>
            <Select
              value={form.positionId}
              onValueChange={(v) => set("positionId", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {positions.data?.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.group}: {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-desc">Description</Label>
            <Textarea
              id="f-desc"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-notes">Notes</Label>
            <Textarea
              id="f-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Rating</Label>
            <RatingStars
              value={form.rating}
              onChange={(v) => set("rating", v)}
              size={20}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 min-h-8 p-2 rounded-md border border-input bg-background">
              {tags.data
                ?.filter((t: any) => selectedTags.includes(t.id))
                .map((t: any) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs"
                  >
                    {t.name}
                    <button
                      onClick={() =>
                        setSelectedTags((s) => s.filter((id) => id !== t.id))
                      }
                    >
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
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const name = newTag.trim();
                    if (!name) return;
                    const existing = tags.data?.find(
                      (t: any) => t.name.toLowerCase() === name.toLowerCase()
                    );
                    if (existing) {
                      setSelectedTags((s) =>
                        s.includes(existing.id) ? s : [...s, existing.id]
                      );
                    } else {
                      createTagMutation.mutate(name, {
                        onSuccess: async (res) => {
                          const created = await res.json();
                          setSelectedTags((s) => [...s, created.id]);
                        },
                      });
                    }
                    setNewTag("");
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const name = newTag.trim();
                  if (!name) return;
                  const existing = tags.data?.find(
                    (t: any) => t.name.toLowerCase() === name.toLowerCase()
                  );
                  if (existing) {
                    setSelectedTags((s) =>
                      s.includes(existing.id) ? s : [...s, existing.id]
                    );
                  } else {
                    createTagMutation.mutate(name, {
                      onSuccess: async (res) => {
                        const created = await res.json();
                        setSelectedTags((s) => [...s, created.id]);
                      },
                    });
                  }
                  setNewTag("");
                }}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-path">File path / URL</Label>
            <Input
              id="f-path"
              value={form.filePath}
              onChange={(e) => set("filePath", e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="size-4" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
