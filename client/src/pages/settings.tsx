import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Trash2, ScanLine, FolderTree, Tag, MapPin, Layers, ImageIcon } from "lucide-react";

export default function Settings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newCat, setNewCat] = useState({ name: "", color: "#3b82f6" });
  const [newPos, setNewPos] = useState({ name: "", group: "Other" });
  const [newTag, setNewTag] = useState("");
  const [scanResult, setScanResult] = useState<any>(null);
  const [thumbResult, setThumbResult] = useState<any>(null);

  const stats = useQuery({
    queryKey: ["/api/stats"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });
  const categories = useQuery({
    queryKey: ["/api/categories"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });
  const positions = useQuery({
    queryKey: ["/api/positions"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });
  const tags = useQuery({
    queryKey: ["/api/tags"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });

  const scanMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/instructionals/scan"),
    onSuccess: async (res) => {
      const data = await res.json();
      setScanResult(data);
      toast({
        title: "Scan complete",
        description: `Added ${data.added} • Updated ${data.updated} • Instructors inferred ${data.inferred ?? 0} • Missing ${data.missing}`,
      });
      qc.invalidateQueries({ queryKey: ["/api/instructionals"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });

  const thumbMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/instructionals/thumbnails"),
    onSuccess: async (res) => {
      const data = await res.json();
      setThumbResult(data);
      toast({
        title: "Thumbnails generated",
        description: `Generated ${data.generated} • Failed ${data.failed} • Skipped ${data.skipped}`,
      });
      qc.invalidateQueries({ queryKey: ["/api/instructionals"] });
    },
    onError: () =>
      toast({
        title: "Thumbnail generation failed",
        description: "Is ffmpeg installed in the container?",
        variant: "destructive",
      }),
  });

  const addCat = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/categories", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
      setNewCat({ name: "", color: "#3b82f6" });
    },
  });
  const delCat = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/categories"] }),
  });

  const addPos = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/positions", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/positions"] });
      setNewPos({ name: "", group: "Other" });
    },
  });
  const delPos = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/positions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/positions"] }),
  });

  const addTag = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/tags", { name }),
    onSuccess: () => setNewTag(""),
  });
  const delTag = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tags/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tags"] }),
  });

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="font-display font-bold text-xl mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Manage your media library, controlled vocabularies, and tags.
      </p>

      {/* Library / media config */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="size-4 text-primary" />
            Media library
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Total" value={stats.data?.total} />
            <Stat label="Watched" value={stats.data?.watched} />
            <Stat label="Instructors" value={stats.data?.instructors} />
            <Stat
              label="Total runtime"
              value={fmtHours(stats.data?.totalDuration)}
            />
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FolderTree className="size-3.5" />
              <span className="text-xs uppercase tracking-wider font-mono">
                Mounted media path
              </span>
            </div>
            <code className="text-xs">/media</code>
            <p className="text-xs text-muted-foreground mt-2">
              In Docker, bind-mount your instructionals folder to{" "}
              <code className="text-xs">/media</code> and click scan. Videos are
              detected recursively; only file paths and metadata are stored in
              the database.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
            >
              <ScanLine className="size-4" />
              {scanMutation.isPending ? "Scanning…" : "Scan now"}
            </Button>
            {scanResult && (
              <span className="text-xs text-muted-foreground font-mono">
                scanned {scanResult.scanned} · added {scanResult.added} ·
                updated {scanResult.updated} · inferred {scanResult.inferred ?? 0} ·
                missing {scanResult.missing}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-card-border/60">
            <Button
              variant="secondary"
              onClick={() => thumbMutation.mutate()}
              disabled={thumbMutation.isPending}
            >
              <ImageIcon className="size-4" />
              {thumbMutation.isPending ? "Generating…" : "Generate thumbnails"}
            </Button>
            {thumbResult && (
              <span className="text-xs text-muted-foreground font-mono">
                generated {thumbResult.generated} · failed {thumbResult.failed}
                · skipped {thumbResult.skipped}
              </span>
            )}
            <p className="text-xs text-muted-foreground basis-full">
              Extracts a preview frame from each video using ffmpeg. Stored in
              the data volume so they persist across restarts. Re-run after
              adding new videos.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Technique categories */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-primary" />
            Technique categories
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {categories.data?.map((c: any) => (
              <div
                key={c.id}
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.name}
                <button
                  onClick={() => delCat.mutate(c.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                value={newCat.name}
                onChange={(e) => setNewCat((c) => ({ ...c, name: e.target.value }))}
                placeholder="e.g. Sweeps"
                className="w-48"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Color</label>
              <input
                type="color"
                value={newCat.color}
                onChange={(e) => setNewCat((c) => ({ ...c, color: e.target.value }))}
                className="h-9 w-12 rounded border border-input bg-background cursor-pointer"
              />
            </div>
            <Button
              variant="outline"
              onClick={() =>
                newCat.name.trim() &&
                addCat.mutate({ ...newCat, slug: newCat.name.toLowerCase().replace(/\s+/g, "-") })
              }
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Positions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4 text-primary" />
            Positions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {positions.data?.map((p: any) => (
              <div
                key={p.id}
                className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-sm"
              >
                <span className="text-[10px] text-muted-foreground font-mono uppercase">
                  {p.group}
                </span>
                {p.name}
                <button
                  onClick={() => delPos.mutate(p.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                value={newPos.name}
                onChange={(e) => setNewPos((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Spider Guard"
                className="w-48"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Group</label>
              <Input
                value={newPos.group}
                onChange={(e) => setNewPos((p) => ({ ...p, group: e.target.value }))}
                className="w-32"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => newPos.name.trim() && addPos.mutate(newPos)}
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="size-4 text-primary" />
            Tags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tags.data?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.data.map((t: any) => (
                <div
                  key={t.id}
                  className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-sm"
                >
                  {t.name}
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {t.count}
                  </span>
                  <button
                    onClick={() => delTag.mutate(t.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) {
                  addTag.mutate(newTag.trim());
                }
              }}
              placeholder="Add a tag…"
              className="max-w-xs"
            />
            <Button
              variant="outline"
              onClick={() => newTag.trim() && addTag.mutate(newTag.trim())}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
        {label}
      </div>
      <div className="font-display font-bold text-lg">{value ?? "—"}</div>
    </div>
  );
}

function fmtHours(seconds?: number) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
