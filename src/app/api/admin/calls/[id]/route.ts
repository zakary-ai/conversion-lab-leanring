import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { CallRuleError, cancelCall, deleteCall, syncCallMeeting } from "@/lib/call-service";

const schema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  hostId: z.string().nullable().optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMin: z.number().int().min(5).max(600).optional(),
  minStars: z.number().int().min(0).max(100).optional(),
  maxAttendees: z.number().int().min(1).max(10000).nullable().optional(),
  recordingEnabled: z.boolean().optional(),
  status: z.enum(["SCHEDULED", "LIVE", "ENDED", "CANCELLED"]).optional(),
  // Attach a recording (creates a CallRecording row)
  recording: z
    .object({
      title: z.string().trim().min(1).max(160),
      url: z.string().trim().url(),
      minStars: z.number().int().min(0).max(100).optional(),
    })
    .optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const { recording, scheduledAt, status, ...rest } = body;
    const existing = await db.liveCall.findUnique({ where: { id } });
    if (!existing) return apiError(404, "Call not found");

    try {
      // Cancelling also removes the Zoom meeting (or this occurrence of a series).
      if (status === "CANCELLED") await cancelCall(id, user.id);
    } catch (err) {
      if (err instanceof CallRuleError) return apiError(err.status, err.message);
      throw err;
    }

    const call = await db.liveCall.update({
      where: { id },
      data: {
        ...rest,
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
        ...(status && status !== "CANCELLED" ? { status } : {}),
      },
    });

    // Keep Zoom in step when what/when/how long changed.
    const meetingFieldsChanged =
      rest.title !== undefined || rest.description !== undefined || rest.durationMin !== undefined || scheduledAt !== undefined;
    if (existing.meetingId && meetingFieldsChanged && call.status !== "CANCELLED") {
      await syncCallMeeting(call);
    }

    if (status === "LIVE") {
      const attendees = await db.callAttendee.findMany({ where: { callId: id }, select: { userId: true } });
      await notifyMany(
        attendees.map((a) => a.userId),
        {
          type: "CALL_STARTING",
          title: `${call.title} is starting now`,
          body: call.joinUrl ? "Join on Zoom from the call page." : undefined,
          linkUrl: `/calls/${id}`,
        }
      );
    }

    if (recording) {
      await db.callRecording.create({
        data: {
          callId: id,
          title: recording.title,
          url: recording.url,
          minStars: recording.minStars ?? call.minStars,
          status: "PUBLISHED",
        },
      });
      await audit({ actorId: user.id, action: "call.recording_published", entityType: "call", entityId: id, details: { title: recording.title } });
    }
    return json({ call });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    try {
      await deleteCall(id, user.id);
    } catch (err) {
      if (err instanceof CallRuleError) return apiError(err.status, err.message);
      throw err;
    }
    return json({ ok: true });
  });
}
