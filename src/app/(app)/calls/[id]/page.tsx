import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessCall, starGate } from "@/lib/access";
import { formatDate, formatTime } from "@/lib/format";
import { LockedNotice } from "@/components/ui/Locked";
import { Avatar } from "@/components/ui/Avatar";
import { Icons } from "@/components/ui/icons";
import { CallRoom } from "@/components/calls/CallRoom";
import { describeRule } from "@/lib/call-series";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const call = await db.liveCall.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, name: true } },
      attendees: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { rsvpAt: "asc" },
      },
      recordings: { where: { status: "PUBLISHED" } },
      series: true,
    },
  });
  if (!call || call.status === "CANCELLED") notFound();

  // For a repeating call, point at the next scheduled session in the series.
  const nextInSeries = call.seriesId
    ? await db.liveCall.findFirst({
        where: { seriesId: call.seriesId, status: "SCHEDULED", scheduledAt: { gt: call.scheduledAt } },
        orderBy: { scheduledAt: "asc" },
        select: { id: true, scheduledAt: true },
      })
    : null;

  const access = canAccessCall(user, call);
  if (!access.allowed) {
    return (
      <div className="max-w-xl mx-auto animate-rise">
        <div className="card mt-12">
          <div className="p-6 border-b border-edge">
            <h1 className="text-xl font-bold">{call.title}</h1>
            <p className="text-sm text-ink-mid mt-1">
              {formatDate(call.scheduledAt, user.timezone)} · {formatTime(call.scheduledAt, user.timezone)}
            </p>
          </div>
          <LockedNotice required={access.required ?? 0} current={user.starBalance} what="this call" />
          <div className="p-6 pt-0 text-center">
            <Link href="/training" className="btn btn-primary">Continue Training</Link>
          </div>
        </div>
      </div>
    );
  }

  const attending = call.attendees.some((a) => a.userId === user.id);
  const startMs = call.scheduledAt.getTime();
  const joinable =
    call.status === "LIVE" ||
    (call.status === "SCHEDULED" &&
      Date.now() > startMs - 15 * 60 * 1000 &&
      Date.now() < startMs + call.durationMin * 60 * 1000 + 60 * 60 * 1000);

  return (
    <div className="animate-rise max-w-4xl">
      <Link href="/calls" className="text-xs text-ink-dim hover:text-ink mb-4 inline-block">
        ← All calls
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <div className="card p-6 md:p-8">
            {(call.status === "LIVE" || call.seriesId || call.joinUrl) && (
              <p className="flex flex-wrap items-center gap-1.5 mb-3">
                {call.status === "LIVE" && <span className="chip chip-bad">● LIVE NOW</span>}
                {call.seriesId && <span className="chip">Repeats</span>}
                {call.joinUrl && <span className="chip">Hosted on Zoom</span>}
              </p>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{call.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-mid">
              <span className="flex items-center gap-1.5">
                <Icons.calendar className="h-4 w-4" />
                {formatDate(call.scheduledAt, user.timezone)}
              </span>
              <span className="flex items-center gap-1.5">
                <Icons.clock className="h-4 w-4" />
                {formatTime(call.scheduledAt, user.timezone)} · {call.durationMin} min
              </span>
              {call.host && (
                <span className="flex items-center gap-1.5">
                  <Avatar name={call.host.name} size="xs" />
                  Hosted by {call.host.name}
                </span>
              )}
            </div>
            {call.series && (
              <p className="text-xs text-ink-dim mt-3">
                {describeRule(call.series)}
                {nextInSeries && (
                  <>
                    {" · "}
                    <Link href={`/calls/${nextInSeries.id}`} className="underline hover:text-ink">
                      Next session {formatDate(nextInSeries.scheduledAt, user.timezone)}
                    </Link>
                  </>
                )}
              </p>
            )}
            {call.description && (
              <p className="prose-sm-invert mt-5 whitespace-pre-line">{call.description}</p>
            )}
            <CallRoom
              callId={call.id}
              joinable={joinable}
              attending={attending}
              isLive={call.status === "LIVE"}
              startsAt={call.scheduledAt.toISOString()}
              hostedOnZoom={Boolean(call.joinUrl)}
            />
          </div>

          {call.recordings.length > 0 && (
            <div className="card p-6 mt-6">
              <p className="section-title mb-4">Recordings</p>
              <ul className="space-y-2">
                {call.recordings.map((rec) => {
                  const recAccess = starGate(user, rec.minStars);
                  return (
                    <li key={rec.id}>
                      {recAccess.allowed ? (
                        <a
                          href={rec.url}
                          target="_blank"
                          rel="noreferrer"
                          className="card-raised card-hover flex items-center gap-3 px-4 py-3 text-sm font-medium"
                        >
                          <Icons.play className="h-4 w-4 text-accent-hi" />
                          {rec.title}
                        </a>
                      ) : (
                        <div className="card-raised flex items-center gap-3 px-4 py-3 text-sm text-ink-dim">
                          🔒 {rec.title} — requires {rec.minStars} Stars
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <aside className="card p-5 self-start">
          <p className="section-title mb-3">Attendees ({call.attendees.length})</p>
          {call.attendees.length === 0 ? (
            <p className="text-sm text-ink-mid">Be the first to reserve a spot.</p>
          ) : (
            <ul className="space-y-2.5">
              {call.attendees.slice(0, 12).map((a) => (
                <li key={a.id} className="flex items-center gap-2.5">
                  <Avatar name={a.user.name} size="xs" />
                  <span className="text-sm truncate">{a.user.name}</span>
                </li>
              ))}
              {call.attendees.length > 12 && (
                <li className="text-xs text-ink-dim">+{call.attendees.length - 12} more</li>
              )}
            </ul>
          )}
          {call.maxAttendees && (
            <p className="text-xs text-ink-dim mt-4">
              {call.attendees.length} / {call.maxAttendees} spots filled
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
