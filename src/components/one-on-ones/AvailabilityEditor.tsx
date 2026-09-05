"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DAY_NAMES, SLOT_LENGTH_OPTIONS, hhmmToMinutes, minutesToHHMM, type WeeklyWindow } from "@/lib/booking";
import { TimeZonePicker } from "@/components/time/TimeZonePicker";
import { detectTimeZone, describeTimeZone } from "@/lib/timezone";

export type AvailabilityInitial = {
  timezone: string;
  slotMinutes: number;
  minNoticeMinutes: number;
  acceptingBookings: boolean;
  zoomUserId: string;
  windows: WeeklyWindow[];
};

type Range = { start: string; end: string };

const DEFAULT_WINDOWS: WeeklyWindow[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

function toRanges(windows: WeeklyWindow[]): Range[][] {
  const days: Range[][] = Array.from({ length: 7 }, () => []);
  for (const w of [...windows].sort((a, b) => a.startMinute - b.startMinute)) {
    days[w.dayOfWeek].push({ start: minutesToHHMM(w.startMinute), end: minutesToHHMM(w.endMinute) });
  }
  return days;
}

export function AvailabilityEditor({
  initial,
  accountTimeZone,
  providerConfigured,
  providerName,
  hasDefaultMeetingUser,
  ownZoomUserId,
}: {
  initial: AvailabilityInitial | null;
  /** The host's account zone — the default for new availability */
  accountTimeZone: string | null;
  /** Links can be created for this host: academy credentials or their own connection */
  providerConfigured: boolean;
  providerName: string;
  hasDefaultMeetingUser: boolean;
  /** Set when the host connected their own Zoom account on their profile */
  ownZoomUserId: string | null;
}) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(initial?.timezone ?? accountTimeZone ?? "");
  const [slotMinutes, setSlotMinutes] = useState(initial?.slotMinutes ?? 30);
  const [minNoticeMinutes, setMinNotice] = useState(initial?.minNoticeMinutes ?? 120);
  const [accepting, setAccepting] = useState(initial?.acceptingBookings ?? false);
  const [zoomUserId, setZoomUserId] = useState(initial?.zoomUserId ?? "");
  const [days, setDays] = useState<Range[][]>(() => toRanges(initial?.windows ?? DEFAULT_WINDOWS));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New host with no account zone yet: fall back to the device zone once mounted.
  useEffect(() => {
    if (!initial && !accountTimeZone) setTimezone(detectTimeZone());
  }, [initial, accountTimeZone]);

  const validation = useMemo(() => {
    const windows: WeeklyWindow[] = [];
    for (let d = 0; d < 7; d++) {
      const ranges = days[d]
        .map((r) => ({ s: hhmmToMinutes(r.start), e: hhmmToMinutes(r.end) }))
        .sort((a, b) => (a.s ?? 0) - (b.s ?? 0));
      for (let i = 0; i < ranges.length; i++) {
        const { s, e } = ranges[i];
        if (s === null || e === null) return { error: `${DAY_NAMES[d]}: enter times as HH:MM`, windows: [] };
        if (e <= s) return { error: `${DAY_NAMES[d]}: a window must end after it starts`, windows: [] };
        if (e - s < slotMinutes) return { error: `${DAY_NAMES[d]}: window is shorter than one ${slotMinutes}-min slot`, windows: [] };
        if (i > 0 && s < (ranges[i - 1].e ?? 0)) return { error: `${DAY_NAMES[d]}: windows overlap`, windows: [] };
        windows.push({ dayOfWeek: d, startMinute: s, endMinute: e });
      }
    }
    return { error: null, windows };
  }, [days, slotMinutes]);

  function updateRange(day: number, idx: number, patch: Partial<Range>) {
    setDays((prev) => prev.map((ranges, d) => (d === day ? ranges.map((r, i) => (i === idx ? { ...r, ...patch } : r)) : ranges)));
    setSaved(false);
  }
  function addRange(day: number) {
    setDays((prev) =>
      prev.map((ranges, d) => {
        if (d !== day) return ranges;
        const last = ranges[ranges.length - 1];
        const start = last ? Math.min(1380, (hhmmToMinutes(last.end) ?? 540) + 60) : 540;
        return [...ranges, { start: minutesToHHMM(start), end: minutesToHHMM(Math.min(1440, start + 120)) }];
      })
    );
    setSaved(false);
  }
  function removeRange(day: number, idx: number) {
    setDays((prev) => prev.map((ranges, d) => (d === day ? ranges.filter((_, i) => i !== idx) : ranges)));
    setSaved(false);
  }

  async function save() {
    if (validation.error) {
      setError(validation.error);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/one-on-ones/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone,
          slotMinutes,
          minNoticeMinutes,
          acceptingBookings: accepting,
          zoomUserId: zoomUserId.trim(),
          windows: validation.windows,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save availability");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const noWindows = validation.windows.length === 0 && !validation.error;

  return (
    <div className="space-y-6">
      {!providerConfigured && (
        <div className="card border-accent/25 p-4 text-sm">
          <p className="font-semibold text-accent-hi">{providerName} not connected</p>
          <p className="text-ink-mid mt-1">
            Bookings work now, but sessions won&apos;t get a {providerName} link.{" "}
            <Link href="/profile#zoom" className="underline hover:text-accent-hi">Connect your own {providerName} account</Link> on your
            profile to create links automatically, or ask an administrator to add academy-wide credentials.
          </p>
        </div>
      )}

      <section className="card p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-bold">Accepting bookings</p>
            <p className="text-xs text-ink-dim">
              {accepting ? "Learners can see you and book open slots." : "You're hidden from the booking page."}
              {noWindows && " Add at least one window to go live."}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={accepting}
            disabled={noWindows}
            onClick={() => {
              setAccepting((v) => !v);
              setSaved(false);
            }}
            className={`relative h-6 w-11 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
              accepting ? "bg-accent" : "bg-overlay border border-edge-strong"
            }`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${accepting ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </section>

      <section className="card p-6">
        <p className="font-bold">Session settings</p>
        <p className="text-xs text-ink-dim mb-5">Windows below are in your timezone. Existing bookings are kept when you change availability.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="tz">Time zone</label>
            <TimeZonePicker id="tz" value={timezone} onChange={(tz) => { setTimezone(tz); setSaved(false); }} showPreview={false} />
            <p className="text-xs text-ink-dim mt-1">
              {accountTimeZone && timezone && timezone !== accountTimeZone
                ? `Differs from your account zone (${describeTimeZone(accountTimeZone)}). Change that on your profile to move both.`
                : "Follows your account time zone. Changing it on your profile updates this too."}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="slot">Session length</label>
            <select id="slot" className="input" value={slotMinutes} onChange={(e) => { setSlotMinutes(Number(e.target.value)); setSaved(false); }}>
              {SLOT_LENGTH_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="notice">Minimum notice (hours)</label>
            <input
              id="notice"
              type="number"
              min={0}
              max={168}
              className="input"
              value={Math.round(minNoticeMinutes / 60)}
              onChange={(e) => { setMinNotice(Math.max(0, Math.min(168, Number(e.target.value) || 0)) * 60); setSaved(false); }}
            />
            <p className="text-xs text-ink-dim mt-1">Slots starting sooner than this are hidden.</p>
          </div>
          {ownZoomUserId ? (
            <div>
              <p className="label">{providerName} account</p>
              <p className="text-sm pt-2">Your own — meetings are created as {ownZoomUserId}.</p>
              <p className="text-xs text-ink-dim mt-1">
                <Link href="/profile#zoom" className="underline hover:text-accent-hi">Manage on your profile</Link>
              </p>
            </div>
          ) : (
          <div>
            <label className="label" htmlFor="zoomUser">{providerName} account (optional)</label>
            <input
              id="zoomUser"
              className="input"
              value={zoomUserId}
              onChange={(e) => { setZoomUserId(e.target.value); setSaved(false); }}
              placeholder={hasDefaultMeetingUser ? "Leave blank to use the academy account" : "you@company.com"}
            />
            <p className="text-xs text-ink-dim mt-1">
              {hasDefaultMeetingUser
                ? "Meetings are created under the academy account unless you enter your own licensed user."
                : providerConfigured
                  ? "No default account is set — enter the email of a licensed Zoom user to get links."
                  : "Used once academy-wide Zoom credentials are added. To use your own Zoom, connect it on your profile."}
            </p>
          </div>
          )}
        </div>
      </section>

      <section className="card p-6">
        <p className="font-bold">Weekly hours</p>
        <p className="text-xs text-ink-dim mb-5">Learners see these repeated every week, split into {slotMinutes}-minute slots.</p>
        <div className="space-y-3">
          {DAY_NAMES.map((name, d) => (
            <div key={name} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 border-t border-edge/60 pt-3 first:border-0 first:pt-0">
              <p className="w-28 shrink-0 text-sm font-semibold pt-2">{name}</p>
              <div className="flex-1 space-y-2">
                {days[d].length === 0 && <p className="text-xs text-ink-dim pt-2">Unavailable</p>}
                {days[d].map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="time" className="input w-32" value={r.start} onChange={(e) => updateRange(d, i, { start: e.target.value })} />
                    <span className="text-ink-dim text-sm">–</span>
                    <input type="time" className="input w-32" value={r.end} onChange={(e) => updateRange(d, i, { end: e.target.value })} />
                    <button className="btn btn-ghost btn-sm" onClick={() => removeRange(d, i)} aria-label={`Remove window on ${name}`}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary btn-sm shrink-0" onClick={() => addRange(d)}>
                + Add
              </button>
            </div>
          ))}
        </div>
      </section>

      {(error || validation.error) && (
        <p className="text-sm text-bad bg-bad/10 border border-bad/25 rounded-lg px-3 py-2 animate-fade">{error ?? validation.error}</p>
      )}
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy || Boolean(validation.error)} onClick={() => void save()}>
          {busy ? "Saving…" : "Save availability"}
        </button>
        {saved && <span className="text-sm text-good animate-fade">Saved ✓</span>}
      </div>
    </div>
  );
}
