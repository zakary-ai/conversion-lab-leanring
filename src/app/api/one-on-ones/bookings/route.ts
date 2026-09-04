import { z } from "zod";
import { withAuth, json, apiError } from "@/lib/api";
import { isValidTimeZone } from "@/lib/booking";
import { BookingRuleError, SlotUnavailableError, createBooking, serializeBooking } from "@/lib/booking-service";

const schema = z.object({
  hostId: z.string().min(1),
  startsAt: z.string().datetime(),
  note: z.string().trim().max(1000).optional(),
  learnerTz: z.string().refine(isValidTimeZone, "Unknown timezone"),
});

/** Book a slot with a host. Creates the meeting link through the provider when configured. */
export async function POST(req: Request) {
  return withAuth(async (user) => {
    const body = schema.parse(await req.json());
    try {
      const { booking, video } = await createBooking({
        learner: user,
        hostId: body.hostId,
        startsAt: new Date(body.startsAt),
        note: body.note,
        learnerTz: body.learnerTz,
      });
      return json({ booking: serializeBooking(booking, { includeStartUrl: false }), video });
    } catch (err) {
      if (err instanceof SlotUnavailableError) return apiError(409, err.message);
      if (err instanceof BookingRuleError) return apiError(err.status, err.message);
      throw err;
    }
  });
}
