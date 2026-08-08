import { db } from "./db";
import { canAccessChannel } from "./access";
import type { User } from "@prisma/client";

/** All channels with the user's access verdict, for sidebars and guards. */
export async function getChannelsForUser(user: User) {
  const [channels, memberships] = await Promise.all([
    db.channel.findMany({ orderBy: [{ section: "asc" }, { sortOrder: "asc" }] }),
    db.channelMembership.findMany({ where: { userId: user.id }, select: { channelId: true, lastReadAt: true } }),
  ]);
  const membershipMap = new Map(memberships.map((m) => [m.channelId, m]));
  return channels
    .map((channel) => {
      const membership = membershipMap.get(channel.id);
      const access = canAccessChannel(user, channel, Boolean(membership));
      return { channel, access, membership };
    })
    .filter(({ access }) => access.allowed || access.reason !== "hidden");
}
