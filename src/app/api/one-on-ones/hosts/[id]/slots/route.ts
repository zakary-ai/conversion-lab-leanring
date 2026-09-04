import { withAuth, json, apiError } from "@/lib/api";
import { canBookOneOnOne } from "@/lib/access";
import { getHostSlots } from "@/lib/booking-service";

const MAX_RANGE_MS = 35 * 24 * 60 * 60 * 1000;

/** Open slots for a host between ?from and ?to (ISO), rendered client-side in the learner's zone. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const access = await canBookOneOnOne(user);
    if (!access.allowed) return apiError(403, "You can't book 1-on-1s yet");

    const { id } = await ctx.params;
    const url = new URL(req.url);
    const from = new Date(url.searchParams.get("from") ?? "");
    const to = new Date(url.searchParams.get("to") ?? "");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return apiError(400, "from/to must be valid ISO dates with to after from");
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) return apiError(400, "Range too large");

    const result = await getHostSlots(id, from, to);
    if (!result) return apiError(404, "This host isn't accepting bookings");
    return json({
      slots: result.slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
      slotMinutes: result.slotMinutes,
      timezone: result.timezone,
    });
  });
}
