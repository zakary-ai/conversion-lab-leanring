import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessChannel, canPostInChannel } from "@/lib/access";
import { ChannelChat } from "@/components/community/ChannelChat";
import { LockedNotice } from "@/components/ui/Locked";

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const channel = await db.channel.findUnique({ where: { id } });
  if (!channel) notFound();

  const membership = await db.channelMembership.findUnique({
    where: { channelId_userId: { channelId: id, userId: user.id } },
  });
  const access = canAccessChannel(user, channel, Boolean(membership));
  if (!access.allowed && access.reason === "hidden") notFound();

  if (!access.allowed) {
    return (
      <div className="card flex-1 flex flex-col">
        <div className="px-5 py-4 border-b border-edge">
          <Link href="/community" className="lg:hidden text-xs text-ink-dim mb-1 block">← Channels</Link>
          <p className="font-bold"># {channel.name}</p>
          {channel.description && <p className="text-xs text-ink-mid mt-0.5">{channel.description}</p>}
        </div>
        <div className="flex-1 flex items-center justify-center">
          {access.reason === "stars" ? (
            <LockedNotice
              required={access.required ?? 0}
              current={user.starBalance}
              what={`#${channel.name}`}
            />
          ) : (
            <div className="text-center px-6">
              <p className="font-semibold">This channel is private</p>
              <p className="text-sm text-ink-mid mt-1">
                {access.reason === "membership"
                  ? "You need an invitation to join this channel."
                  : "This channel is restricted to staff."}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const canPost = canPostInChannel(user, channel, true).allowed;

  return (
    <ChannelChat
      channel={{
        id: channel.id,
        name: channel.name,
        description: channel.description,
        readOnly: channel.readOnly,
      }}
      me={{ id: user.id, name: user.name, isStaff: isStaff(user.role) }}
      canPost={canPost}
    />
  );
}
