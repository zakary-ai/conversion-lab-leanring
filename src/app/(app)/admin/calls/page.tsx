import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRtcProvider } from "@/lib/providers/rtc";
import { getMeetingProvider } from "@/lib/providers/meetings";
import { describeRule } from "@/lib/call-series";
import { CallManager } from "@/components/admin/calls/CallManager";

export const metadata = { title: "Admin · Live Calls" };

export default async function AdminCallsPage() {
  await requireRole("ADMIN");
  const now = new Date();
  const [calls, series, staff] = await Promise.all([
    db.liveCall.findMany({
      orderBy: { scheduledAt: "desc" },
      include: {
        host: { select: { id: true, name: true } },
        _count: { select: { attendees: true } },
        recordings: true,
      },
    }),
    db.callSeries.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        host: { select: { name: true } },
        calls: { select: { scheduledAt: true, status: true }, orderBy: { scheduledAt: "asc" } },
      },
    }),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN", "MODERATOR"] } },
      select: { id: true, name: true },
    }),
  ]);
  const rtc = getRtcProvider();
  const zoom = getMeetingProvider();

  return (
    <CallManager
      rtcConfigured={rtc.configured}
      rtcName={rtc.name}
      zoomConfigured={zoom.configured}
      staff={staff}
      series={series.map((s) => {
        const upcoming = s.calls.filter((c) => c.status === "SCHEDULED" && c.scheduledAt >= now);
        return {
          id: s.id,
          title: s.title,
          rule: describeRule(s),
          status: s.status,
          hostName: s.host?.name ?? null,
          totalCount: s.calls.length,
          upcomingCount: upcoming.length,
          nextAt: upcoming[0]?.scheduledAt.toISOString() ?? null,
          hostedOnZoom: Boolean(s.joinUrl),
        };
      })}
      calls={calls.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description ?? "",
        hostId: c.hostId,
        hostName: c.host?.name ?? null,
        scheduledAt: c.scheduledAt.toISOString(),
        durationMin: c.durationMin,
        minStars: c.minStars,
        maxAttendees: c.maxAttendees,
        recordingEnabled: c.recordingEnabled,
        status: c.status,
        attendeeCount: c._count.attendees,
        recordings: c.recordings.map((r) => ({ id: r.id, title: r.title })),
        seriesId: c.seriesId,
        hostedOnZoom: Boolean(c.joinUrl),
        startUrl: c.startUrl,
      }))}
    />
  );
}
