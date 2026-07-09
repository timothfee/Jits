import { Link } from "wouter";
import { Play, CheckCircle2, AlertTriangle } from "lucide-react";
import type { InstructionalWithRelations } from "@shared/schema";
import { TechniqueBadge } from "./technique-badge";
import { formatDuration, formatBytes, formatRelative, hexToRgba } from "@/lib/format";

export function InstructionalCard({
  item,
}: {
  item: InstructionalWithRelations;
}) {
  const progressPct =
    item.duration && item.duration > 0
      ? Math.min(100, Math.round((item.progress / item.duration) * 100))
      : 0;

  return (
    <Link
      href={`/instructionals/${item.id}`}
      className="group block rounded-lg overflow-hidden border border-card-border bg-card hover-elevate transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={`card-instructional-${item.id}`}
    >
      {/* Thumbnail / poster area */}
      <div
        className="relative aspect-video overflow-hidden"
        style={
          item.techniqueCategory
            ? {
                background: `radial-gradient(120% 120% at 30% 20%, ${hexToRgba(
                  item.techniqueCategory.color,
                  0.22
                )}, transparent 60%), linear-gradient(160deg, hsl(var(--card)), hsl(var(--sidebar-accent)))`,
              }
            : { background: "linear-gradient(160deg, hsl(var(--card)), hsl(var(--sidebar-accent)))" }
        }
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Play
            className="size-9 text-foreground/15 group-hover:text-primary group-hover:scale-110 transition-all duration-200"
            fill="currentColor"
          />
        </div>
        {!item.available && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-amber-500/90 text-amber-950 px-2 py-0.5 text-[10px] font-medium">
            <AlertTriangle className="size-3" />
            Missing
          </div>
        )}
        {item.watched && (
          <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-emerald-500/90 text-emerald-950 px-2 py-0.5 text-[10px] font-medium">
            <CheckCircle2 className="size-3" />
            Watched
          </div>
        )}
        <div className="absolute bottom-2 right-2 rounded bg-black/70 text-white px-1.5 py-0.5 text-[10px] font-mono">
          {formatDuration(item.duration)}
        </div>
        {/* category color accent bar */}
        {item.techniqueCategory && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ backgroundColor: item.techniqueCategory.color }}
          />
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </h3>
        </div>
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {item.instructor ? (
            <div className="truncate font-medium text-foreground/80">
              {item.instructor.name}
            </div>
          ) : (
            <div className="italic">No instructor</div>
          )}
          <div className="truncate">{item.position?.name || "Unspecified position"}</div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <TechniqueBadge category={item.techniqueCategory} size="sm" />
          <span className="text-[10px] text-muted-foreground/70 font-mono">
            {formatBytes(item.fileSize)}
          </span>
        </div>
        {progressPct > 0 && (
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>
    </Link>
  );
}

export function InstructionalCardSkeleton() {
  return (
    <div className="rounded-lg overflow-hidden border border-card-border bg-card">
      <div className="aspect-video bg-muted animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-muted rounded animate-pulse" />
        <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
      </div>
    </div>
  );
}

export function EmptyLibrary({ onScan }: { onScan?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Play className="size-7 text-muted-foreground" />
      </div>
      <h3 className="font-display font-semibold text-lg">Your library is empty</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Point the app at your instructional folder and scan it, or add an entry
        manually to get started.
      </p>
      {onScan && (
        <button
          onClick={onScan}
          className="mt-4 text-sm text-primary hover:underline font-medium"
        >
          Scan your media folder →
        </button>
      )}
    </div>
  );
}
