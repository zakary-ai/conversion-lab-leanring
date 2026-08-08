import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { canAccessChannel } from "@/lib/access";

const schema = z.object({ emoji: z.string().min(1).max(16) });

/** Toggle a reaction on a message. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) return apiError(400, "Invalid reaction");

    const message = await db.message.findUnique({
      where: { id },
      include: { channel: true },
    });
    if (!message || message.deletedAt) return apiError(404, "Message not found");
    const membership = await db.channelMembership.findUnique({
      where: { channelId_userId: { channelId: message.channelId, userId: user.id } },
    });
    const access = canAccessChannel(user, message.channel, Boolean(membership));
    if (!access.allowed) return apiError(403, "No access");

    const existing = await db.messageReaction.findUnique({
      where: {
        messageId_userId_emoji: { messageId: id, userId: user.id, emoji: body.data.emoji },
      },
    });
    if (existing) {
      await db.messageReaction.delete({ where: { id: existing.id } });
    } else {
      await db.messageReaction.create({
        data: { messageId: id, userId: user.id, emoji: body.data.emoji },
      });
    }
    return json({ ok: true, added: !existing });
  });
}
