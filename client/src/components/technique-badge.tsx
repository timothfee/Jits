import { hexToRgba, contrastColor } from "@/lib/format";
import type { TechniqueCategory } from "@shared/schema";

export function TechniqueBadge({
  category,
  size = "md",
}: {
  category: TechniqueCategory | null | undefined;
  size?: "sm" | "md";
}) {
  if (!category) return null;
  const color = category.color || "#64748b";
  const text = contrastColor(color);
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${pad}`}
      style={{ backgroundColor: hexToRgba(color, 0.16), color: color }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span style={{ color: text === "#ffffff" ? color : color }}>{category.name}</span>
    </span>
  );
}

export function BeltDot({ belt }: { belt?: string | null }) {
  const colors: Record<string, string> = {
    white: "#e5e5e5",
    blue: "#3b82f6",
    purple: "#a855f7",
    brown: "#92400e",
    black: "#1f2937",
    coral: "#fb7185",
    red: "#dc2626",
  };
  const c = colors[belt || ""] || "#64748b";
  return (
    <span
      className="inline-block size-2 rounded-full ring-1 ring-border"
      style={{ backgroundColor: c }}
      title={`${belt || "unknown"} belt`}
    />
  );
}
