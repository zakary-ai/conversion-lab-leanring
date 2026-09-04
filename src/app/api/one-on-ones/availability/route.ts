import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { isValidTimeZone, windowsOverlap } from "@/lib/booking";

const windowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1435),
    endMinute: z.number().int().min(5).max(1440),
  })
  .refine((w) => w.endMinute > w.startMinute, "Window must end after it starts");

const schema = z.object({
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
  slotMinutes: z.number().int().min(10).max(180),
  minNoticeMinutes: z.number().int().min(0).max(10080),
  acceptingBookings: z.boolean(),
  zoomUserId: z.string().trim().max(200).optional(),
  windows: z.array(windowSchema).max(28),
});

const INCLUDE: Prisma.HostAvailabilityInclude = {
  windows: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
};

/** The signed-in staff member's own availability. */
export async function GET() {
  return withRole("MODERATOR", async (user) => {
    const availability = await db.hostAvailability.findUnique({ where: { hostId: user.id }, include: INCLUDE });
    return json({ availability });
  });
}

/** Replace the signed-in staff member's availability (settings + all weekly windows). */
export async function PUT(req: Request) {
  return withRole("MODERATOR", async (user) => {
    const body = schema.parse(await req.json());
    if (windowsOverlap(body.windows)) return apiError(400, "Two windows on the same day overlap");
    const acceptingBookings = body.windows.length > 0 ? body.acceptingBookings : false;
    const zoomUserId = body.zoomUserId?.trim() || null;

    const availability = await db.$transaction(async (tx) => {
      const row = await tx.hostAvailability.upsert({
        where: { hostId: user.id },
        create: {
          hostId: user.id,
          timezone: body.timezone,
          slotMinutes: body.slotMinutes,
          minNoticeMinutes: body.minNoticeMinutes,
          acceptingBookings,
          zoomUserId,
        },
        update: {
          timezone: body.timezone,
          slotMinutes: body.slotMinutes,
          minNoticeMinutes: body.minNoticeMinutes,
          acceptingBookings,
          zoomUserId,
        },
      });
      await tx.availabilityWindow.deleteMany({ where: { availabilityId: row.id } });
      if (body.windows.length > 0) {
        await tx.availabilityWindow.createMany({
          data: body.windows.map((w) => ({ availabilityId: row.id, ...w })),
        });
      }
      return tx.hostAvailability.findUniqueOrThrow({ where: { id: row.id }, include: INCLUDE });
    });

    await audit({
      actorId: user.id,
      action: "availability.update",
      entityType: "host_availability",
      entityId: availability.id,
      details: {
        timezone: body.timezone,
        slotMinutes: body.slotMinutes,
        acceptingBookings,
        windows: body.windows.length,
      },
    });
    return json({ availability });
  });
}
