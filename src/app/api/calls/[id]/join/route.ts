import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { canAccessCall } from "@/lib/access";
import { getRtcProvider } from "@/lib/providers/rtc";

/**
 * Join a live call. Returns an embeddable room URL through the RTC provider
 * abstraction, or an honest "not configured" response when no provider
 * credentials are present.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const call = await db.liveCall.findUnique({ where: { id } });
    if (!call || call.status === "CANCELLED") return apiError(404, "Call not found");
    const access = canAccessCall(user, call);
    if (!access.allowed) return apiError(403, "You don't have access to this call yet");

    const provider = getRtcProvider();
    if (!provider.configured) {
      return json({
        configured: false,
        provider: provider.name,
        message:
          "The live video provider isn't connected yet. An administrator needs to add DAILY_API_KEY and DAILY_DOMAIN to enable embedded calls.",
      });
    }

    let roomId = call.providerRoomId;
    if (!roomId) {
      const room = await provider.createRoom({
        callId: call.id,
        enableRecording: call.recordingEnabled,
      });
      roomId = room.roomId;
      await db.liveCall.update({ where: { id }, data: { providerRoomId: roomId } });
    }

    await db.callAttendee.upsert({
      where: { callId_userId: { callId: id, userId: user.id } },
      create: { callId: id, userId: user.id, joinedAt: new Date() },
      update: { joinedAt: new Date() },
    });

    return json({
      configured: true,
      joinUrl: `${provider.getJoinUrl(roomId)}?userName=${encodeURIComponent(user.name)}`,
    });
  });
}
