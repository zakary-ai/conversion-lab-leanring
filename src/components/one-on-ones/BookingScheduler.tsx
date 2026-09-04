"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icons } from "@/components/ui/icons";
import { BOOKING_HORIZON_DAYS } from "@/lib/booking";
import type { BookableHost, BookingRow } from "@/lib/booking-service";
import { browserTimeZone, formatLocal } from "./LocalTime";

type ApiSlot = { startsAt: string; endsAt: string };
type Done = { booking: BookingRow; video: { configured: boolean; message?: string } };

const DAY = 24 * 60 * 60 * 1000;
const WEEKS = Math.ceil(BOOKING_HORIZON_DAYS / 7);

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Calendly-style picker: choose a host, page through weeks, click a slot,
 * confirm. All times render in the browser's timezone; the host's zone is
 * shown alongside on the confirm step.
 */
export function BookingScheduler({ hosts }: { hosts: BookableHost[] }) {
  const router = useRouter();
  const [hostId, setHostId] = useState(hosts[0]?.id ?? "");
  const [week, setWeek] = useState(0);
  const [slots, setSlots] = useState<ApiSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ApiSlot | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [tz, setTz] = useState("UTC");

  useEffect(() => setTz(browserTimeZone()), []);

  const host = hosts.find((h) => h.id === hostId) ?? null;
  const weekStart = useMemo(() => new Date(startOfLocalDay(new Date()).getTime() + week * 7 * DAY), [week]);
  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * DAY), [weekStart]);

  const load = useCallback(async () => {
    if (!hostId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: weekStart.toISOString(), to: weekEnd.toISOString() });
      const res = await fetch(`/api/one-on-ones/hosts/${hostId}/slots?${qs}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not load availability");
        setSlots([]);
        return;
      }
      const data = (await res.json()) as { slots: ApiSlot[] };
      setSlots(data.slots);
    } catch {
      setError("Could not reach the server.");
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [hostId, weekStart, weekEnd]);

  useEffect(() => {
    setSelected(null);
    void load();
  }, [load]);

  const days = useMemo(() => {
    const groups: { key: string; date: Date; slots: ApiSlot[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart.getTime() + i * DAY);
      groups.push({ key: date.toDateString(), date, slots: [] });
    }
    for (const s of slots ?? []) {
      const key = new Date(s.startsAt).toDateString();
      groups.find((g) => g.key === key)?.slots.push(s);
    }
    return groups;
  }, [slots, weekStart]);

  async function book() {
    if (!selected || !host) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/one-on-ones/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId: host.id, startsAt: selected.startsAt, note: note.trim() || undefined, learnerTz: tz }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Done> & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not book that slot");
        if (res.status === 409) {
          setSelected(null);
          void load();
        }
        return;
      }
      setDone(data as Done);
      setNote("");
      setSelected(null);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (hosts.length === 0) {
    return (
      <section className="card p-8 text-center">
        <p className="font-semibold">No coaches are taking bookings right now</p>
        <p className="text-sm text-ink-mid mt-1">Check back soon — staff open their calendars from their account.</p>
      </section>
    );
  }

  if (done) {
    const b = done.booking;
    return (
      <section className="card p-6 animate-pop border-good/30">
        <p className="chip chip-good mb-3">
          <Icons.check className="h-3 w-3" />
          Booked
        </p>
        <p className="font-bold text-lg">1-on-1 with {b.host.name}</p>
        <p className="text-sm text-ink-mid mt-1">
          {formatLocal(b.startsAt, "weekday")} at {formatLocal(b.startsAt, "time")} ({tz}) · {b.durationMin} min
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {b.joinUrl ? (
            <a href={b.joinUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
              Open Zoom link
              <Icons.external className="h-3.5 w-3.5" />
            </a>
          ) : (
            <p className="text-sm text-ink-mid bg-overlay border border-edge rounded-lg px-3 py-2">
              {done.video.message ?? "Your video link will appear here once it's ready."}
            </p>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setDone(null)}>
            Book another
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card p-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Host picker */}
        <div className="lg:w-64 shrink-0">
          <p className="section-title mb-3">Choose a coach</p>
          <ul className="space-y-2">
            {hosts.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => {
                    setHostId(h.id);
                    setWeek(0);
                  }}
                  className={`w-full text-left card-raised card-hover px-3 py-2.5 flex items-center gap-3 ${
                    h.id === hostId ? "border-accent/50 ring-1 ring-accent/30" : ""
                  }`}
                >
                  <Avatar name={h.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{h.name}</span>
                    <span className="block text-xs text-ink-dim truncate">
                      {h.headline ?? h.role.replace("_", " ").toLowerCase()} · {h.slotMinutes} min
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Week grid */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3 gap-2">
            <p className="section-title">
              Pick a time <span className="normal-case tracking-normal text-ink-dim">({tz})</span>
            </p>
            <div className="flex items-center gap-1">
              <button className="btn btn-ghost btn-sm" disabled={week === 0} onClick={() => setWeek((w) => w - 1)} aria-label="Previous week">
                ‹
              </button>
              <span className="text-xs text-ink-mid min-w-[140px] text-center">
                {formatLocal(weekStart.toISOString(), "date")} – {formatLocal(new Date(weekEnd.getTime() - 1).toISOString(), "date")}
              </span>
              <button className="btn btn-ghost btn-sm" disabled={week >= WEEKS - 1} onClick={() => setWeek((w) => w + 1)} aria-label="Next week">
                ›
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-bad bg-bad/10 border border-bad/25 rounded-lg px-3 py-2 mb-3 animate-fade">{error}</p>
          )}

          <div className="overflow-x-auto -mx-1 px-1">
            <div className="grid grid-cols-7 gap-2 min-w-[560px]">
              {days.map((d) => (
                <div key={d.key} className="min-w-0">
                  <p className="text-[11px] text-ink-dim font-semibold text-center mb-2 uppercase tracking-wide">
                    {d.date.toLocaleDateString(undefined, { weekday: "short" })}
                    <span className="block text-ink text-sm normal-case tracking-normal">{d.date.getDate()}</span>
                  </p>
                  <div className="space-y-1.5">
                    {loading && slots === null ? (
                      <div className="skeleton h-8 rounded-lg" />
                    ) : d.slots.length === 0 ? (
                      <p className="text-center text-xs text-ink-dim py-2">—</p>
                    ) : (
                      d.slots.map((s) => (
                        <button
                          key={s.startsAt}
                          onClick={() => setSelected(s)}
                          className={`w-full rounded-lg border px-1 py-1.5 text-xs font-semibold transition-colors ${
                            selected?.startsAt === s.startsAt
                              ? "bg-accent text-black border-accent"
                              : "bg-overlay border-edge hover:border-accent/50 hover:text-accent-hi"
                          }`}
                        >
                          {formatLocal(s.startsAt, "time")}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {!loading && slots !== null && slots.length === 0 && !error && (
            <p className="text-sm text-ink-mid mt-4 text-center">No open times this week. Try the next one.</p>
          )}

          {/* Confirm */}
          {selected && host && (
            <div className="card-raised p-4 mt-5 animate-fade">
              <p className="font-semibold">
                {formatLocal(selected.startsAt, "weekday")} · {formatLocal(selected.startsAt, "time")} – {formatLocal(selected.endsAt, "time")}
              </p>
              <p className="text-xs text-ink-dim mt-0.5">
                Your time ({tz}). {host.name}&apos;s time ({host.timezone}):{" "}
                {new Date(selected.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: host.timezone })}
              </p>
              <label className="label mt-4" htmlFor="booking-note">
                What would you like to work on? (optional)
              </label>
              <textarea
                id="booking-note"
                className="input min-h-[72px]"
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Objection handling on price, or reviewing a recent call"
              />
              <div className="flex items-center gap-2 mt-3">
                <button className="btn btn-primary" disabled={busy} onClick={() => void book()}>
                  {busy ? "Booking…" : `Confirm ${host.slotMinutes}-min session`}
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => setSelected(null)}>
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
