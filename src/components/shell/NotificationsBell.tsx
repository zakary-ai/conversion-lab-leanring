"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { timeAgo } from "@/lib/format";
import { useTimeZone } from "@/components/time/TimeZoneContext";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

const TYPE_ICONS: Record<string, string> = {
  STAR_EARNED: "⭐",
  CONTENT_UNLOCKED: "🔓",
  QUIZ_RESULT: "📝",
  MODULE_AVAILABLE: "📚",
  CALL_UPCOMING: "📅",
  CALL_STARTING: "🔴",
  NEW_DM: "💬",
  MENTION: "@",
  REPLY: "↩",
  BOOKING_CONFIRMED: "📆",
  BOOKING_CANCELLED: "🚫",
  SYSTEM: "ℹ️",
};

export function NotificationsBell({ initialCount }: { initialCount: number }) {
  const tz = useTimeZone();
  const [count, setCount] = useState(initialCount);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Light polling keeps the badge live without page refreshes
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/notifications/unread-count");
        if (res.ok) {
          const data = (await res.json()) as { count: number };
          setCount(data.count);
        }
      } catch {}
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const data = (await res.json()) as { notifications: Notification[] };
      setItems(data.notifications);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markAllRead() {
    await fetch("/api/notifications/mark-read", { method: "POST" });
    setCount(0);
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: new Date().toISOString() })) ?? null);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
        className="btn btn-ghost p-2 relative"
      >
        <Icons.bell />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 rounded-full bg-accent text-[#1c1303] text-[10px] font-bold min-w-4 h-4 px-1 flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[90vw] card-raised shadow-2xl shadow-black/50 z-50 animate-pop overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <p className="font-semibold text-sm">Notifications</p>
            {count > 0 && (
              <button onClick={() => void markAllRead()} className="text-xs text-accent-hi hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              <div className="p-4 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-12" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-ink-mid text-center py-10 px-4">
                You&apos;re all caught up. Notifications about stars, unlocks, calls, 1-on-1s and messages
                will appear here.
              </p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.linkUrl ?? "#"}
                  onClick={() => setOpen(false)}
                  className={`flex gap-3 px-4 py-3 border-b border-edge last:border-0 hover:bg-overlay transition-colors ${
                    n.readAt ? "opacity-60" : ""
                  }`}
                >
                  <span className="text-lg leading-none mt-0.5">{TYPE_ICONS[n.type] ?? "•"}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug">{n.title}</span>
                    {n.body && (
                      <span className="block text-xs text-ink-mid truncate mt-0.5">{n.body}</span>
                    )}
                    <span className="block text-[11px] text-ink-dim mt-1">{timeAgo(n.createdAt, tz)}</span>
                  </span>
                  {!n.readAt && <span className="ml-auto mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0" />}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
