import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { notify } from "@/lib/notifications";

/** Only participants can read a conversation — enforced on every request. */
async function requireParticipant(conversationId: string, userId: string) {
  return db.dmParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const participant = await requireParticipant(id, user.id);
    if (!participant) return apiError(403, "Not your conversation");

    const after = new URL(req.url).searchParams.get("after");
    const messages = await db.dmMessage.findMany({
      where: { conversationId: id, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
      orderBy: { createdAt: after ? "asc" : "desc" },
      take: after ? 100 : 60,
      include: { sender: { select: { id: true, name: true } } },
    });
    const ordered = after ? messages : messages.reverse();

    await db.dmParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

    return json({
      messages: ordered.map((m) => ({
        id: m.id,
        content: m.deletedAt ? "" : m.content,
        deleted: Boolean(m.deletedAt),
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        sender: m.sender,
      })),
    });
  });
}

const sendSchema = z.object({ content: z.string().trim().min(1).max(4000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const participant = await requireParticipant(id, user.id);
    if (!participant) return apiError(403, "Not your conversation");
    const body = sendSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return apiError(400, "Message cannot be empty");

    const message = await db.dmMessage.create({
      data: { conversationId: id, senderId: user.id, content: body.data.content },
      include: { sender: { select: { id: true, name: true } } },
    });
    await db.dmConversation.update({ where: { id }, data: { updatedAt: new Date() } });

    // Notify other participants who haven't been pinged about this convo recently
    const others = await db.dmParticipant.findMany({
      where: { conversationId: id, userId: { not: user.id } },
      select: { userId: true },
    });
    for (const other of others) {
      const recentNotice = await db.notification.findFirst({
        where: {
          userId: other.userId,
          type: "NEW_DM",
          linkUrl: `/messages/${id}`,
          readAt: null,
        },
      });
      if (!recentNotice) {
        await notify({
          userId: other.userId,
          type: "NEW_DM",
          title: `New message from ${user.name}`,
          body: body.data.content.slice(0, 120),
          linkUrl: `/messages/${id}`,
        });
      }
    }

    return json({
      message: {
        id: message.id,
        content: message.content,
        deleted: false,
        createdAt: message.createdAt,
        editedAt: null,
        sender: message.sender,
      },
    });
  });
}
