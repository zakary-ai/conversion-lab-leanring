"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";
import { formatDate, formatTime } from "@/lib/format";

type CallRow = {
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
};

export function CallManager({
  calls,
  staff,
  providerConfigured,
  providerName,
}: {
  calls: CallRow[];
  staff: { id: string; name: string }[];
  providerConfigured: boolean;
  providerName: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recordingFor, setRecordingFor] = useState<string | null>(null);

  async function api(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Something went wrong");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-rise">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Calls</h1>
          <p className="text-ink-mid text-sm mt-1">Schedule sessions and publish recordings.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icons.plus className="h-4 w-4" />
          Schedule call
        </button>
      </header>

      {!providerConfigured && (
        <div className="card border-accent/25 p-4 mb-6 text-sm">
          <p className="font-semibold text-accent-hi">Video provider not connected</p>
          <p className="text-ink-mid mt-1">
            Scheduling, RSVPs, and recordings work now. To enable embedded video rooms, add{" "}
            <code className="text-xs bg-overlay rounded px-1.5 py-0.5">DAILY_API_KEY</code> and{" "}
            <code className="text-xs bg-overlay rounded px-1.5 py-0.5">DAILY_DOMAIN</code> to the
            environment ({providerName} integration — see .env.example).
          </p>
        </div>
      )}

      {creating && (
        <CallForm
          staff={staff}
          busy={busy}
          onSubmit={async (fields) => {
            const ok = await api("/api/admin/calls", "POST", fields);
            if (ok) setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className="space-y-3">
        {calls.length === 0 && (
          <div className="card p-10 text-center">
            <p className="font-semibold">No calls scheduled</p>
            <p className="text-sm text-ink-mid mt-1">Schedule your first live training session.</p>
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
                  {call.minStars > 0 && <span className="chip">⭐ {call.minStars}+</span>}
                  {call.recordingEnabled && <span className="chip">REC</span>}
                </p>
                <p className="text-xs text-ink-dim mt-1">
                  {formatDate(call.scheduledAt)} · {formatTime(call.scheduledAt)} · {call.durationMin}{" "}
                  min{call.hostName && ` · ${call.hostName}`} · {call.attendeeCount} attending
                  {call.recordings.length > 0 && ` · ${call.recordings.length} recording(s)`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
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
                    onClick={() => void api(`/api/admin/calls/${call.id}`, "PATCH", { status: "CANCELLED" })}>
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
    </div>
  );
}

function CallForm({
  staff,
  busy,
  onSubmit,
  onCancel,
}: {
  staff: { id: string; name: string }[];
  busy: boolean;
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

  function submit() {
    if (!title.trim() || !date) return;
    const scheduledAt = new Date(`${date}T${time}:00`);
    void onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      hostId: hostId || null,
      scheduledAt: scheduledAt.toISOString(),
      durationMin,
      minStars,
      maxAttendees: maxAttendees ? Number(maxAttendees) : null,
      recordingEnabled,
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
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="w-28">
          <label className="label">Start</label>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
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
      <label className="flex items-center gap-2 text-sm self-end pb-2">
        <input type="checkbox" checked={recordingEnabled} onChange={(e) => setRecordingEnabled(e.target.checked)} />
        Enable recording
      </label>
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn btn-primary" onClick={submit} disabled={busy || !title.trim() || !date}>
          Schedule call
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
