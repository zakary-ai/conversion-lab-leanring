import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { canAccessCall } from "@/lib/access";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const call = await db.liveCall.findUnique({
      where: { id },
      include: { _count: { select: { attendees: true } } },
    });
    if (!call || call.status === "CANCELLED") return apiError(404, "Call not found");
    const access = canAccessCall(user, call);
    if (!access.allowed) return apiError(403, "You don't have access to this call yet");

    const existing = await db.callAttendee.findUnique({
      where: { callId_userId: { callId: id, userId: user.id } },
    });
    if (existing) {
      await db.callAttendee.delete({ where: { id: existing.id } });
      return json({ ok: true, attending: false });
    }
    if (call.maxAttendees && call._count.attendees >= call.maxAttendees) {
      return apiError(409, "This call is full");
    }
    await db.callAttendee.create({ data: { callId: id, userId: user.id } });
    return json({ ok: true, attending: true });
  });
}
