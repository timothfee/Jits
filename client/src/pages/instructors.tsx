import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { BeltDot } from "@/components/technique-badge";
import { Plus, Pencil, Trash2, Users, Award } from "lucide-react";
import { BELT_COLORS } from "@shared/schema";

export default function Instructors() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const list = useQuery({
    queryKey: ["/api/instructors"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/instructors/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/instructors"] });
      toast({ title: "Instructor deleted" });
    },
  });

  const instructors: any[] = list.data || [];
  const selected = id ? instructors.find((i) => i.id === Number(id)) : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-xl">Instructors</h1>
          <p className="text-sm text-muted-foreground">
            {instructors.length} instructor{instructors.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add instructor
        </Button>
      </div>

      {list.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : instructors.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="size-7 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold">No instructors yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Add instructors to organize your instructionals by coach.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {instructors.map((i: any) => (
            <div
              key={i.id}
              className="rounded-lg border border-card-border bg-card p-4 hover-elevate transition-shadow"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-display font-bold text-lg shrink-0">
                  {i.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{i.name}</h3>
                    <BeltDot belt={i.belt} />
                  </div>
                  {i.academy && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <Award className="size-3" />
                      {i.academy}
                    </p>
                  )}
                </div>
              </div>
              {i.bio && (
                <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                  {i.bio}
                </p>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-border/50">
                <Link
                  href={`/?instructorId=${i.id}`}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  {i.count} instructional{i.count === 1 ? "" : "s"} →
                </Link>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => {
                      setEditing(i);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    onClick={() => {
                      if (confirm(`Delete ${i.name}?`))
                        deleteMutation.mutate(i.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <InstructorDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
      />
    </div>
  );
}

function InstructorDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    bio: "",
    academy: "",
    belt: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: editing?.name || "",
        bio: editing?.bio || "",
        academy: editing?.academy || "",
        belt: editing?.belt || "",
      });
    }
  }, [open, editing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, belt: form.belt || null, academy: form.academy || null, bio: form.bio || null };
      if (editing) {
        return apiRequest("PATCH", `/api/instructors/${editing.id}`, payload);
      }
      return apiRequest("POST", "/api/instructors", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/instructors"] });
      toast({ title: editing ? "Updated" : "Created" });
      onOpenChange(false);
      setForm({ name: "", bio: "", academy: "", belt: "" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setForm({ name: "", bio: "", academy: "", belt: "" });
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit instructor" : "Add instructor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="i-name">Name</Label>
            <Input
              id="i-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Academy</Label>
              <Input
                value={form.academy}
                onChange={(e) => set("academy", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Belt</Label>
              <Select value={form.belt} onValueChange={(v) => set("belt", v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {BELT_COLORS.map((b) => (
                    <SelectItem key={b} value={b} className="capitalize">
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-bio">Bio</Label>
            <Textarea
              id="i-bio"
              rows={3}
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!form.name.trim() || saveMutation.isPending}
          >
            {editing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
