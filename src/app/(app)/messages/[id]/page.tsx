import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConversationList } from "@/components/messages/ConversationList";
import { DmChat } from "@/components/messages/DmChat";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  // Backend enforcement: only participants can open a conversation
  const participant = await db.dmParticipant.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    include: {
      conversation: {
        include: {
          participants: {
            include: { user: { select: { id: true, name: true, lastActiveAt: true } } },
          },
        },
      },
    },
  });
  if (!participant) notFound();

  const other = participant.conversation.participants.find((p) => p.userId !== user.id)?.user;

  return (
    <>
      <ConversationList />
      <DmChat
        conversationId={id}
        meId={user.id}
        other={
          other
            ? { id: other.id, name: other.name, lastActiveAt: other.lastActiveAt?.toISOString() ?? null }
            : null
        }
      />
    </>
  );
}
