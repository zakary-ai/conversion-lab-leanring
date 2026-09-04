import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icons } from "@/components/ui/icons";

export const metadata = { title: "Admin · Message Oversight" };

/**
 * Super Admin only: platform-wide visibility into direct messages for
 * trust & safety. Every conversation view is written to the audit log.
 */
export default async function AdminMessagesPage() {
  const viewer = await requireRole("SUPER_ADMIN");

  const conversations = await db.dmConversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true, sender: { select: { name: true } } },
      },
      _count: { select: { messages: true } },
    },
  });

  return (
    <div className="animate-rise">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Message Oversight</h1>
        <p className="text-ink-mid text-sm mt-1">
          Direct-message conversations across the platform. Access is restricted to Super Admins
          and every conversation you open is recorded in the audit log.
        </p>
      </header>

      {conversations.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icons.messages className="h-6 w-6" />}
            title="No direct messages yet"
            message="Member conversations will appear here."
          />
        </div>
      ) : (
        <div className="card divide-y divide-edge/60">
          {conversations.map((c) => {
            const last = c.messages[0];
            return (
              <Link
                key={c.id}
                href={`/admin/messages/${c.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-overlay/40 transition-colors"
              >
                <div className="flex -space-x-2 shrink-0">
                  {c.participants.slice(0, 2).map((p) => (
                    <Avatar key={p.id} name={p.user.name} size="sm" className="ring-2 ring-surface" />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {c.participants.map((p) => p.user.name).join(" ↔ ")}
                  </p>
                  {last ? (
                    <p className="text-xs text-ink-mid truncate mt-0.5">
                      <span className="font-medium">{last.sender.name}:</span> {last.content}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-dim mt-0.5">No messages</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-ink-dim">{c._count.messages} messages</p>
                  {last && <p className="text-[11px] text-ink-dim mt-0.5">{timeAgo(last.createdAt, viewer.timezone)}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
