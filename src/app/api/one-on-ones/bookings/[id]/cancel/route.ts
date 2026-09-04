import { z } from "zod";
import { withAuth, json, apiError } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { BookingRuleError, cancelBooking, serializeBooking } from "@/lib/booking-service";

const schema = z.object({ reason: z.string().trim().max(300).optional() });

/** Cancel a booking. Allowed for the learner, the host, or an admin. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const body = schema.parse((await req.json().catch(() => ({}))) ?? {});
    try {
      const booking = await cancelBooking({ bookingId: id, actor: user, reason: body.reason });
      const includeStartUrl = user.id === booking.hostId || isAdmin(user.role);
      return json({ booking: serializeBooking(booking, { includeStartUrl }) });
    } catch (err) {
      if (err instanceof BookingRuleError) return apiError(err.status, err.message);
      throw err;
    }
  });
}
