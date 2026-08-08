import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { isStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** Moderators+ can pin/unpin messages. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    if (!isStaff(user.role)) return apiError(403, "Moderator permissions required");
    const { id } = await ctx.params;
    const message = await db.message.findUnique({ where: { id } });
    if (!message || message.deletedAt) return apiError(404, "Message not found");
    const updated = await db.message.update({
      where: { id },
      data: { pinned: !message.pinned },
    });
    await db.moderationAction.create({
      data: {
        actorId: user.id,
        action: updated.pinned ? "pin_message" : "unpin_message",
        entityType: "message",
        entityId: id,
      },
    });
    await audit({
      actorId: user.id,
      action: updated.pinned ? "community.message_pinned" : "community.message_unpinned",
      entityType: "message",
      entityId: id,
    });
    return json({ ok: true, pinned: updated.pinned });
  });
}
