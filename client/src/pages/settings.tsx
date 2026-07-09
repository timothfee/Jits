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
  const [newPos, setNewPos] = useState({ name: "", techniqueCategoryId: "" });
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
      if (data?.error) {
        toast({ title: "Scan found nothing", description: data.error, variant: "destructive" });
      } else {
        toast({
          title: "Scan complete",
          description: `Added ${data.added} \u2022 Updated ${data.updated} \u2022 Instructors inferred ${data.inferred ?? 0} \u2022 Missing ${data.missing}`,
        });
      }
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
        description: `Generated ${data.generated} \u2022 Failed ${data.failed} \u2022 Skipped ${data.skipped}`,
      });
      qc.invalidateQueries({ queryKey: ["/api/instructionals"] });
    },
    onError: () =>
      toast({ title: "Thumbnail generation failed", description: "Is ffmpeg installed in the container?", variant: "destructive" }),
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
      setNewPos({ name: "", techniqueCategoryId: "" });
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

  const catById = new Map<number, any>((categories.data ?? []).map((c: any) => [c.id, c]));

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
            <Stat label="Total runtime" value={fmtHours(stats.data?.totalDuration)} />
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FolderTree className="size-3.5" />
              <span className="text-xs uppercase tracking-wider font-mono">Mounted media path</span>
            </div>
            <code className="text-xs">/media</code>
            <p className="text-xs text-muted-foreground mt-2">
              In Docker, bind-mount your instructionals folder to{" "}
              <code className="text-xs">/media</code> and click scan. Videos are detected
              recursively; only file paths and metadata are stored in the database.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
              <ScanLine className="size-4" />
              {scanMutation.isPending ? "Scanning\u2026" : "Scan now"}
            </Button>
            {scanResult?.error ? (
              <span className="text-xs text-destructive font-mono">{scanResult.error}</span>
            ) : scanResult ? (
              <span className="text-xs text-muted-foreground font-mono">
                scanned {scanResult.scanned} \u00b7 added {scanResult.added} \u00b7 updated{" "}
                {scanResult.updated} \u00b7 inferred {scanResult.inferred ?? 0} \u00b7 missing{" "}
                {scanResult.missing}
              </span>
            ) : null}
            {scanResult?.warnings?.length > 0 && (
              <span className="text-xs text-amber-500 dark:text-amber-400 font-mono">
                {scanResult.warnings.length} folder(s) skipped \u2014 see container logs
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-card-border/60">
            <Button variant="secondary" onClick={() => thumbMutation.mutate()} disabled={thumbMutation.isPending}>
              <ImageIcon className="size-4" />
              {thumbMutation.isPending ? "Generating\u2026" : "Generate thumbnails"}
            </Button>
            {thumbResult && (
              <span className="text-xs text-muted-foreground font-mono">
                generated {thumbResult.generated} \u00b7 failed {thumbResult.failed} \u00b7 skipped{" "}
                {thumbResult.skipped}
              </span>
            )}
            <p className="text-xs text-muted-foreground basis-full">
              Extracts a preview frame from each video using ffmpeg. Stored in the data volume so
              they persist across restarts. Re-run after adding new videos.
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
                <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
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
          {/* Group positions by their linked technique category */}
          {categories.data?.map((cat: any) => {
            const linked = (positions.data ?? []).filter(
              (p: any) => p.techniqueCategoryId === cat.id
            );
            if (linked.length === 0) return null;
            return (
              <div key={cat.id}>
                <div
                  className="text-[10px] uppercase tracking-wider font-mono mb-1.5 flex items-center gap-1.5"
                  style={{ color: cat.color }}
                >
                  <span className="size-1.5 rounded-full inline-block" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </div>
                <div className="flex flex-wrap gap-2">
                  {linked.map((p: any) => (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-sm"
                    >
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
              </div>
            );
          })}
          {/* Unlinked positions */}
          {(() => {
            const unlinked = (positions.data ?? []).filter((p: any) => !p.techniqueCategoryId);
            if (unlinked.length === 0) return null;
            return (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-mono mb-1.5 text-muted-foreground">
                  Uncategorized
                </div>
                <div className="flex flex-wrap gap-2">
                  {unlinked.map((p: any) => (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-sm"
                    >
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
              </div>
            );
          })()}

          {/* Add form — no Group field */}
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/40">
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
              <label className="text-xs text-muted-foreground">Technique</label>
              <select
                value={newPos.techniqueCategoryId}
                onChange={(e) => setNewPos((p) => ({ ...p, techniqueCategoryId: e.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm w-36"
              >
                <option value="">None</option>
                {categories.data?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                if (!newPos.name.trim()) return;
                // Derive group from the selected technique category name, fall back to "Other"
                const cat = newPos.techniqueCategoryId
                  ? catById.get(Number(newPos.techniqueCategoryId))
                  : null;
                const payload: any = {
                  name: newPos.name.trim(),
                  group: cat?.name ?? "Other",
                };
                if (newPos.techniqueCategoryId) {
                  payload.techniqueCategoryId = Number(newPos.techniqueCategoryId);
                }
                addPos.mutate(payload);
              }}
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
                  <span className="text-[10px] text-muted-foreground font-mono">{t.count}</span>
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
                if (e.key === "Enter" && newTag.trim()) addTag.mutate(newTag.trim());
              }}
              placeholder="Add a tag\u2026"
              className="max-w-xs"
            />
            <Button variant="outline" onClick={() => newTag.trim() && addTag.mutate(newTag.trim())}>
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
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{label}</div>
      <div className="font-display font-bold text-lg">{value ?? "\u2014"}</div>
    </div>
  );
}

function fmtHours(seconds?: number) {
  if (!seconds) return "\u2014";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
