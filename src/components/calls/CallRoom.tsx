"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";
import { useTimeZone } from "@/components/time/TimeZoneContext";
import { formatLocal } from "@/components/one-on-ones/LocalTime";

/**
 * Call experience. Zoom-hosted calls open in a new tab (Zoom can't be
 * embedded); otherwise the RTC provider's room is embedded. Without any
 * provider credentials it shows an honest setup notice instead of a fake room.
 */
export function CallRoom({
  callId,
  joinable,
  attending,
  isLive,
  startsAt,
  hostedOnZoom,
}: {
  callId: string;
  joinable: boolean;
  attending: boolean;
  isLive: boolean;
  startsAt: string;
  hostedOnZoom: boolean;
}) {
  const tz = useTimeZone();
  const router = useRouter();
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [external, setExternal] = useState<{ url: string; asHost: boolean } | null>(null);
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
        external?: boolean;
        asHost?: boolean;
        joinUrl?: string;
        message?: string;
      };
      if (!data.configured) {
        setNotConfigured(data.message ?? "Video provider not configured.");
        return;
      }
      if (data.external && data.joinUrl) {
        window.open(data.joinUrl, "_blank", "noopener,noreferrer");
        setExternal({ url: data.joinUrl, asHost: Boolean(data.asHost) });
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
      {external && (
        <div className="card-raised border border-good/30 p-4 mb-4 text-sm animate-fade">
          <p className="font-semibold">
            {external.asHost ? "Zoom opened in a new tab — you're joining as the host." : "Zoom opened in a new tab."}
          </p>
          <p className="text-ink-mid mt-1">
            Didn&apos;t open?{" "}
            <a href={external.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
              Open the Zoom link
            </a>
            .
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {joinable ? (
          <button className="btn btn-primary text-base px-6 py-2.5" onClick={() => void join()} disabled={busy}>
            {busy ? "Connecting…" : hostedOnZoom ? "Join on Zoom" : isLive ? "Join Live Call" : "Join call room"}
            {hostedOnZoom && !busy && <Icons.external className="h-4 w-4" />}
          </button>
        ) : (
          <p className="text-sm text-ink-mid">
            {hostedOnZoom ? "The Zoom link opens" : "The call room opens"} 15 minutes before start ({formatLocal(startsAt, "datetime", tz)}).
          </p>
        )}
        <button className={`btn btn-sm ${isAttending ? "btn-secondary" : "btn-secondary"}`} onClick={() => void rsvp()} disabled={busy}>
          {isAttending ? "✓ Attending — cancel RSVP" : "Reserve my spot"}
        </button>
      </div>
    </div>
  );
}
