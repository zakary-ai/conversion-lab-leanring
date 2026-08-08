import { requireUser } from "@/lib/auth";
import { getChannelsForUser } from "@/lib/channels";
import { CommunitySidebar } from "@/components/community/CommunitySidebar";

export default async function CommunityLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const channels = await getChannelsForUser(user);

  return (
    <div className="flex gap-6 h-[calc(100dvh-8.5rem)] lg:h-[calc(100dvh-7rem)] -mb-6">
      <CommunitySidebar
        userStars={user.starBalance}
        channels={channels.map(({ channel, access }) => ({
          id: channel.id,
          name: channel.name,
          section: channel.section,
          readOnly: channel.readOnly,
          locked: !access.allowed,
          requiredStars: !access.allowed && access.reason === "stars" ? access.required ?? null : null,
        }))}
      />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
