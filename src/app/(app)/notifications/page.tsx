import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icons } from "@/components/ui/icons";
import { MarkAllReadButton } from "@/components/notifications/MarkAllReadButton";

export const metadata = { title: "Notifications" };

const TYPE_ICONS: Record<string, string> = {
  STAR_EARNED: "⭐",
  CONTENT_UNLOCKED: "🔓",
  QUIZ_RESULT: "📝",
  MODULE_AVAILABLE: "📚",
  CALL_UPCOMING: "📅",
  CALL_STARTING: "🔴",
  NEW_DM: "💬",
  MENTION: "@",
  REPLY: "↩",
  BOOKING_CONFIRMED: "📆",
  BOOKING_CANCELLED: "🚫",
  SYSTEM: "ℹ️",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="animate-rise max-w-2xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-ink-mid text-sm mt-1">
            {unread > 0 ? `${unread} unread` : "You're all caught up."}
          </p>
        </div>
        {unread > 0 && <MarkAllReadButton />}
      </header>

      {notifications.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icons.bell className="h-6 w-6" />}
            title="No notifications yet"
            message="Stars, unlocks, quiz results, live calls, and messages will show up here."
          />
        </div>
      ) : (
        <div className="card divide-y divide-edge overflow-hidden">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={n.linkUrl ?? "#"}
              className={`flex gap-4 px-5 py-4 hover:bg-overlay/50 transition-colors ${
                n.readAt ? "opacity-60" : ""
              }`}
            >
              <span className="text-xl leading-none mt-0.5">{TYPE_ICONS[n.type] ?? "•"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug">{n.title}</span>
                {n.body && <span className="block text-sm text-ink-mid mt-0.5">{n.body}</span>}
                <span className="block text-xs text-ink-dim mt-1">{timeAgo(n.createdAt)}</span>
              </span>
              {!n.readAt && <span className="mt-2 h-2 w-2 rounded-full bg-accent shrink-0" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
