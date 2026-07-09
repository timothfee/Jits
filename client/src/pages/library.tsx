import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/queryClient";
import {
  InstructionalCard,
  InstructionalCardSkeleton,
  EmptyLibrary,
} from "@/components/instructional-card";
import { TechniqueBadge } from "@/components/technique-badge";
import { Button } from "@/components/ui/button";
import {
  Filter,
  LayoutGrid,
  ArrowDownWideNarrow,
  Eraser,
  CircleDot,
  Search,
} from "lucide-react";
import { useState } from "react";

type Filters = {
  q?: string;
  instructorId?: number;
  techniqueCategoryId?: number;
  positionId?: number;
  tagId?: number;
  watched?: boolean;
  sort?: string;
};

function useFilters(): [Filters, (patch: Partial<Filters>) => void, () => void] {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(
    location.includes("?") ? location.split("?")[1] : ""
  );
  const filters: Filters = {
    q: params.get("q") || undefined,
    instructorId: params.get("instructorId")
      ? Number(params.get("instructorId"))
      : undefined,
    techniqueCategoryId: params.get("techniqueCategoryId")
      ? Number(params.get("techniqueCategoryId"))
      : undefined,
    positionId: params.get("positionId")
      ? Number(params.get("positionId"))
      : undefined,
    tagId: params.get("tagId") ? Number(params.get("tagId")) : undefined,
    watched: params.get("watched") === "true" ? true : undefined,
    sort: params.get("sort") || undefined,
  };
  const setFilters = (patch: Partial<Filters>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    const base = location.split("?")[0];
    setLocation(base + (p.toString() ? `?${p.toString()}` : ""));
  };
  const clear = () => setLocation(location.split("?")[0]);
  return [filters, setFilters, clear];
}

const SORTS = [
  { value: "recent", label: "Recently added" },
  { value: "title", label: "Title A–Z" },
  { value: "rating", label: "Highest rated" },
  { value: "progress", label: "In progress" },
];

export default function Library() {
  const [filters, setFilters, clearFilters] = useFilters();
  const [panelOpen, setPanelOpen] = useState(false);

  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.instructorId) params.set("instructorId", String(filters.instructorId));
  if (filters.techniqueCategoryId)
    params.set("techniqueCategoryId", String(filters.techniqueCategoryId));
  if (filters.positionId) params.set("positionId", String(filters.positionId));
  if (filters.tagId) params.set("tagId", String(filters.tagId));
  if (filters.watched) params.set("watched", "true");
  if (filters.sort) params.set("sort", filters.sort);

  const list = useQuery({
    queryKey: ["/api/instructionals", params.toString()],
    queryFn: async ({ queryKey }) => {
      const [base, qs] = queryKey;
      const url = qs ? `${apiUrl(base)}?${qs}` : apiUrl(base);
      const res = await fetch(url);
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const categories = useQuery({
    queryKey: ["/api/categories"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });
  const positions = useQuery({
    queryKey: ["/api/positions"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });
  const instructors = useQuery({
    queryKey: ["/api/instructors"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
  });
  const tags = useQuery({
    queryKey: ["/api/tags"],
    queryFn: async ({ queryKey }) => (await fetch(apiUrl(queryKey.join("/")))).json(),
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

  const activeFilterCount =
    (filters.instructorId ? 1 : 0) +
    (filters.techniqueCategoryId ? 1 : 0) +
    (filters.positionId ? 1 : 0) +
    (filters.tagId ? 1 : 0) +
    (filters.watched ? 1 : 0);

  const items: any[] = list.data || [];

  const FilterPanel = (
    <div className="space-y-6">
      {/* Categories */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">
          Technique
        </h4>
        <div className="space-y-1">
          {categories.data?.map((c: any) => (
            <button
              key={c.id}
              onClick={() =>
                setFilters({
                  techniqueCategoryId:
                    filters.techniqueCategoryId === c.id ? undefined : c.id,
                })
              }
              className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                filters.techniqueCategoryId === c.id
                  ? "bg-sidebar-accent"
                  : "hover:bg-sidebar-accent/60"
              }`}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="flex-1 truncate">{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Positions */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">
          Position
        </h4>
        <div className="space-y-3">
          {positionsByGroup.map(([group, ps]) => (
            <div key={group}>
              <div className="text-[10px] text-muted-foreground font-mono mb-1 px-2 uppercase tracking-wider">
                {group}
              </div>
              <div className="space-y-0.5">
                {ps.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      setFilters({
                        positionId:
                          filters.positionId === p.id ? undefined : p.id,
                      })
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
      </div>

      {/* Instructors */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">
          Instructor
        </h4>
        <div className="space-y-0.5">
          {instructors.data?.map((i: any) => (
            <button
              key={i.id}
              onClick={() =>
                setFilters({
                  instructorId:
                    filters.instructorId === i.id ? undefined : i.id,
                })
              }
              className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                filters.instructorId === i.id
                  ? "bg-sidebar-accent"
                  : "hover:bg-sidebar-accent/60"
              }`}
            >
              <span className="flex-1 truncate">{i.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {i.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      {tags.data?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">
            Tags
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {tags.data.map((t: any) => (
              <button
                key={t.id}
                onClick={() =>
                  setFilters({
                    tagId: filters.tagId === t.id ? undefined : t.id,
                  })
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
        </div>
      )}

      {/* Status */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 font-mono">
          Status
        </h4>
        <button
          onClick={() =>
            setFilters({ watched: filters.watched ? undefined : true })
          }
          className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
            filters.watched ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
          }`}
        >
          <CircleDot className="size-3.5" />
          Watched only
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Filter rail (desktop) */}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-7 px-2 text-xs"
            >
              <Eraser className="size-3" />
              Clear
            </Button>
          )}
        </div>
        {FilterPanel}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4 md:p-6">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h1 className="font-display font-bold text-xl">Library</h1>
              <p className="text-sm text-muted-foreground">
                {list.isLoading
                  ? "Loading…"
                  : `${items.length} instructional${items.length === 1 ? "" : "s"}`}
                {filters.q && ` for “${filters.q}”`}
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
              {/* Search input (desktop) */}
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
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPanelOpen(false)}
                >
                  <Eraser className="size-3" />
                  Close
                </Button>
              </div>
              {/* Search input (mobile) */}
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
                <Chip label={`“${filters.q}”`} onClear={() => setFilters({ q: undefined })} />
              )}
              {filters.techniqueCategoryId &&
                categories.data
                  ?.find((c: any) => c.id === filters.techniqueCategoryId)
                  ? (
                    <Chip
                      label={
                        categories.data.find(
                          (c: any) => c.id === filters.techniqueCategoryId
                        ).name
                      }
                      onClear={() => setFilters({ techniqueCategoryId: undefined })}
                    />
                  ) : null}
              {filters.positionId &&
                positions.data?.find((p: any) => p.id === filters.positionId) && (
                  <Chip
                    label={
                      positions.data.find(
                        (p: any) => p.id === filters.positionId
                      ).name
                    }
                    onClear={() => setFilters({ positionId: undefined })}
                  />
                )}
              {filters.instructorId &&
                instructors.data?.find((i: any) => i.id === filters.instructorId) && (
                  <Chip
                    label={
                      instructors.data.find(
                        (i: any) => i.id === filters.instructorId
                      ).name
                    }
                    onClear={() => setFilters({ instructorId: undefined })}
                  />
                )}
              {filters.tagId &&
                tags.data?.find((t: any) => t.id === filters.tagId) && (
                  <Chip
                    label={
                      tags.data.find((t: any) => t.id === filters.tagId).name
                    }
                    onClear={() => setFilters({ tagId: undefined })}
                  />
                )}
              {filters.watched && (
                <Chip label="Watched" onClear={() => setFilters({ watched: undefined })} />
              )}
            </div>
          )}

          {/* Grid */}
          {list.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <InstructionalCardSkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyLibrary />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((item: any) => (
                <InstructionalCard key={item.id} item={item} />
              ))}
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
