"use client";

import { useEffect, useState } from "react";

/**
 * Renders an instant in the viewer's browser timezone. Mount-gated so the
 * server (which has no idea of the viewer's zone) never produces a mismatched
 * hydration string.
 */
export function LocalTime({
  iso,
  mode = "datetime",
  className,
}: {
  iso: string;
  mode?: "datetime" | "date" | "time" | "weekday";
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(formatLocal(iso, mode));
  }, [iso, mode]);
  return (
    <span className={className} suppressHydrationWarning>
      {text ?? "…"}
    </span>
  );
}

export function formatLocal(iso: string, mode: "datetime" | "date" | "time" | "weekday" = "datetime") {
  const d = new Date(iso);
  switch (mode) {
    case "date":
      return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    case "weekday":
      return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    case "time":
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    default:
      return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
}

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
