"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Embedded call experience. Joining goes through the RTC provider
 * abstraction; without provider credentials it shows an honest setup notice
 * instead of a fake room.
 */
export function CallRoom({
  callId,
  joinable,
  attending,
  isLive,
  startsAt,
}: {
  callId: string;
  joinable: boolean;
  attending: boolean;
  isLive: boolean;
  startsAt: string;
}) {
  const router = useRouter();
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isAttending, setIsAttending] = useState(attending);

  async function rsvp() {
    setBusy(true);
    try {
      const res = await fetch(`/api/calls/${callId}/rsvp`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { attending: boolean };
        setIsAttending(data.attending);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    try {
      const res = await fetch(`/api/calls/${callId}/join`, { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        configured: boolean;
        joinUrl?: string;
        message?: string;
      };
      if (!data.configured) {
        setNotConfigured(data.message ?? "Video provider not configured.");
        return;
      }
      setJoinUrl(data.joinUrl ?? null);
    } finally {
      setBusy(false);
    }
  }

  if (joinUrl) {
    return (
      <div className="mt-6">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-edge bg-black">
          <iframe
            src={joinUrl}
            title="Live call"
            className="absolute inset-0 h-full w-full"
            allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
          />
        </div>
        <button className="btn btn-danger btn-sm mt-3" onClick={() => setJoinUrl(null)}>
          Leave call
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {notConfigured && (
        <div className="card-raised border border-accent/25 p-4 mb-4 text-sm">
          <p className="font-semibold text-accent-hi">Video provider not connected</p>
          <p className="text-ink-mid mt-1">{notConfigured}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {joinable ? (
          <button className="btn btn-primary text-base px-6 py-2.5" onClick={() => void join()} disabled={busy}>
            {busy ? "Connecting…" : isLive ? "Join Live Call" : "Join call room"}
          </button>
        ) : (
          <p className="text-sm text-ink-mid">
            The call room opens 15 minutes before start ({new Date(startsAt).toLocaleString()}).
          </p>
        )}
        <button className={`btn btn-sm ${isAttending ? "btn-secondary" : "btn-secondary"}`} onClick={() => void rsvp()} disabled={busy}>
          {isAttending ? "✓ Attending — cancel RSVP" : "Reserve my spot"}
        </button>
      </div>
    </div>
  );
}
