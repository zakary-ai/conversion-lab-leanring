"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";
import { formatDate, formatTime } from "@/lib/format";
import { detectTimeZone, zoneCity } from "@/lib/timezone";
import { DAY_NAMES } from "@/lib/booking";
import {
  DEFAULT_SERIES_WEEKS,
  MAX_INTERVAL_WEEKS,
  MAX_SERIES_OCCURRENCES,
  addDaysYmd,
  describeRule,
  isYmd,
  seriesOccurrences,
  validateRule,
  weekdayOfYmd,
} from "@/lib/call-series";
import { useTimeZone } from "@/components/time/TimeZoneContext";

export type CallRow = {
  id: string;
  title: string;
  description: string;
  hostId: string | null;
  hostName: string | null;
  scheduledAt: string;
  durationMin: number;
  minStars: number;
  maxAttendees: number | null;
  recordingEnabled: boolean;
  status: string;
  attendeeCount: number;
  recordings: { id: string; title: string }[];
  seriesId: string | null;
  hostedOnZoom: boolean;
  /** Zoom host link — admins only */
  startUrl: string | null;
};

export type SeriesRow = {
  id: string;
  title: string;
  rule: string;
  status: string;
  hostName: string | null;
  totalCount: number;
  upcomingCount: number;
  nextAt: string | null;
  hostedOnZoom: boolean;
};

const STALE_MS = 3 * 60 * 60 * 1000;

export function CallManager({
  calls,
  series,
  staff,
  rtcConfigured,
  rtcName,
  zoomConfigured,
}: {
  calls: CallRow[];
  series: SeriesRow[];
  staff: { id: string; name: string }[];
  rtcConfigured: boolean;
  rtcName: string;
  zoomConfigured: boolean;
}) {
  const tz = useTimeZone();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [recordingFor, setRecordingFor] = useState<string | null>(null);

  async function api(path: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Something went wrong");
        return null;
      }
      router.refresh();
      return data;
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();
  const upcoming = calls
    .filter((c) => (c.status === "SCHEDULED" || c.status === "LIVE") && new Date(c.scheduledAt).getTime() >= now - STALE_MS)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const past = calls.filter((c) => !upcoming.includes(c)).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const activeSeries = series.filter((s) => s.status === "ACTIVE");

  return (
    <div className="animate-rise">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Calls</h1>
          <p className="text-ink-mid text-sm mt-1">Schedule one-off or repeating sessions and publish recordings.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icons.plus className="h-4 w-4" />
          Schedule call
        </button>
      </header>

      {!zoomConfigured && (
        <div className="card border-accent/25 p-4 mb-6 text-sm">
          <p className="font-semibold text-accent-hi">{rtcConfigured ? "Zoom not connected" : "Video provider not connected"}</p>
          <p className="text-ink-mid mt-1">
            {rtcConfigured
              ? `Calls run in embedded ${rtcName} rooms. To host them on Zoom instead, add `
              : "Scheduling, RSVPs and recordings work now. To host calls on Zoom, add "}
            <code className="text-xs bg-overlay rounded px-1.5 py-0.5">ZOOM_ACCOUNT_ID</code>,{" "}
            <code className="text-xs bg-overlay rounded px-1.5 py-0.5">ZOOM_CLIENT_ID</code>,{" "}
            <code className="text-xs bg-overlay rounded px-1.5 py-0.5">ZOOM_CLIENT_SECRET</code> and{" "}
            <code className="text-xs bg-overlay rounded px-1.5 py-0.5">ZOOM_USER_ID</code> to the environment
            {rtcConfigured ? "." : ` — or DAILY_API_KEY and DAILY_DOMAIN for embedded ${rtcName} rooms (see .env.example).`}
          </p>
        </div>
      )}

      {notice && (
        <div className="card border-accent/25 p-4 mb-6 text-sm animate-fade flex items-start justify-between gap-3">
          <p className="text-ink-mid">{notice}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)} aria-label="Dismiss">
            <Icons.x className="h-4 w-4" />
          </button>
        </div>
      )}

      {creating && (
        <CallForm
          staff={staff}
          busy={busy}
          zoomConfigured={zoomConfigured}
          timeZone={tz}
          onSubmit={async (fields) => {
            const data = await api("/api/admin/calls", "POST", fields);
            if (!data) return;
            setCreating(false);
            const video = data.video as { hosted: boolean; message?: string } | undefined;
            const created = Array.isArray(data.calls) ? (data.calls as unknown[]).length : 1;
            setNotice(
              `${created === 1 ? "Call scheduled" : `${created} sessions scheduled`}${video?.hosted ? " and hosted on Zoom." : "."}${
                video?.message ? ` ${video.message}` : ""
              }`
            );
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {activeSeries.length > 0 && (
        <section className="mb-8">
          <p className="section-title mb-3">Repeating calls</p>
          <div className="grid gap-3 md:grid-cols-2">
            {activeSeries.map((s) => (
              <div key={s.id} className="card p-5">
                <p className="font-bold flex items-center gap-2 flex-wrap">
                  {s.title}
                  <span className="chip chip-info">Repeats</span>
                  {s.hostedOnZoom && <span className="chip">Zoom</span>}
                </p>
                <p className="text-xs text-ink-mid mt-1">{s.rule}</p>
                <p className="text-xs text-ink-dim mt-1">
                  {s.upcomingCount} of {s.totalCount} sessions left
                  {s.nextAt && ` · next ${formatDate(s.nextAt, tz)} at ${formatTime(s.nextAt, tz)}`}
                  {s.hostName && ` · ${s.hostName}`}
                </p>
                <div className="flex items-center gap-1.5 mt-3">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => {
                      const title = prompt("Rename this series (applies to every upcoming session):", s.title);
                      if (title && title.trim() && title.trim() !== s.title) {
                        void api(`/api/admin/call-series/${s.id}`, "PATCH", { title: title.trim() });
                      }
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="btn btn-ghost btn-sm hover:text-bad"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Cancel "${s.title}"? ${s.upcomingCount} upcoming sessions will be cancelled. Past sessions and recordings are kept.`)) {
                        void api(`/api/admin/call-series/${s.id}`, "DELETE");
                      }
                    }}
                  >
                    Cancel series
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <CallList
        title="Upcoming"
        calls={upcoming}
        tz={tz}
        busy={busy}
        api={api}
        recordingFor={recordingFor}
        setRecordingFor={setRecordingFor}
        empty="No calls scheduled. Schedule your first live training session."
      />
      {past.length > 0 && (
        <div className="mt-8">
          <CallList title="Past & cancelled" calls={past} tz={tz} busy={busy} api={api} recordingFor={recordingFor} setRecordingFor={setRecordingFor} />
        </div>
      )}
    </div>
  );
}

function CallList({
  title,
  calls,
  tz,
  busy,
  api,
  recordingFor,
  setRecordingFor,
  empty,
}: {
  title: string;
  calls: CallRow[];
  tz: string | undefined;
  busy: boolean;
  api: (path: string, method: string, body?: unknown) => Promise<unknown>;
  recordingFor: string | null;
  setRecordingFor: (id: string | null) => void;
  empty?: string;
}) {
  return (
    <section>
      <p className="section-title mb-3">{title}</p>
      <div className="space-y-3">
        {calls.length === 0 && empty && (
          <div className="card p-10 text-center">
            <p className="font-semibold">No calls scheduled</p>
            <p className="text-sm text-ink-mid mt-1">{empty}</p>
          </div>
        )}
        {calls.map((call) => (
          <div key={call.id} className="card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold flex items-center gap-2 flex-wrap">
                  {call.title}
                  <span
                    className={`chip ${
                      call.status === "LIVE"
                        ? "chip-bad"
                        : call.status === "SCHEDULED"
                          ? "chip-info"
                          : call.status === "ENDED"
                            ? "chip-good"
                            : ""
                    }`}
                  >
                    {call.status}
                  </span>
                  {call.seriesId && <span className="chip">Repeats</span>}
                  {call.hostedOnZoom && <span className="chip">Zoom</span>}
                  {call.minStars > 0 && <span className="chip">⭐ {call.minStars}+</span>}
                  {call.recordingEnabled && <span className="chip">REC</span>}
                </p>
                <p className="text-xs text-ink-dim mt-1">
                  {formatDate(call.scheduledAt, tz)} · {formatTime(call.scheduledAt, tz)} · {call.durationMin}{" "}
                  min{call.hostName && ` · ${call.hostName}`} · {call.attendeeCount} attending
                  {call.recordings.length > 0 && ` · ${call.recordings.length} recording(s)`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {call.startUrl && (call.status === "SCHEDULED" || call.status === "LIVE") && (
                  <a href={call.startUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                    Open Zoom as host
                    <Icons.external className="h-3.5 w-3.5" />
                  </a>
                )}
                {call.status === "SCHEDULED" && (
                  <button className="btn btn-primary btn-sm" disabled={busy}
                    onClick={() => void api(`/api/admin/calls/${call.id}`, "PATCH", { status: "LIVE" })}>
                    Start (go live)
                  </button>
                )}
                {call.status === "LIVE" && (
                  <button className="btn btn-secondary btn-sm" disabled={busy}
                    onClick={() => void api(`/api/admin/calls/${call.id}`, "PATCH", { status: "ENDED" })}>
                    End call
                  </button>
                )}
                {call.status !== "CANCELLED" && call.status !== "ENDED" && (
                  <button className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => {
                      if (!call.seriesId || confirm("Cancel just this session? The rest of the series stays scheduled.")) {
                        void api(`/api/admin/calls/${call.id}`, "PATCH", { status: "CANCELLED" });
                      }
                    }}>
                    Cancel
                  </button>
                )}
                {call.status === "ENDED" && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setRecordingFor(call.id)}>
                    Add recording
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm hover:text-bad"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Delete call "${call.title}"?`)) {
                      void api(`/api/admin/calls/${call.id}`, "DELETE");
                    }
                  }}
                >
                  <Icons.trash className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {recordingFor === call.id && (
              <RecordingForm
                busy={busy}
                defaultMinStars={call.minStars}
                onSubmit={async (rec) => {
                  const ok = await api(`/api/admin/calls/${call.id}`, "PATCH", { recording: rec });
                  if (ok) setRecordingFor(null);
                }}
                onCancel={() => setRecordingFor(null)}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const INTERVAL_OPTIONS = Array.from({ length: MAX_INTERVAL_WEEKS }, (_, i) => i + 1);

function CallForm({
  staff,
  busy,
  zoomConfigured,
  timeZone,
  onSubmit,
  onCancel,
}: {
  staff: { id: string; name: string }[];
  busy: boolean;
  zoomConfigured: boolean;
  timeZone: string | undefined;
  onSubmit: (fields: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hostId, setHostId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [durationMin, setDurationMin] = useState(60);
  const [minStars, setMinStars] = useState(0);
  const [maxAttendees, setMaxAttendees] = useState("");
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [hostOnZoom, setHostOnZoom] = useState(zoomConfigured);
  const [repeats, setRepeats] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [endsOn, setEndsOn] = useState("");

  const tz = timeZone ?? "UTC";
  const validDate = isYmd(date);
  // Defaults follow the chosen start date until the admin overrides them.
  const effectiveDays = useMemo(
    () => (daysOfWeek.length > 0 ? daysOfWeek : validDate ? [weekdayOfYmd(date)] : []),
    [daysOfWeek, validDate, date]
  );
  const effectiveEnd = endsOn || (validDate ? addDaysYmd(date, DEFAULT_SERIES_WEEKS * 7 - 1) : "");
  const [h, m] = time.split(":").map(Number);
  const startMinute = Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;

  const rule = useMemo(
    () =>
      repeats && validDate && effectiveEnd
        ? { timezone: tz, daysOfWeek: effectiveDays, intervalWeeks, startMinute, startsOn: date, endsOn: effectiveEnd }
        : null,
    [repeats, validDate, effectiveEnd, tz, effectiveDays, intervalWeeks, startMinute, date]
  );
  const ruleProblem = rule ? validateRule(rule) : null;
  const occurrences = useMemo(() => (rule && !ruleProblem ? seriesOccurrences(rule) : []), [rule, ruleProblem]);

  function toggleDay(d: number) {
    setDaysOfWeek((prev) => {
      const base = prev.length > 0 ? prev : effectiveDays;
      return base.includes(d) ? base.filter((x) => x !== d) : [...base, d].sort((a, b) => a - b);
    });
  }

  const canSubmit = Boolean(title.trim()) && validDate && (!repeats || (rule !== null && !ruleProblem));

  function submit() {
    if (!canSubmit) return;
    void onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      hostId: hostId || null,
      date,
      time,
      timezone: timeZone ?? detectTimeZone(),
      durationMin,
      minStars,
      maxAttendees: maxAttendees ? Number(maxAttendees) : null,
      recordingEnabled,
      hostOnZoom: zoomConfigured && hostOnZoom,
      ...(rule ? { repeat: { daysOfWeek: rule.daysOfWeek, intervalWeeks: rule.intervalWeeks, endsOn: rule.endsOn } } : {}),
    });
  }

  return (
    <div className="card p-5 mb-6 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Call name</label>
        <input className="input" value={title} autoFocus placeholder="Live Objection Handling Roleplay"
          onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <textarea className="input min-h-16 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="label">Host</label>
        <select className="input" value={hostId} onChange={(e) => setHostId(e.target.value)}>
          <option value="">No host</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">{repeats ? "First date" : "Date"}</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="w-28">
          <label className="label">Start</label>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <p className="sm:col-span-2 text-xs text-ink-dim -mt-1">
        Times are in your account time zone ({zoneCity(tz)} · {tz}). Learners see them in theirs.
      </p>

      <div className="sm:col-span-2 card-raised p-4">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
          Repeat weekly
        </label>
        {repeats && (
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <p className="label">On</p>
              <div className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((name, d) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      effectiveDays.includes(d) ? "bg-accent text-black border-accent" : "bg-overlay border-edge hover:border-accent/50"
                    }`}
                  >
                    {name.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Every</label>
              <select className="input" value={intervalWeeks} onChange={(e) => setIntervalWeeks(Number(e.target.value))}>
                {INTERVAL_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n === 1 ? "week" : `${n} weeks`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Until</label>
              <input className="input" type="date" value={effectiveEnd} min={date || undefined} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
            <p className={`sm:col-span-3 text-xs ${ruleProblem ? "text-bad" : "text-ink-mid"}`}>
              {!validDate
                ? "Pick the first date to preview the schedule."
                : ruleProblem
                  ? ruleProblem
                  : rule && (
                      <>
                        {describeRule(rule)} · <span className="font-semibold text-ink">{occurrences.length} sessions</span>
                        {occurrences.length >= MAX_SERIES_OCCURRENCES && ` (capped at ${MAX_SERIES_OCCURRENCES})`}
                        {occurrences.length > 0 && ` · first ${formatDate(occurrences[0], tz)}`}
                      </>
                    )}
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">Duration (min)</label>
          <input className="input" type="number" min={5} value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value) || 60)} />
        </div>
        <div className="flex-1">
          <label className="label">Min ⭐</label>
          <input className="input" type="number" min={0} value={minStars}
            onChange={(e) => setMinStars(Math.max(0, Number(e.target.value) || 0))} />
        </div>
        <div className="flex-1">
          <label className="label">Max attendees</label>
          <input className="input" type="number" min={1} placeholder="∞" value={maxAttendees}
            onChange={(e) => setMaxAttendees(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-2 justify-end pb-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={recordingEnabled} onChange={(e) => setRecordingEnabled(e.target.checked)} />
          Enable recording
        </label>
        <label className={`flex items-center gap-2 text-sm ${zoomConfigured ? "" : "text-ink-dim"}`} title={zoomConfigured ? undefined : "Add Zoom credentials to host calls on Zoom"}>
          <input type="checkbox" checked={zoomConfigured && hostOnZoom} disabled={!zoomConfigured} onChange={(e) => setHostOnZoom(e.target.checked)} />
          Host on Zoom{repeats ? " (one recurring meeting)" : ""}{!zoomConfigured && " — not connected"}
        </label>
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn btn-primary" onClick={submit} disabled={busy || !canSubmit}>
          {busy ? "Scheduling…" : repeats && occurrences.length > 0 ? `Schedule ${occurrences.length} sessions` : "Schedule call"}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function RecordingForm({
  busy,
  defaultMinStars,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  defaultMinStars: number;
  onSubmit: (rec: { title: string; url: string; minStars: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [minStars, setMinStars] = useState(defaultMinStars);

  return (
    <div className="card-raised p-4 mt-4 flex flex-wrap gap-2 items-end">
      <div className="flex-1 min-w-40">
        <label className="label">Recording title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="flex-1 min-w-52">
        <label className="label">Recording URL</label>
        <input className="input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="w-24">
        <label className="label">Min ⭐</label>
        <input className="input" type="number" min={0} value={minStars}
          onChange={(e) => setMinStars(Math.max(0, Number(e.target.value) || 0))} />
      </div>
      <button
        className="btn btn-primary"
        disabled={busy || !title.trim() || !url.trim()}
        onClick={() => void onSubmit({ title: title.trim(), url: url.trim(), minStars })}
      >
        Publish recording
      </button>
      <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
    </div>
  );
}
