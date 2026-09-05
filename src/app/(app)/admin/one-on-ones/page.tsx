import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeBooking } from "@/lib/booking-service";
import { getMeetingProvider } from "@/lib/providers/meetings";
import { connectedZoomUserIds } from "@/lib/zoom-connections";
import { enumLabel, timeAgo } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { BookingList } from "@/components/one-on-ones/BookingList";

export const metadata = { title: "Admin · 1-on-1s" };

export default async function AdminOneOnOnesPage() {
  const user = await requireRole("ADMIN");
  const now = new Date();
  const provider = getMeetingProvider();

  const [staff, bookings] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["MODERATOR", "ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        role: true,
        hostAvailability: { include: { _count: { select: { windows: true } } } },
        _count: { select: { hostedBookings: { where: { status: "CONFIRMED", startsAt: { gte: now } } } } },
      },
    }),
    db.booking.findMany({
      orderBy: { startsAt: "desc" },
      take: 200,
      include: { host: { select: { id: true, name: true } }, learner: { select: { id: true, name: true } } },
    }),
  ]);

  const zoomOwners = await connectedZoomUserIds(staff.map((s) => s.id));
  const anyZoom = provider.configured || zoomOwners.size > 0;

  const upcoming = bookings.filter((b) => b.status === "CONFIRMED" && b.endsAt >= now).reverse();
  const history = bookings.filter((b) => !(b.status === "CONFIRMED" && b.endsAt >= now));

  return (
    <div className="animate-rise">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">1-on-1s</h1>
          <p className="text-ink-mid text-sm mt-1">Who is bookable, and every session on the calendar.</p>
        </div>
        <Link href="/one-on-ones/availability" className="btn btn-secondary">
          My availability
        </Link>
      </header>

      {!provider.configured && (
        <div className="card border-accent/25 p-4 mb-6 text-sm">
          <p className="font-semibold text-accent-hi">Academy-wide {provider.name} not connected</p>
          <p className="text-ink-mid mt-1">
            Bookings and notifications work now. Hosts get {provider.name} links only if they connect their own account on their
            profile ({zoomOwners.size} of {staff.length} have). To cover everyone else, add{" "}
            <code className="text-xs bg-overlay rounded px-1.5 py-0.5">ZOOM_ACCOUNT_ID</code>,{" "}
            <code className="text-xs bg-overlay rounded px-1.5 py-0.5">ZOOM_CLIENT_ID</code>,{" "}
            <code className="text-xs bg-overlay rounded px-1.5 py-0.5">ZOOM_CLIENT_SECRET</code> and{" "}
            <code className="text-xs bg-overlay rounded px-1.5 py-0.5">ZOOM_USER_ID</code> to the environment (see .env.example).
          </p>
        </div>
      )}

      <section className="card overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left border-b border-edge">
              <th className="px-5 py-3 section-title font-bold">Host</th>
              <th className="px-4 py-3 section-title font-bold">Status</th>
              <th className="px-4 py-3 section-title font-bold">Timezone</th>
              <th className="px-4 py-3 section-title font-bold">Session</th>
              <th className="px-4 py-3 section-title font-bold">Windows</th>
              <th className="px-4 py-3 section-title font-bold">Zoom</th>
              <th className="px-4 py-3 section-title font-bold">Upcoming</th>
              <th className="px-4 py-3 section-title font-bold">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/60">
            {staff.map((s) => {
              const a = s.hostAvailability;
              return (
                <tr key={s.id} className="hover:bg-overlay/40 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} size="sm" />
                      <div>
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-xs text-ink-dim">{enumLabel(s.role)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a?.acceptingBookings ? (
                      <span className="chip chip-good">Accepting</span>
                    ) : a ? (
                      <span className="chip">Paused</span>
                    ) : (
                      <span className="chip text-ink-dim">Not set up</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-mid">{a?.timezone ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-mid">{a ? `${a.slotMinutes} min` : "—"}</td>
                  <td className="px-4 py-3 text-ink-mid">{a ? a._count.windows : "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {zoomOwners.has(s.id) ? (
                      <span className="chip chip-good">Own account</span>
                    ) : provider.configured ? (
                      <span className="chip">Academy</span>
                    ) : (
                      <span className="chip text-ink-dim">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold">{s._count.hostedBookings}</td>
                  <td className="px-4 py-3 text-ink-dim text-xs">{a ? timeAgo(a.updatedAt, user.timezone) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="space-y-6">
        <BookingList
          title="Upcoming sessions"
          bookings={upcoming.map((b) => serializeBooking(b, { includeStartUrl: true }))}
          viewer="admin"
          providerConfigured={anyZoom}
          emptyMessage="No sessions booked yet."
          currentUserId={user.id}
        />
        {history.length > 0 && (
          <BookingList
            title="Past & cancelled"
            bookings={history.map((b) => serializeBooking(b, { includeStartUrl: true }))}
            viewer="admin"
            providerConfigured={anyZoom}
            currentUserId={user.id}
          />
        )}
      </div>
    </div>
  );
}
