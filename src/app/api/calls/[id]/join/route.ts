import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { canAccessCall } from "@/lib/access";
import { getRtcProvider } from "@/lib/providers/rtc";

/**
 * Join a live call. Zoom-hosted calls hand back the Zoom link (the start
 * link for the host and admins); otherwise an embeddable room comes from the
 * RTC provider, or an honest "not configured" response when nothing is set up.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const call = await db.liveCall.findUnique({ where: { id } });
    if (!call || call.status === "CANCELLED") return apiError(404, "Call not found");
    const access = canAccessCall(user, call);
    if (!access.allowed) return apiError(403, "You don't have access to this call yet");

    const markJoined = () =>
      db.callAttendee.upsert({
        where: { callId_userId: { callId: id, userId: user.id } },
        create: { callId: id, userId: user.id, joinedAt: new Date() },
        update: { joinedAt: new Date() },
      });

    if (call.joinUrl) {
      const asHost = Boolean(call.startUrl) && (call.hostId === user.id || isAdmin(user.role));
      await markJoined();
      return json({
        configured: true,
        external: true,
        provider: "Zoom",
        joinUrl: asHost ? call.startUrl : call.joinUrl,
        asHost,
      });
    }

    const provider = getRtcProvider();
    if (!provider.configured) {
      return json({
        configured: false,
        provider: provider.name,
        message:
          "No video provider is connected for this call. The host can connect their Zoom account on their profile, or an administrator can add academy-wide Zoom credentials (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_USER_ID) or DAILY_API_KEY and DAILY_DOMAIN for embedded rooms.",
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

    await markJoined();
    return json({
      configured: true,
      external: false,
      joinUrl: `${provider.getJoinUrl(roomId)}?userName=${encodeURIComponent(user.name)}`,
    });
  });
}
