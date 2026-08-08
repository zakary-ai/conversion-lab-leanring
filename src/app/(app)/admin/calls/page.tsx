import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRtcProvider } from "@/lib/providers/rtc";
import { CallManager } from "@/components/admin/calls/CallManager";

export const metadata = { title: "Admin · Live Calls" };

export default async function AdminCallsPage() {
  await requireRole("ADMIN");
  const [calls, staff] = await Promise.all([
    db.liveCall.findMany({
      orderBy: { scheduledAt: "desc" },
      include: {
        host: { select: { id: true, name: true } },
        _count: { select: { attendees: true } },
        recordings: true,
      },
    }),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN", "MODERATOR"] } },
      select: { id: true, name: true },
    }),
  ]);
  const provider = getRtcProvider();

  return (
    <CallManager
      providerConfigured={provider.configured}
      providerName={provider.name}
      staff={staff}
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
      }))}
    />
  );
}
