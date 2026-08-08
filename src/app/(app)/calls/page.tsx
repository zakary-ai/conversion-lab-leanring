import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessCall, starGate } from "@/lib/access";
import { formatDate, formatTime } from "@/lib/format";
import { LockChip } from "@/components/ui/Locked";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icons } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/Avatar";

export const metadata = { title: "Live Calls" };

export default async function CallsPage() {
  const user = await requireUser();
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    db.liveCall.findMany({
      where: {
        status: { in: ["SCHEDULED", "LIVE"] },
        scheduledAt: { gte: new Date(now.getTime() - 3 * 60 * 60 * 1000) },
      },
      orderBy: { scheduledAt: "asc" },
      include: { host: { select: { name: true } }, _count: { select: { attendees: true } } },
    }),
    db.liveCall.findMany({
      where: {
        OR: [{ status: "ENDED" }, { scheduledAt: { lt: new Date(now.getTime() - 3 * 60 * 60 * 1000) } }],
        status: { not: "CANCELLED" },
      },
      orderBy: { scheduledAt: "desc" },
      take: 6,
      include: {
        recordings: { where: { status: "PUBLISHED" } },
        host: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="animate-rise">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Live Calls</h1>
        <p className="text-ink-mid text-sm mt-1">
          Train live with coaches and the community — roleplays, hot seats, and Q&amp;A.
        </p>
      </header>

      <section>
        <p className="section-title mb-4">Upcoming</p>
        {upcoming.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Icons.calls className="h-6 w-6" />}
              title="No live sessions scheduled yet"
              message="New coaching calls are announced here and in notifications."
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {upcoming.map((call) => {
              const access = canAccessCall(user, call);
              const isLive = call.status === "LIVE";
              return (
                <div key={call.id} className={`card p-6 ${!access.allowed ? "opacity-75" : "card-hover"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {isLive && <span className="chip chip-bad mb-2">● LIVE NOW</span>}
                      <h2 className="font-bold text-lg leading-snug">{call.title}</h2>
                      {call.description && (
                        <p className="text-sm text-ink-mid mt-1 line-clamp-2">{call.description}</p>
                      )}
                    </div>
                    {!access.allowed && <LockChip required={access.required ?? 0} />}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-dim">
                    <span className="flex items-center gap-1.5">
                      <Icons.calendar className="h-3.5 w-3.5" />
                      {formatDate(call.scheduledAt)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icons.clock className="h-3.5 w-3.5" />
                      {formatTime(call.scheduledAt)} · {call.durationMin} min
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-ink-mid">
                      {call.host && (
                        <>
                          <Avatar name={call.host.name} size="xs" />
                          Hosted by {call.host.name} ·
                        </>
                      )}
                      <span>{call._count.attendees} attending</span>
                    </div>
                    {access.allowed ? (
                      <Link href={`/calls/${call.id}`} className={`btn btn-sm ${isLive ? "btn-primary" : "btn-secondary"}`}>
                        {isLive ? "Join Live Call" : "View details"}
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-dim">
                        Earn {(access.required ?? 0) - user.starBalance} more ⭐ to join
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10">
          <p className="section-title mb-4">Past calls &amp; recordings</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {past.map((call) => {
              const recording = call.recordings[0];
              const recAccess = recording ? starGate(user, recording.minStars) : null;
              return (
                <div key={call.id} className="card p-5">
                  <p className="chip mb-3">Past call</p>
                  <h3 className="font-bold leading-snug">{call.title}</h3>
                  <p className="text-xs text-ink-dim mt-1">
                    {formatDate(call.scheduledAt)}
                    {call.host && ` · ${call.host.name}`}
                  </p>
                  {recording ? (
                    recAccess?.allowed ? (
                      <a href={recording.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm mt-4">
                        <Icons.play className="h-3.5 w-3.5" />
                        Watch Recording
                      </a>
                    ) : (
                      <p className="text-xs text-ink-dim mt-4 flex items-center gap-1.5">
                        <LockChip required={recording.minStars} />
                        to watch the recording
                      </p>
                    )
                  ) : (
                    <p className="text-xs text-ink-dim mt-4">No recording available</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
