import Link from "next/link";
import { requireUser, isStaff } from "@/lib/auth";
import { canBookOneOnOne } from "@/lib/access";
import { getBookableHosts, getMyBookings, serializeBooking } from "@/lib/booking-service";
import { anyZoomAvailable } from "@/lib/zoom-connections";
import { LockedNotice } from "@/components/ui/Locked";
import { Icons } from "@/components/ui/icons";
import { BookingScheduler } from "@/components/one-on-ones/BookingScheduler";
import { BookingList } from "@/components/one-on-ones/BookingList";

export const metadata = { title: "1-on-1s" };

export default async function OneOnOnesPage() {
  const user = await requireUser();
  const staff = isStaff(user.role);
  const [access, hosts, mine, providerConfigured] = await Promise.all([
    canBookOneOnOne(user),
    getBookableHosts(),
    getMyBookings(user.id),
    anyZoomAvailable(),
  ]);
  const otherHosts = hosts.filter((h) => h.id !== user.id);

  return (
    <div className="animate-rise">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">1-on-1s</h1>
          <p className="text-ink-mid text-sm mt-1">
            Book private time with a coach. Sessions run on Zoom — your link appears here once booked.
          </p>
        </div>
        {staff && (
          <Link href="/one-on-ones/availability" className="btn btn-secondary">
            <Icons.settings className="h-4 w-4" />
            Manage availability
          </Link>
        )}
      </header>

      <div className="space-y-6">
        {access.allowed ? (
          <BookingScheduler hosts={otherHosts} />
        ) : (
          <section className="card">
            <LockedNotice required={access.required ?? 0} current={access.current ?? user.starBalance} what="1-on-1 coaching" />
            <div className="text-center pb-8 -mt-4">
              <Link href="/training" className="btn btn-primary btn-sm">Continue Training</Link>
            </div>
          </section>
        )}

        {staff && (
          <BookingList
            title="Sessions with you"
            bookings={mine.hosting.map((b) => serializeBooking(b, { includeStartUrl: true }))}
            viewer="host"
            providerConfigured={providerConfigured}
            emptyMessage="No one has booked you yet. Make sure you're accepting bookings in Manage availability."
            currentUserId={user.id}
          />
        )}

        <BookingList
          title="Your upcoming sessions"
          bookings={mine.upcoming.map((b) => serializeBooking(b, { includeStartUrl: false }))}
          viewer="learner"
          providerConfigured={providerConfigured}
          emptyMessage="No upcoming sessions. Pick a time above to book one."
          currentUserId={user.id}
        />

        {mine.past.length > 0 && (
          <BookingList
            title="Past & cancelled"
            bookings={mine.past.map((b) => serializeBooking(b, { includeStartUrl: false }))}
            viewer="learner"
            providerConfigured={providerConfigured}
            currentUserId={user.id}
          />
        )}
      </div>
    </div>
  );
}
