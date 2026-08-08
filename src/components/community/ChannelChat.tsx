"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icons } from "@/components/ui/icons";
import { StarIcon } from "@/components/ui/Star";
import { timeAgo } from "@/lib/format";

export type ChatMessage = {
  id: string;
  content: string;
  deleted: boolean;
  parentId: string | null;
  parentPreview: { author: string; content: string } | null;
  pinned: boolean;
  attachmentUrl: string | null;
  attachmentName: string | null;
  editedAt: string | null;
  createdAt: string;
  replyCount: number;
  reactions: Record<string, string[]>;
  author: { id: string; name: string; role: string; starBalance: number };
};

const EMOJIS = ["👍", "🔥", "💯", "🎯", "👏", "😂"];

export function ChannelChat({
  channel,
  me,
  canPost,
}: {
  channel: { id: string; name: string; description: string | null; readOnly: boolean };
  me: { id: string; name: string; isStaff: boolean };
  canPost: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTsRef = useRef<string | null>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const map = new Map((prev ?? []).map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      const merged = [...map.values()].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const last = merged[merged.length - 1];
      if (last) lastTsRef.current = last.createdAt;
      return merged;
    });
  }, []);

  // Initial load + poll (updates arrive without page refreshes)
  useEffect(() => {
    let cancelled = false;
    lastTsRef.current = null;
    setMessages(null);

    async function fetchMessages(after?: string | null) {
      const url = after
        ? `/api/channels/${channel.id}/messages?after=${encodeURIComponent(after)}`
        : `/api/channels/${channel.id}/messages`;
      const res = await fetch(url);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { messages: ChatMessage[] };
      if (data.messages.length > 0 || !after) {
        mergeMessages(data.messages);
        if (!after) setTimeout(() => scrollToBottom(), 30);
      }
    }

    void fetchMessages();
    const interval = setInterval(() => void fetchMessages(lastTsRef.current), 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channel.id, mergeMessages, scrollToBottom]);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, parentId: replyTo?.id }),
      });
      const data = (await res.json()) as { message?: ChatMessage; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not send message");
        return;
      }
      if (data.message) mergeMessages([data.message]);
      setDraft("");
      setReplyTo(null);
      setTimeout(() => scrollToBottom(true), 30);
    } finally {
      setSending(false);
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    // Optimistic update
    setMessages((prev) =>
      prev?.map((m) => {
        if (m.id !== messageId) return m;
        const users = m.reactions[emoji] ?? [];
        const has = users.includes(me.id);
        return {
          ...m,
          reactions: {
            ...m.reactions,
            [emoji]: has ? users.filter((u) => u !== me.id) : [...users, me.id],
          },
        };
      }) ?? null
    );
    await fetch(`/api/messages/${messageId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
  }

  async function deleteMessage(id: string) {
    setMessages((prev) => prev?.map((m) => (m.id === id ? { ...m, deleted: true, content: "" } : m)) ?? null);
    await fetch(`/api/messages/${id}`, { method: "DELETE" });
  }

  async function togglePin(id: string) {
    const res = await fetch(`/api/messages/${id}/pin`, { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { pinned: boolean };
      setMessages((prev) => prev?.map((m) => (m.id === id ? { ...m, pinned: data.pinned } : m)) ?? null);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const res = await fetch(`/api/messages/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editing.content }),
    });
    if (res.ok) {
      setMessages(
        (prev) =>
          prev?.map((m) =>
            m.id === editing.id
              ? { ...m, content: editing.content, editedAt: new Date().toISOString() }
              : m
          ) ?? null
      );
      setEditing(null);
    }
  }

  const pinned = messages?.filter((m) => m.pinned && !m.deleted) ?? [];

  return (
    <div className="card flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-edge shrink-0">
        <Link href="/community" className="lg:hidden text-xs text-ink-dim mb-1 block">
          ← Channels
        </Link>
        <div className="flex items-baseline gap-3">
          <p className="font-bold">
            <span className="text-ink-dim mr-0.5">#</span> {channel.name}
          </p>
          {channel.description && (
            <p className="text-xs text-ink-mid truncate">{channel.description}</p>
          )}
          {channel.readOnly && <span className="chip ml-auto shrink-0">Read-only</span>}
        </div>
      </div>

      {/* Pinned */}
      {pinned.length > 0 && (
        <div className="px-5 py-2 border-b border-edge bg-accent/[0.04] flex items-start gap-2 text-xs shrink-0">
          <Icons.pin className="h-3.5 w-3.5 text-accent-hi mt-0.5 shrink-0" />
          <p className="text-ink-mid truncate">
            <span className="font-semibold text-ink">{pinned[pinned.length - 1].author.name}: </span>
            {pinned[pinned.length - 1].content}
          </p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
        {messages === null ? (
          <div className="space-y-4 pt-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-32" />
                  <div className="skeleton h-4 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <p className="text-3xl mb-3">💬</p>
            <p className="font-semibold">This is the start of #{channel.name}</p>
            <p className="text-sm text-ink-mid mt-1">Be the first to post.</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const compact =
              prev &&
              prev.author.id === m.author.id &&
              !m.parentPreview &&
              new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 4 * 60 * 1000;
            return (
              <MessageRow
                key={m.id}
                message={m}
                compact={Boolean(compact)}
                me={me}
                onReact={toggleReaction}
                onReply={() => setReplyTo(m)}
                onDelete={() => void deleteMessage(m.id)}
                onPin={() => void togglePin(m.id)}
                onEdit={() => setEditing({ id: m.id, content: m.content })}
                editing={editing?.id === m.id ? editing : null}
                onEditChange={(content) => setEditing({ id: m.id, content })}
                onEditSave={() => void saveEdit()}
                onEditCancel={() => setEditing(null)}
              />
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-edge p-3 shrink-0">
        {replyTo && (
          <div className="flex items-center gap-2 text-xs text-ink-mid bg-overlay rounded-lg px-3 py-2 mb-2">
            <Icons.reply className="h-3 w-3 shrink-0" />
            Replying to <span className="font-semibold text-ink">{replyTo.author.name}</span>
            <span className="truncate">— {replyTo.content.slice(0, 60)}</span>
            <button onClick={() => setReplyTo(null)} className="ml-auto hover:text-ink" aria-label="Cancel reply">
              <Icons.x className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {error && <p className="text-xs text-bad px-1 pb-2">{error}</p>}
        {canPost ? (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={`Message #${channel.name}`}
              className="input resize-none max-h-32 flex-1"
            />
            <button
              className="btn btn-primary shrink-0"
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
            >
              Send
            </button>
          </div>
        ) : (
          <p className="text-xs text-ink-dim text-center py-2">
            {channel.readOnly ? "This channel is read-only." : "You can't post here."}
          </p>
        )}
      </div>
    </div>
  );
}

function MessageRow({
  message: m,
  compact,
  me,
  onReact,
  onReply,
  onDelete,
  onPin,
  onEdit,
  editing,
  onEditChange,
  onEditSave,
  onEditCancel,
}: {
  message: ChatMessage;
  compact: boolean;
  me: { id: string; name: string; isStaff: boolean };
  onReact: (id: string, emoji: string) => void;
  onReply: () => void;
  onDelete: () => void;
  onPin: () => void;
  onEdit: () => void;
  editing: { id: string; content: string } | null;
  onEditChange: (content: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const own = m.author.id === me.id;
  const isStaffAuthor = m.author.role === "ADMIN" || m.author.role === "SUPER_ADMIN" || m.author.role === "MODERATOR";

  if (m.deleted) {
    return (
      <div className={`${compact ? "pl-12" : "pl-12 mt-3"} text-xs italic text-ink-dim py-0.5`}>
        (message removed)
      </div>
    );
  }

  return (
    <div className={`group relative flex gap-3 rounded-lg px-2 -mx-2 py-0.5 hover:bg-overlay/40 ${compact ? "" : "mt-3"}`}>
      <div className="w-9 shrink-0">
        {!compact && <Avatar name={m.author.name} size="sm" />}
      </div>
      <div className="min-w-0 flex-1">
        {m.parentPreview && (
          <p className="text-[11px] text-ink-dim flex items-center gap-1 mb-0.5">
            <Icons.reply className="h-3 w-3" />
            <span className="font-semibold">{m.parentPreview.author}</span>
            <span className="truncate">— {m.parentPreview.content}</span>
          </p>
        )}
        {!compact && (
          <p className="text-sm leading-tight">
            <span className="font-bold">{m.author.name}</span>
            {isStaffAuthor && <span className="chip chip-info ml-1.5 align-middle">Staff</span>}
            {!isStaffAuthor && m.author.starBalance > 0 && (
              <span className="text-[10px] text-accent-hi ml-1.5 inline-flex items-center gap-0.5 align-middle">
                <StarIcon className="h-2.5 w-2.5" />
                {m.author.starBalance}
              </span>
            )}
            <span className="text-[11px] text-ink-dim ml-2">{timeAgo(m.createdAt)}</span>
            {m.pinned && <Icons.pin className="h-3 w-3 inline ml-1.5 text-accent-hi" />}
          </p>
        )}
        {editing ? (
          <div className="mt-1 flex gap-2">
            <input
              className="input py-1.5 text-sm"
              value={editing.content}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onEditSave();
                if (e.key === "Escape") onEditCancel();
              }}
              autoFocus
            />
            <button className="btn btn-primary btn-sm" onClick={onEditSave}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={onEditCancel}>Cancel</button>
          </div>
        ) : (
          <p className="text-sm text-ink-mid whitespace-pre-wrap break-words">
            {m.content}
            {m.editedAt && <span className="text-[10px] text-ink-dim ml-1.5">(edited)</span>}
          </p>
        )}

        {/* Reactions */}
        {Object.entries(m.reactions).some(([, users]) => users.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(m.reactions)
              .filter(([, users]) => users.length > 0)
              .map(([emoji, users]) => (
                <button
                  key={emoji}
                  onClick={() => onReact(m.id, emoji)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    users.includes(me.id)
                      ? "border-accent/50 bg-accent/10 text-accent-hi"
                      : "border-edge bg-raised text-ink-mid hover:border-edge-strong"
                  }`}
                >
                  {emoji} {users.length}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute -top-3 right-2 hidden group-hover:flex items-center gap-0.5 card-raised px-1 py-0.5 shadow-lg shadow-black/30">
        <div className="relative">
          <button
            className="btn btn-ghost p-1.5 text-sm"
            onClick={() => setShowPicker((v) => !v)}
            aria-label="Add reaction"
          >
            🙂
          </button>
          {showPicker && (
            <div className="absolute right-0 top-8 z-20 card-raised flex gap-0.5 p-1.5 shadow-xl shadow-black/40">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  className="hover:bg-overlay rounded p-1 text-base"
                  onClick={() => {
                    onReact(m.id, e);
                    setShowPicker(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-ghost p-1.5" onClick={onReply} aria-label="Reply">
          <Icons.reply className="h-3.5 w-3.5" />
        </button>
        {own && (
          <button className="btn btn-ghost p-1.5" onClick={onEdit} aria-label="Edit">
            <Icons.edit className="h-3.5 w-3.5" />
          </button>
        )}
        {me.isStaff && (
          <button className="btn btn-ghost p-1.5" onClick={onPin} aria-label={m.pinned ? "Unpin" : "Pin"}>
            <Icons.pin className={`h-3.5 w-3.5 ${m.pinned ? "text-accent-hi" : ""}`} />
          </button>
        )}
        {(own || me.isStaff) && (
          <button className="btn btn-ghost p-1.5 hover:text-bad" onClick={onDelete} aria-label="Delete">
            <Icons.trash className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
