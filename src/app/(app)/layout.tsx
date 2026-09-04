import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const [unreadNotifications, dmParticipants] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.dmParticipant.findMany({
      where: { userId: user.id },
      select: {
        lastReadAt: true,
        conversation: {
          select: {
            messages: {
              where: { deletedAt: null, senderId: { not: user.id } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { createdAt: true },
            },
          },
        },
      },
    }),
  ]);
  const unreadDms = dmParticipants.filter((p) => {
    const last = p.conversation.messages[0];
    return last && last.createdAt > p.lastReadAt;
  }).length;

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        role: user.role,
        starBalance: user.starBalance,
        timezone: user.timezone,
        isStaff: isAdmin(user.role) || user.role === "MODERATOR",
        isAdmin: isAdmin(user.role),
      }}
      unreadNotifications={unreadNotifications}
      unreadDms={unreadDms}
    >
      {children}
    </AppShell>
  );
}
