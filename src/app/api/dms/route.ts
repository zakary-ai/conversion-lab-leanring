import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { isStaff } from "@/lib/auth";

export async function GET() {
  return withAuth(async (user) => {
    const participants = await db.dmParticipant.findMany({
      where: { userId: user.id },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, name: true, lastActiveAt: true, role: true } },
              },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { content: true, createdAt: true, senderId: true },
            },
          },
        },
      },
    });

    const conversations = await Promise.all(
      participants.map(async (p) => {
        const others = p.conversation.participants.filter((x) => x.userId !== user.id);
        const last = p.conversation.messages[0] ?? null;
        const unreadCount = await db.dmMessage.count({
          where: {
            conversationId: p.conversationId,
            senderId: { not: user.id },
            deletedAt: null,
            createdAt: { gt: p.lastReadAt },
          },
        });
        return {
          id: p.conversationId,
          isGroup: p.conversation.isGroup,
          other: others[0]
            ? {
                id: others[0].user.id,
                name: others[0].user.name,
                lastActiveAt: others[0].user.lastActiveAt,
              }
            : null,
          lastMessage: last,
          unreadCount,
        };
      })
    );

    conversations.sort((a, b) => {
      const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bt - at;
    });
    return json({ conversations });
  });
}

const createSchema = z.object({ userId: z.string().min(1) });

/** Find or create a 1:1 conversation (group DMs use the same tables later). */
export async function POST(req: Request) {
  return withAuth(async (user) => {
    const body = createSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return apiError(400, "Invalid request");
    if (body.data.userId === user.id) return apiError(400, "You can't message yourself");

    if (!isStaff(user.role)) {
      const canDm = await getSetting("community.learnersCanDm");
      if (!canDm) return apiError(403, "Direct messages are currently disabled");
    }

    const other = await db.user.findUnique({ where: { id: body.data.userId } });
    if (!other || other.status === "SUSPENDED") return apiError(404, "User not found");

    const existing = await db.dmConversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: user.id } } },
          { participants: { some: { userId: other.id } } },
        ],
      },
    });
    if (existing) return json({ conversationId: existing.id });

    const conversation = await db.dmConversation.create({
      data: {
        isGroup: false,
        participants: { create: [{ userId: user.id }, { userId: other.id }] },
      },
    });
    return json({ conversationId: conversation.id });
  });
}
