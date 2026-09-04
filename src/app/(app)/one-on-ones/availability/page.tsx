import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMeetingProvider } from "@/lib/providers/meetings";
import { AvailabilityEditor } from "@/components/one-on-ones/AvailabilityEditor";

export const metadata = { title: "1-on-1 availability" };

/** Where a host sets the weekly hours learners can book. Staff only. */
export default async function AvailabilityPage() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) redirect("/one-on-ones");

  const availability = await db.hostAvailability.findUnique({
    where: { hostId: user.id },
    include: { windows: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] } },
  });
  const provider = getMeetingProvider();

  return (
    <div className="animate-rise max-w-3xl">
      <header className="mb-6">
        <Link href="/one-on-ones" className="text-xs text-ink-mid hover:text-accent-hi">← 1-on-1s</Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Your availability</h1>
        <p className="text-ink-mid text-sm mt-1">
          Set the weekly hours learners can book you for. Each booking gets its own {provider.name} meeting.
        </p>
      </header>
      <AvailabilityEditor
        accountTimeZone={user.timezone}
        initial={
          availability
            ? {
                timezone: availability.timezone,
                slotMinutes: availability.slotMinutes,
                minNoticeMinutes: availability.minNoticeMinutes,
                acceptingBookings: availability.acceptingBookings,
                zoomUserId: availability.zoomUserId ?? "",
                windows: availability.windows.map((w) => ({
                  dayOfWeek: w.dayOfWeek,
                  startMinute: w.startMinute,
                  endMinute: w.endMinute,
                })),
              }
            : null
        }
        providerConfigured={provider.configured}
        providerName={provider.name}
        hasDefaultMeetingUser={Boolean(provider.defaultUserId)}
      />
    </div>
  );
}
