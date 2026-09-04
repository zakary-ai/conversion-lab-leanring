"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icons } from "@/components/ui/icons";
import type { BookingRow } from "@/lib/booking-service";
import { LocalTime } from "./LocalTime";

export function BookingList({
  title,
  bookings,
  viewer,
  providerConfigured,
  emptyMessage = "Nothing here yet.",
  currentUserId,
}: {
  title: string;
  bookings: BookingRow[];
  /** learner = "I booked this", host = "someone booked me", admin = oversight */
  viewer: "learner" | "host" | "admin";
  providerConfigured: boolean;
  emptyMessage?: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancel(id: string) {
    const reason = window.prompt("Cancel this 1-on-1? Add an optional reason for the other person:");
    if (reason === null) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/one-on-ones/bookings/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not cancel this booking");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-6">
      <p className="section-title mb-4">{title}</p>
      {error && (
        <p className="text-sm text-bad bg-bad/10 border border-bad/25 rounded-lg px-3 py-2 mb-3 animate-fade">
          {error}
        </p>
      )}
      {bookings.length === 0 ? (
        <p className="text-sm text-ink-mid">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-edge">
          {bookings.map((b) => {
            const counterpart = viewer === "learner" ? b.host : viewer === "host" ? b.learner : null;
            const isPast = new Date(b.endsAt).getTime() < Date.now();
            const cancelled = b.status === "CANCELLED";
            const link = viewer === "learner" ? b.joinUrl : (b.startUrl ?? b.joinUrl);
            const linkLabel = viewer === "learner" ? "Join Zoom" : b.startUrl ? "Start Zoom" : "Join Zoom";
            return (
              <li key={b.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar name={counterpart?.name ?? b.learner.name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {viewer === "admin"
                          ? `${b.learner.name} with ${b.host.name}`
                          : viewer === "learner"
                            ? `With ${b.host.name}`
                            : b.learner.name}
                      </p>
                      <p className="text-xs text-ink-dim mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="flex items-center gap-1">
                          <Icons.calendar className="h-3 w-3" />
                          <LocalTime iso={b.startsAt} />
                        </span>
                        <span className="flex items-center gap-1">
                          <Icons.clock className="h-3 w-3" />
                          {b.durationMin} min
                        </span>
                        {cancelled ? (
                          <span className="chip chip-bad">Cancelled</span>
                        ) : isPast ? (
                          <span className="chip">Completed</span>
                        ) : (
                          <span className="chip chip-good">Confirmed</span>
                        )}
                      </p>
                      {b.note && <p className="text-xs text-ink-mid mt-1 line-clamp-2">“{b.note}”</p>}
                      {cancelled && b.cancelReason && (
                        <p className="text-xs text-ink-dim mt-1">Reason: {b.cancelReason}</p>
                      )}
                    </div>
                  </div>
                  {!cancelled && !isPast && (
                    <div className="flex items-center gap-2 shrink-0">
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                          {linkLabel}
                          <Icons.external className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-xs text-ink-dim max-w-[180px]">
                          {providerConfigured ? "Video link unavailable — staff will follow up" : "Video link not connected"}
                        </span>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy === b.id}
                        onClick={() => void cancel(b.id)}
                        title={
                          viewer === "admin" && b.host.id !== currentUserId && b.learner.id !== currentUserId
                            ? "Cancel on behalf of both people"
                            : undefined
                        }
                      >
                        {busy === b.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
