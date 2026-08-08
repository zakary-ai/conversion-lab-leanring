import { useId } from "react";

export function StarIcon({
  className = "",
  filled = true,
}: {
  className?: string;
  filled?: boolean;
}) {
  // Unique gradient id per instance — a shared id breaks when the first
  // defining SVG sits inside a display:none subtree (e.g. the hidden
  // desktop sidebar on mobile), which makes every star render unfilled.
  const gradientId = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {filled && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd166" />
            <stop offset="100%" stopColor="#f6a50a" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.6l2.72 5.9 6.45.72-4.79 4.38 1.3 6.35L12 16.77l-5.68 3.18 1.3-6.35L2.83 9.22l6.45-.72L12 2.6z"
        fill={filled ? `url(#${gradientId})` : "none"}
        stroke={filled ? "rgba(185,125,10,0.6)" : "rgba(255,255,255,0.22)"}
        strokeWidth={filled ? 0.5 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Row of stars: filled up to `earned`, outlined up to `total`. */
export function StarRow({
  earned,
  total,
  size = "md",
}: {
  earned: number;
  total?: number;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const count = Math.max(total ?? Math.max(earned, 5), earned);
  const sizes = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-7 w-7", xl: "h-10 w-10" };
  const shown = Math.min(count, 10);
  return (
    <div className="flex items-center gap-1" aria-label={`${earned} stars earned`}>
      {Array.from({ length: shown }).map((_, i) => (
        <StarIcon key={i} className={sizes[size]} filled={i < earned} />
      ))}
      {count > 10 && <span className="text-xs text-ink-dim ml-1">+{count - 10}</span>}
    </div>
  );
}

export function StarCount({ count, className = "" }: { count: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-accent/10 border border-accent/25 px-2.5 py-0.5 text-sm font-semibold text-accent-hi ${className}`}
    >
      <StarIcon className="h-4 w-4" filled />
      {count}
    </span>
  );
}
