import type { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Keeps every time-zone-bearing record in step with the account zone.
 *
 * The account zone (`User.timezone`) is the source of truth. When it changes
 * we also update:
 *   - the host's availability zone — weekly windows are expressed in it and
 *     Zoom meetings are created with it, so a coach who moves keeps "9–5"
 *     meaning 9–5 where they now are;
 *   - `learnerTz` on the learner's upcoming bookings, which is what display
 *     and future reminders use.
 * Past and cancelled bookings keep the zone they were made in.
 *
 * The writes are returned as an array so callers can fold them into their
 * own transaction alongside other updates.
 */
export function timeZoneSyncWrites(userId: string, timezone: string): Prisma.PrismaPromise<unknown>[] {
  return [
    db.hostAvailability.updateMany({ where: { hostId: userId }, data: { timezone } }),
    db.booking.updateMany({
      where: { learnerId: userId, status: "CONFIRMED", endsAt: { gte: new Date() } },
      data: { learnerTz: timezone },
    }),
  ];
}

/** Set the account zone and propagate it everywhere, atomically. */
export async function setAccountTimeZone(userId: string, timezone: string) {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { timezone } }),
    ...timeZoneSyncWrites(userId, timezone),
  ]);
}
