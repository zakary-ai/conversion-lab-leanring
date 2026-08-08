import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { isStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";

const editSchema = z.object({ content: z.string().trim().min(1).max(4000) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const body = editSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return apiError(400, "Message cannot be empty");
    const message = await db.message.findUnique({ where: { id } });
    if (!message || message.deletedAt) return apiError(404, "Message not found");
    if (message.userId !== user.id) return apiError(403, "You can only edit your own messages");
    await db.message.update({
      where: { id },
      data: { content: body.data.content, editedAt: new Date() },
    });
    return json({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const message = await db.message.findUnique({ where: { id } });
    if (!message || message.deletedAt) return apiError(404, "Message not found");

    const own = message.userId === user.id;
    if (!own && !isStaff(user.role)) return apiError(403, "You can't delete this message");

    await db.message.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
    if (!own) {
      await db.moderationAction.create({
        data: {
          actorId: user.id,
          targetId: message.userId,
          action: "delete_message",
          entityType: "message",
          entityId: id,
        },
      });
      await audit({
        actorId: user.id,
        action: "community.message_removed",
        entityType: "message",
        entityId: id,
        details: { channelId: message.channelId, authorId: message.userId },
      });
    }
    return json({ ok: true });
  });
}
