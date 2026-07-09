import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/queryClient";
import {
  InstructionalCard,
  InstructionalCardSkeleton,
  EmptyLibrary,
} from "@/components/instructional-card";
import { Button } from "@/components/ui/button";
import {
  Filter,
  ArrowDownWideNarrow,
  Eraser,
  CircleDot,
  Search,
  Shirt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const RULESETS = [
  { value: "gi", label: "Gi" },
  { value: "nogi", label: "No-Gi" },
  { value: "both", label: "Both" },
] as const;

type Filters = {
  q?: string;
  instructorId?: number;
  techniqueCategoryIds?: number[];
  positionId?: number;
  tagId?: number;
  ruleset?: string;
  watched?: boolean;
  sort?: string;
};

function useFilters(): [Filters, (patch: Partial<Filters>) => void, () => void] {
  const [location] = useLocation();
  const rawHash = typeof window !== "undefined" ? window.location.hash.slice(1) : location;
  const hashLocation = rawHash || location || "/";
  const [basePath, search = ""] = hashLocation.split("?");
  const params = new URLSearchParams(search);

  const techIds = params.get("techniqueCategoryIds");
  const filters: Filters = {
    q: params.get("q") || undefined,
    instructorId: params.get("instructorId") ? Number(params.get("instructorId")) : undefined,
    techniqueCategoryIds: techIds
      ? techIds.split(",").map(Number).filter((n) => !isNaN(n) && n > 0)
      : undefined,
    positionId: params.get("positionId") ? Number(params.get("positionId")) : undefined,
    tagId: params.get("tagId") ? Number(params.get("tagId")) : undefined,
    ruleset: params.get("ruleset") || undefined,
    watched: params.get("watched") === "true" ? true : undefined,
    sort: params.get("sort") || undefined,
  };

  const setFilters = (patch: Partial<Filters>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
        p.delete(k);
      } else if (Array.isArray(v)) {
        p.set(k, v.join(","));
      } else {
        p.set(k, String(v));
      }
    }
    window.location.hash = `${basePath || "/"}${p.toString() ? `?${p.toString()}` : ""}`;
  };

  const clear = () => { window.location.hash = basePath || "/"; };

  return [filters, setFilters, clear];
}

const SORTS = [
  { value: "recent", label: "Recently added" },
  { value: "title", label: "Title A–Z" },
  { value: "rating", label: "Highest rated" },
  { value: "progress", label: "In progress" },
];

// Collapsible filter section
function FilterSection({
  title,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-2 group"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
          {title}
          {badge ? (
            <span className="rounded-full bg-primary text-primary-foreground text-[9px] px-1.5 py-0.5 font-sans normal-case tracking-normal">
              {badge}
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="size-3.5 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

export default function Library() {
  const [filters, setFilters, clearFilters] = useFilters();
  const [panelOpen, setPanelOpen] = useState(false);

  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.instructorId) params.set("instructorId", String(filters.instructorId));
  if (filters.techniqueCategoryIds?.length)
    params.set("techniqueCategoryIds", filters.techniqueCategoryIds.join(","));
  if (filters.positionId) params.set("positionId", String(filters.positionId));
  if (filters.tagId) params.set("tagId", String(filters.tagId));
  if (filters.ruleset) params.set("ruleset", filters.ruleset);
  if (filters.watched) params.set("watched", "true");
  if (filters.sort) params.set("sort", filters.sort);

  const list = useQuery({
    queryKey: ["/api/instructionals", params.toString()],
    queryFn: async ({ queryKey }) => {
      const [base, qs] = queryKey as [string, string];
      const url = qs ? `${apiUrl(base)}?${qs}` : apiUrl(base);
      const res = await fetch(url);
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const categories = useQuery({
    queryKey: ["/api/categories"],
    queryFn: async () => (await fetch(apiUrl("/api/categories"))).json(),
  });

  const firstTechId = filters.techniqueCategoryIds?.[0];
  const positionsQs = firstTechId ? `?techniqueCategoryId=${firstTechId}` : "";
  const positions = useQuery({
    queryKey: ["/api/positions", positionsQs],
    queryFn: async ({ queryKey }) => {
      const [, qs] = queryKey as [string, string];
      return (await fetch(apiUrl(`/api/positions${qs}`))).json();
    },
  });

  const instructors = useQuery({
    queryKey: ["/api/instructors"],
    queryFn: async () => (await fetch(apiUrl("/api/instructors"))).json(),
  });
  const tags = useQuery({
    queryKey: ["/api/tags"],
    queryFn: async () => (await fetch(apiUrl("/api/tags"))).json(),
  });

  const positionsByGroup = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of positions.data || []) {
      const g = p.group || "Other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    return Array.from(map.entries());
  }, [positions.data]);

  const toggleTechCategory = (id: number) => {
    const current = filters.techniqueCategoryIds || [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setFilters({ techniqueCategoryIds: next.length ? next : undefined, positionId: undefined });
  };

  const activeFilterCount =
    (filters.instructorId ? 1 : 0) +
    (filters.techniqueCategoryIds?.length ? 1 : 0) +
    (filters.positionId ? 1 : 0) +
    (filters.tagId ? 1 : 0) +
    (filters.ruleset ? 1 : 0) +
    (filters.watched ? 1 : 0);

  const items: any[] = list.data || [];

  const FilterPanel = (
    <div className="space-y-5">
      {/* Ruleset — closed by default */}
      <FilterSection title="Ruleset" defaultOpen={false} badge={filters.ruleset ? 1 : 0}>
        <div className="space-y-1">
          {RULESETS.map((r) => (
            <button
              key={r.value}
              onClick={() =>
                setFilters({ ruleset: filters.ruleset === r.value ? undefined : r.value })
              }
              className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                filters.ruleset === r.value
                  ? "bg-sidebar-accent"
                  : "hover:bg-sidebar-accent/60"
              }`}
            >
              <Shirt className="size-3.5 shrink-0" />
              {r.label}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Technique — open by default */}
      <FilterSection title="Technique" defaultOpen={true} badge={filters.techniqueCategoryIds?.length}>
        <div className="space-y-1">
          {categories.data?.map((c: any) => {
            const active = filters.techniqueCategoryIds?.includes(c.id) ?? false;
            return (
              <button
                key={c.id}
                onClick={() => toggleTechCategory(c.id)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                  active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
                }`}
              >
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="flex-1 truncate">{c.name}</span>
                {active && <span className="size-2 rounded-full bg-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </FilterSection>

      {/* Position — closed by default */}
      <FilterSection title="Position" defaultOpen={false} badge={filters.positionId ? 1 : 0}>
        {positionsByGroup.length === 0 && firstTechId ? (
          <p className="text-xs text-muted-foreground/60 px-2">No positions for this technique.</p>
        ) : (
          <div className="space-y-3">
            {positionsByGroup.map(([group, ps]) => (
              <div key={group}>
                <div className="text-[10px] text-muted-foreground font-mono mb-1 px-2 uppercase tracking-wider">
                  {group}
                  {firstTechId && (
                    <span className="ml-1 text-muted-foreground/50 normal-case">(filtered)</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {ps.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() =>
                        setFilters({ positionId: filters.positionId === p.id ? undefined : p.id })
                      }
                      className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                        filters.positionId === p.id
                          ? "bg-sidebar-accent"
                          : "hover:bg-sidebar-accent/60"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </FilterSection>

      {/* Instructor — closed by default */}
      <FilterSection title="Instructor" defaultOpen={false} badge={filters.instructorId ? 1 : 0}>
        <div className="space-y-0.5">
          {instructors.data?.map((i: any) => (
            <button
              key={i.id}
              onClick={() =>
                setFilters({ instructorId: filters.instructorId === i.id ? undefined : i.id })
              }
              className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                filters.instructorId === i.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
              }`}
            >
              <span className="flex-1 truncate">{i.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{i.count}</span>
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Tags — closed by default */}
      {tags.data?.length > 0 && (
        <FilterSection title="Tags" defaultOpen={false} badge={filters.tagId ? 1 : 0}>
          <div className="flex flex-wrap gap-1.5">
            {tags.data.map((t: any) => (
              <button
                key={t.id}
                onClick={() =>
                  setFilters({ tagId: filters.tagId === t.id ? undefined : t.id })
                }
                className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                  filters.tagId === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/70"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Status — closed by default */}
      <FilterSection title="Status" defaultOpen={false} badge={filters.watched ? 1 : 0}>
        <button
          onClick={() => setFilters({ watched: filters.watched ? undefined : true })}
          className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
            filters.watched ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
          }`}
        >
          <CircleDot className="size-3.5" />
          Watched only
        </button>
      </FilterSection>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Desktop filter sidebar */}
      <div className="hidden lg:block w-64 shrink-0 border-r border-border overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5">
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs">
              <Eraser className="size-3" />
              Clear
            </Button>
          )}
        </div>
        {FilterPanel}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h1 className="font-display font-bold text-xl">Library</h1>
              <p className="text-sm text-muted-foreground">
                {list.isLoading
                  ? "Loading…"
                  : `${items.length} instructional${items.length === 1 ? "" : "s"}`}
                {filters.q && ` for "${filters.q}"`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setPanelOpen((v) => !v)}
              >
                <Filter className="size-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary text-primary-foreground text-[10px] px-1.5">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              <div className="relative hidden sm:block">
                <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  placeholder="Search…"
                  value={filters.q || ""}
                  onChange={(e) => setFilters({ q: e.target.value || undefined })}
                  className="pl-8 pr-3 py-2 rounded-md border border-input bg-background text-sm w-48 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="relative">
                <ArrowDownWideNarrow className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <select
                  value={filters.sort || "recent"}
                  onChange={(e) => setFilters({ sort: e.target.value })}
                  className="appearance-none pl-8 pr-8 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent/40 cursor-pointer"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Mobile filter drawer */}
          {panelOpen && (
            <div className="lg:hidden mb-4 p-4 border border-border rounded-lg bg-card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">Filters</span>
                <Button variant="ghost" size="sm" onClick={() => setPanelOpen(false)}>
                  <Eraser className="size-3" /> Close
                </Button>
              </div>
              <div className="relative mb-4 sm:hidden">
                <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  placeholder="Search…"
                  value={filters.q || ""}
                  onChange={(e) => setFilters({ q: e.target.value || undefined })}
                  className="pl-8 pr-3 py-2 rounded-md border border-input bg-background text-sm w-full focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {FilterPanel}
            </div>
          )}

          {/* Active filter chips */}
          {(activeFilterCount > 0 || filters.q) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {filters.q && (
                <Chip label={`"${filters.q}"`} onClear={() => setFilters({ q: undefined })} />
              )}
              {filters.techniqueCategoryIds?.map((id) => {
                const cat = categories.data?.find((c: any) => c.id === id);
                return cat ? (
                  <Chip
                    key={id}
                    label={cat.name}
                    onClear={() =>
                      setFilters({
                        techniqueCategoryIds: filters.techniqueCategoryIds?.filter((x) => x !== id),
                      })
                    }
                  />
                ) : null;
              })}
              {filters.ruleset && (
                <Chip
                  label={RULESETS.find((r) => r.value === filters.ruleset)?.label ?? filters.ruleset}
                  onClear={() => setFilters({ ruleset: undefined })}
                />
              )}
              {filters.positionId &&
                positions.data?.find((p: any) => p.id === filters.positionId) && (
                  <Chip
                    label={positions.data.find((p: any) => p.id === filters.positionId).name}
                    onClear={() => setFilters({ positionId: undefined })}
                  />
                )}
              {filters.instructorId &&
                instructors.data?.find((i: any) => i.id === filters.instructorId) && (
                  <Chip
                    label={instructors.data.find((i: any) => i.id === filters.instructorId).name}
                    onClear={() => setFilters({ instructorId: undefined })}
                  />
                )}
              {filters.tagId && tags.data?.find((t: any) => t.id === filters.tagId) && (
                <Chip
                  label={tags.data.find((t: any) => t.id === filters.tagId).name}
                  onClear={() => setFilters({ tagId: undefined })}
                />
              )}
              {filters.watched && (
                <Chip label="Watched" onClear={() => setFilters({ watched: undefined })} />
              )}
            </div>
          )}

          {list.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <InstructionalCardSkeleton key={i} />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyLibrary />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((item: any) => <InstructionalCard key={item.id} item={item} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium">
      {label}
      <button onClick={onClear} className="hover:opacity-70">
        <Eraser className="size-3" />
      </button>
    </span>
  );
}
