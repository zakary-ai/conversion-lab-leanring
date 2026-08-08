import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { canAccessChannel, canPostInChannel } from "@/lib/access";
import { getSetting } from "@/lib/settings";
import { isStaff } from "@/lib/auth";
import { sendMentionNotifications } from "@/lib/progress";
import { notify } from "@/lib/notifications";
import { serializeMessage } from "@/lib/serializeMessage";

async function loadChannelForUser(channelId: string, userId: string) {
  const [channel, membership] = await Promise.all([
    db.channel.findUnique({ where: { id: channelId } }),
    db.channelMembership.findUnique({
      where: { channelId_userId: { channelId, userId } },
    }),
  ]);
  return { channel, membership };
}

const MESSAGE_INCLUDE = {
  user: { select: { id: true, name: true, role: true, starBalance: true } },
  reactions: { select: { emoji: true, userId: true } },
  parent: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      user: { select: { name: true } },
    },
  },
  _count: { select: { replies: true } },
} as const;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const { channel, membership } = await loadChannelForUser(id, user.id);
    if (!channel) return apiError(404, "Channel not found");
    const access = canAccessChannel(user, channel, Boolean(membership));
    if (!access.allowed) return apiError(403, "You don't have access to this channel");

    const after = new URL(req.url).searchParams.get("after");
    const messages = await db.message.findMany({
      where: {
        channelId: id,
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      },
      orderBy: { createdAt: after ? "asc" : "desc" },
      take: after ? 100 : 60,
      include: MESSAGE_INCLUDE,
    });
    const ordered = after ? messages : messages.reverse();

    // Track read position
    await db.channelMembership.upsert({
      where: { channelId_userId: { channelId: id, userId: user.id } },
      create: { channelId: id, userId: user.id, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });

    return json({
      messages: ordered.map(serializeMessage),
      canPost: canPostInChannel(user, channel, true).allowed,
    });
  });
}

const postSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  parentId: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const body = postSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return apiError(400, "Message cannot be empty");

    const { channel, membership } = await loadChannelForUser(id, user.id);
    if (!channel) return apiError(404, "Channel not found");
    const access = canPostInChannel(user, channel, Boolean(membership));
    if (!access.allowed) return apiError(403, "You can't post in this channel");

    if (!isStaff(user.role)) {
      const learnersCanPost = await getSetting("community.learnersCanPost");
      if (!learnersCanPost) return apiError(403, "Posting is currently limited to staff");
      const mute = await db.moderationAction.findFirst({
        where: {
          targetId: user.id,
          action: "mute_user",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (mute) return apiError(403, "You are muted in the community right now");
    }

    if (body.data.parentId) {
      const parent = await db.message.findUnique({ where: { id: body.data.parentId } });
      if (!parent || parent.channelId !== id) return apiError(400, "Invalid thread parent");
    }

    const message = await db.message.create({
      data: {
        channelId: id,
        userId: user.id,
        content: body.data.content,
        parentId: body.data.parentId ?? null,
      },
      include: MESSAGE_INCLUDE,
    });

    // Reply notification
    if (message.parent && message.parent.user) {
      const parentAuthor = await db.message.findUnique({
        where: { id: message.parentId! },
        select: { userId: true },
      });
      if (parentAuthor && parentAuthor.userId !== user.id) {
        await notify({
          userId: parentAuthor.userId,
          type: "REPLY",
          title: `${user.name} replied to you in #${channel.name}`,
          body: body.data.content.slice(0, 140),
          linkUrl: `/community/${channel.id}`,
        });
      }
    }

    // Mention notifications (members active in this channel)
    if (body.data.content.includes("@")) {
      const candidates = await db.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        take: 500,
      });
      await sendMentionNotifications({
        content: body.data.content,
        authorId: user.id,
        authorName: user.name,
        channelName: channel.name,
        channelId: channel.id,
        candidates,
      });
    }

    return json({ message: serializeMessage(message) });
  });
}
