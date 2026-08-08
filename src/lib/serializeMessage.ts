type MessageWithRelations = {
  id: string;
  content: string;
  parentId: string | null;
  pinned: boolean;
  attachmentUrl: string | null;
  attachmentName: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  user: { id: string; name: string; role: string; starBalance: number };
  reactions: { emoji: string; userId: string }[];
  parent: { id: string; content: string; deletedAt: Date | null; user: { name: string } } | null;
  _count: { replies: number };
};

export function serializeMessage(m: MessageWithRelations) {
  const reactionMap: Record<string, string[]> = {};
  for (const r of m.reactions) (reactionMap[r.emoji] ??= []).push(r.userId);
  return {
    id: m.id,
    content: m.deletedAt ? "" : m.content,
    deleted: Boolean(m.deletedAt),
    parentId: m.parentId,
    parentPreview: m.parent
      ? {
          author: m.parent.user.name,
          content: m.parent.deletedAt ? "(deleted)" : m.parent.content.slice(0, 90),
        }
      : null,
    pinned: m.pinned,
    attachmentUrl: m.attachmentUrl,
    attachmentName: m.attachmentName,
    editedAt: m.editedAt,
    createdAt: m.createdAt,
    replyCount: m._count.replies,
    reactions: reactionMap,
    author: m.user,
  };
}
