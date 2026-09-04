"use client";

import { useEffect, useState } from "react";
import { detectTimeZone } from "@/lib/timezone";
import { useTimeZone } from "@/components/time/TimeZoneContext";

type Mode = "datetime" | "date" | "time" | "weekday";

/**
 * Renders an instant in the viewer's zone — the account zone when set,
 * otherwise the browser's. Mount-gated so the server never produces a string
 * that could mismatch the client's locale on hydration.
 */
export function LocalTime({ iso, mode = "datetime", className }: { iso: string; mode?: Mode; className?: string }) {
  const timeZone = useTimeZone();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(formatLocal(iso, mode, timeZone));
  }, [iso, mode, timeZone]);
  return (
    <span className={className} suppressHydrationWarning>
      {text ?? "…"}
    </span>
  );
}

export function formatLocal(iso: string, mode: Mode = "datetime", timeZone?: string) {
  const d = new Date(iso);
  const zone = timeZone ? { timeZone } : {};
  const date = () => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", ...zone });
  const time = () => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", ...zone });
  switch (mode) {
    case "date":
      return date();
    case "weekday":
      return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", ...zone });
    case "time":
      return time();
    default:
      return `${date()} · ${time()}`;
  }
}

/** @deprecated use detectTimeZone from lib/timezone (kept for existing imports). */
export function browserTimeZone() {
  return detectTimeZone();
}
