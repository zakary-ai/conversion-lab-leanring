import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  hostId: z.string().nullable().optional(),
  scheduledAt: z.string().datetime(),
  durationMin: z.number().int().min(5).max(600).optional(),
  minStars: z.number().int().min(0).max(100).optional(),
  maxAttendees: z.number().int().min(1).max(10000).nullable().optional(),
  recordingEnabled: z.boolean().optional(),
});

export async function POST(req: Request) {
  return withRole("ADMIN", async (user) => {
    const body = schema.parse(await req.json());
    const call = await db.liveCall.create({
      data: { ...body, scheduledAt: new Date(body.scheduledAt) },
    });
    await audit({ actorId: user.id, action: "call.create", entityType: "call", entityId: call.id, details: { title: call.title } });

    // Notify eligible learners about the new session
    const eligible = await db.user.findMany({
      where: { status: "ACTIVE", starBalance: { gte: call.minStars }, role: "LEARNER" },
      select: { id: true },
    });
    await notifyMany(
      eligible.map((u) => u.id),
      {
        type: "CALL_UPCOMING",
        title: `New live call: ${call.title}`,
        body: call.scheduledAt.toLocaleString(),
        linkUrl: `/calls/${call.id}`,
      }
    );
    return json({ call });
  });
}
