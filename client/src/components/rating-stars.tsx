import { Star } from "lucide-react";

export function RatingStars({
  value = 0,
  onChange,
  size = 14,
}: {
  value?: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className={onChange ? "cursor-pointer" : "cursor-default"}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            style={{ width: size, height: size }}
            className={
              n <= value
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/70"
            }
          />
        </button>
      ))}
    </div>
  );
}
