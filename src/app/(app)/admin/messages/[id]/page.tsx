import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { formatDateShort, formatTime } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";

export const metadata = { title: "Admin · Conversation" };

/** Read-only Super Admin view of a DM thread. Every view is audit-logged. */
export default async function AdminConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireRole("SUPER_ADMIN");
  const { id } = await params;

  const conversation = await db.dmConversation.findUnique({
    where: { id },
    include: {
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true } } },
      },
    },
  });
  if (!conversation) notFound();

  // Oversight accountability: record who looked at whose conversation
  await audit({
    actorId: actor.id,
    action: "dm.oversight_view",
    entityType: "dm_conversation",
    entityId: id,
    details: {
      participants: conversation.participants.map((p) => p.user.name),
      messageCount: conversation.messages.length,
    },
  });

  return (
    <div className="animate-rise max-w-2xl">
      <Link href="/admin/messages" className="text-xs text-ink-dim hover:text-ink mb-4 inline-block">
        ← All conversations
      </Link>

      <div className="card p-5 mb-4">
        <p className="section-title mb-3">Participants</p>
        <div className="flex flex-wrap gap-4">
          {conversation.participants.map((p) => (
            <Link
              key={p.id}
              href={`/admin/learners/${p.user.id}`}
              className="flex items-center gap-2.5 hover:bg-overlay rounded-lg px-2 py-1.5 -mx-2 transition-colors"
            >
              <Avatar name={p.user.name} size="sm" />
              <span>
                <span className="block text-sm font-semibold">{p.user.name}</span>
                <span className="block text-xs text-ink-dim">{p.user.email ?? "Access code account"}</span>
              </span>
            </Link>
          ))}
        </div>
        <p className="text-[11px] text-ink-dim mt-4 border-t border-edge pt-3">
          Read-only oversight view. This access has been recorded in the audit log.
        </p>
      </div>

      <div className="card p-5">
        {conversation.messages.length === 0 ? (
          <p className="text-sm text-ink-mid text-center py-8">No messages in this conversation.</p>
        ) : (
          <ul className="space-y-4">
            {conversation.messages.map((m, i) => {
              const prev = conversation.messages[i - 1];
              const newDay =
                !prev || prev.createdAt.toDateString() !== m.createdAt.toDateString();
              return (
                <li key={m.id}>
                  {newDay && (
                    <p className="text-center text-[11px] text-ink-dim my-3">
                      {formatDateShort(m.createdAt)}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Avatar name={m.sender.name} size="xs" className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs">
                        <span className="font-bold">{m.sender.name}</span>
                        <span className="text-ink-dim ml-2">{formatTime(m.createdAt)}</span>
                        {m.editedAt && <span className="text-ink-dim ml-1">(edited)</span>}
                      </p>
                      <p className={`text-sm mt-0.5 whitespace-pre-wrap break-words ${m.deletedAt ? "italic text-ink-dim" : "text-ink-mid"}`}>
                        {m.deletedAt ? "(deleted by sender)" : m.content}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
