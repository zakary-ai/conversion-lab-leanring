import { Prisma } from "@prisma/client";
import type { Booking, User } from "@prisma/client";
import { db } from "./db";
import { isAdmin, isStaff } from "./auth";
import { canBookOneOnOne } from "./access";
import { notify } from "./notifications";
import { audit } from "./audit";
import { getMeetingProvider, MEETING_PROVIDER_SETUP_MESSAGE } from "./providers/meetings";
import {
  BOOKING_HORIZON_DAYS,
  MAX_UPCOMING_BOOKINGS_PER_LEARNER,
  generateSlots,
  slotKeyFor,
  type Slot,
} from "./booking";

/**
 * Database-aware booking operations. Route handlers stay thin and call these;
 * the pure slot math lives in ./booking.
 */

const DAY = 24 * 60 * 60 * 1000;
const STAFF_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

export class SlotUnavailableError extends Error {
  constructor() {
    super("That time was just taken — pick another slot");
  }
}

export class BookingRuleError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 = 400) {
    super(message);
  }
}

const BOOKING_INCLUDE = {
  host: { select: { id: true, name: true } },
  learner: { select: { id: true, name: true } },
} as const;

export type BookingWithPeople = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

export type BookableHost = {
  id: string;
  name: string;
  role: string;
  headline: string | null;
  slotMinutes: number;
  timezone: string;
};

/** Staff members who are currently accepting bookings and have at least one window. */
export async function getBookableHosts(): Promise<BookableHost[]> {
  const hosts = await db.user.findMany({
    where: {
      role: { in: [...STAFF_ROLES] },
      status: "ACTIVE",
      hostAvailability: { acceptingBookings: true, windows: { some: {} } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      profile: { select: { headline: true } },
      hostAvailability: { select: { slotMinutes: true, timezone: true } },
    },
  });
  return hosts.map((h) => ({
    id: h.id,
    name: h.name,
    role: h.role,
    headline: h.profile?.headline ?? null,
    slotMinutes: h.hostAvailability!.slotMinutes,
    timezone: h.hostAvailability!.timezone,
  }));
}

/** Open slots for a host in [from, to]. Null when the host isn't bookable. */
export async function getHostSlots(hostId: string, from: Date, to: Date, now = new Date()) {
  const host = await db.user.findUnique({
    where: { id: hostId },
    select: {
      role: true,
      status: true,
      hostAvailability: { include: { windows: true } },
    },
  });
  const availability = host?.hostAvailability;
  if (!host || !isStaff(host.role) || host.status !== "ACTIVE" || !availability?.acceptingBookings) {
    return null;
  }
  const horizon = new Date(now.getTime() + BOOKING_HORIZON_DAYS * DAY);
  const cappedTo = to < horizon ? to : horizon;
  const existing = await db.booking.findMany({
    where: {
      hostId,
      status: "CONFIRMED",
      startsAt: { lt: new Date(cappedTo.getTime() + DAY) },
      endsAt: { gt: new Date(from.getTime() - DAY) },
    },
    select: { startsAt: true, endsAt: true },
  });
  const slots = generateSlots({
    windows: availability.windows,
    timezone: availability.timezone,
    slotMinutes: availability.slotMinutes,
    from,
    to: cappedTo,
    existing,
    minNoticeMinutes: availability.minNoticeMinutes,
    now,
  });
  return { slots, slotMinutes: availability.slotMinutes, timezone: availability.timezone };
}

export async function createBooking(params: {
  learner: User;
  hostId: string;
  startsAt: Date;
  note?: string;
  learnerTz: string;
}): Promise<{ booking: BookingWithPeople; video: { configured: boolean; message?: string } }> {
  const { learner, hostId, startsAt, learnerTz } = params;
  const note = params.note?.trim() || null;

  const access = await canBookOneOnOne(learner);
  if (!access.allowed) throw new BookingRuleError("You can't book 1-on-1s yet", 403);
  if (hostId === learner.id) throw new BookingRuleError("You can't book a session with yourself");

  const host = await db.user.findUnique({
    where: { id: hostId },
    select: { id: true, name: true, role: true, status: true, hostAvailability: true },
  });
  const availability = host?.hostAvailability;
  if (!host || !isStaff(host.role) || host.status !== "ACTIVE" || !availability?.acceptingBookings) {
    throw new BookingRuleError("This host isn't accepting bookings", 404);
  }

  // Regenerating the slots around the requested time validates windows,
  // notice period, horizon and existing conflicts in one step.
  const window = await getHostSlots(hostId, new Date(startsAt.getTime() - DAY), new Date(startsAt.getTime() + DAY));
  const match: Slot | undefined = window?.slots.find((s) => s.startsAt.getTime() === startsAt.getTime());
  if (!match) throw new SlotUnavailableError();

  const upcoming = await db.booking.count({
    where: { learnerId: learner.id, status: "CONFIRMED", endsAt: { gte: new Date() } },
  });
  if (upcoming >= MAX_UPCOMING_BOOKINGS_PER_LEARNER) {
    throw new BookingRuleError(
      `You already have ${MAX_UPCOMING_BOOKINGS_PER_LEARNER} upcoming 1-on-1s. Cancel one to book another.`
    );
  }

  let created: Booking;
  try {
    created = await db.$transaction(async (tx) => {
      // Serialise bookings per host so the overlap check can't race.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hostId}))`;
      const clash = await tx.booking.findFirst({
        where: { hostId, status: "CONFIRMED", startsAt: { lt: match.endsAt }, endsAt: { gt: match.startsAt } },
        select: { id: true },
      });
      if (clash) throw new SlotUnavailableError();
      return tx.booking.create({
        data: {
          hostId,
          learnerId: learner.id,
          startsAt: match.startsAt,
          endsAt: match.endsAt,
          durationMin: availability.slotMinutes,
          learnerTz,
          note,
          slotKey: slotKeyFor(hostId, match.startsAt),
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new SlotUnavailableError();
    }
    throw err;
  }

  // Video link: best effort, outside the transaction. A provider failure never
  // loses the booking — the UI shows an honest "link unavailable" state.
  const provider = getMeetingProvider();
  const zoomUser = availability.zoomUserId?.trim() || provider.defaultUserId;
  let video: { configured: boolean; message?: string } = { configured: true };
  if (provider.configured && zoomUser) {
    try {
      const meeting = await provider.createMeeting({
        userId: zoomUser,
        topic: `1-on-1: ${host.name} × ${learner.name}`,
        startsAt: match.startsAt,
        durationMin: availability.slotMinutes,
        timezone: availability.timezone,
        agenda: note ?? undefined,
      });
      created = await db.booking.update({
        where: { id: created.id },
        data: {
          meetingProvider: provider.name.toLowerCase(),
          meetingId: meeting.meetingId,
          joinUrl: meeting.joinUrl,
          startUrl: meeting.startUrl,
        },
      });
    } catch (err) {
      console.error("[booking] meeting creation failed", err);
      video = { configured: true, message: `The ${provider.name} link couldn't be created. Staff will follow up with a link.` };
    }
  } else {
    video = { configured: false, message: MEETING_PROVIDER_SETUP_MESSAGE };
  }

  await Promise.all([
    notify({
      userId: learner.id,
      type: "BOOKING_CONFIRMED",
      title: `1-on-1 booked with ${host.name}`,
      body: "Your join link is on the 1-on-1s page.",
      linkUrl: "/one-on-ones",
    }),
    notify({
      userId: host.id,
      type: "BOOKING_CONFIRMED",
      title: `${learner.name} booked a 1-on-1 with you`,
      body: note ? `Note: ${note.slice(0, 140)}` : undefined,
      linkUrl: "/one-on-ones",
    }),
    audit({
      actorId: learner.id,
      action: "booking.create",
      entityType: "booking",
      entityId: created.id,
      details: { hostId, startsAt: created.startsAt.toISOString(), meetingId: created.meetingId },
    }),
  ]);

  const booking = await db.booking.findUniqueOrThrow({ where: { id: created.id }, include: BOOKING_INCLUDE });
  return { booking, video };
}

export async function cancelBooking(params: {
  bookingId: string;
  actor: User;
  reason?: string;
}): Promise<BookingWithPeople> {
  const { bookingId, actor } = params;
  const reason = params.reason?.trim() || null;
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
  if (!booking) throw new BookingRuleError("Booking not found", 404);
  const permitted = actor.id === booking.learnerId || actor.id === booking.hostId || isAdmin(actor.role);
  if (!permitted) throw new BookingRuleError("You can't cancel this booking", 403);
  if (booking.status !== "CONFIRMED") throw new BookingRuleError("This booking is already cancelled");

  const updated = await db.booking.update({
    where: { id: bookingId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: actor.id,
      cancelReason: reason,
      slotKey: null,
    },
    include: BOOKING_INCLUDE,
  });

  if (booking.meetingId) {
    const provider = getMeetingProvider();
    if (provider.configured) {
      try {
        await provider.deleteMeeting(booking.meetingId);
      } catch (err) {
        console.error("[booking] meeting deletion failed", err);
      }
    }
  }

  const when = booking.startsAt.toISOString();
  const others = [booking.learnerId, booking.hostId].filter((id) => id !== actor.id);
  await Promise.all([
    ...others.map((userId) =>
      notify({
        userId,
        type: "BOOKING_CANCELLED",
        title: `${actor.name} cancelled your 1-on-1`,
        body: reason ?? undefined,
        linkUrl: "/one-on-ones",
      })
    ),
    audit({
      actorId: actor.id,
      action: "booking.cancel",
      entityType: "booking",
      entityId: bookingId,
      details: { hostId: booking.hostId, learnerId: booking.learnerId, startsAt: when, reason },
    }),
  ]);
  return updated;
}

/** Next confirmed session the user is part of (as learner or host). */
export async function getNextBookingFor(userId: string): Promise<BookingWithPeople | null> {
  return db.booking.findFirst({
    where: {
      status: "CONFIRMED",
      endsAt: { gte: new Date() },
      OR: [{ learnerId: userId }, { hostId: userId }],
    },
    orderBy: { startsAt: "asc" },
    include: BOOKING_INCLUDE,
  });
}

export async function getMyBookings(userId: string) {
  const now = new Date();
  const [upcoming, past, hosting] = await Promise.all([
    db.booking.findMany({
      where: { learnerId: userId, status: "CONFIRMED", endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      include: BOOKING_INCLUDE,
    }),
    db.booking.findMany({
      where: { learnerId: userId, OR: [{ status: "CANCELLED" }, { endsAt: { lt: now } }] },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: BOOKING_INCLUDE,
    }),
    db.booking.findMany({
      where: { hostId: userId, OR: [{ status: "CONFIRMED", endsAt: { gte: now } }, { startsAt: { gte: new Date(now.getTime() - 7 * DAY) } }] },
      orderBy: { startsAt: "asc" },
      include: BOOKING_INCLUDE,
    }),
  ]);
  return { upcoming, past, hosting };
}

/** Plain-object shape handed to client components. */
export type BookingRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  status: "CONFIRMED" | "CANCELLED";
  note: string | null;
  host: { id: string; name: string };
  learner: { id: string; name: string };
  joinUrl: string | null;
  startUrl: string | null;
  cancelledById: string | null;
  cancelReason: string | null;
};

/** Serialize for the client. `startUrl` is only exposed to the host/admin side. */
export function serializeBooking(b: BookingWithPeople, opts: { includeStartUrl: boolean }): BookingRow {
  return {
    id: b.id,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    durationMin: b.durationMin,
    status: b.status,
    note: b.note,
    host: b.host,
    learner: b.learner,
    joinUrl: b.joinUrl,
    startUrl: opts.includeStartUrl ? b.startUrl : null,
    cancelledById: b.cancelledById,
    cancelReason: b.cancelReason,
  };
}
