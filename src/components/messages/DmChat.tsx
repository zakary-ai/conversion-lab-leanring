"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { formatTime, timeAgo } from "@/lib/format";
import { useTimeZone } from "@/components/time/TimeZoneContext";

type DmMessage = {
  id: string;
  content: string;
  deleted: boolean;
  createdAt: string;
  editedAt: string | null;
  sender: { id: string; name: string };
};

export function DmChat({
  conversationId,
  meId,
  other,
}: {
  conversationId: string;
  meId: string;
  other: { id: string; name: string; lastActiveAt: string | null } | null;
}) {
  const tz = useTimeZone();
  const [messages, setMessages] = useState<DmMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTsRef = useRef<string | null>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const merge = useCallback((incoming: DmMessage[]) => {
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

  useEffect(() => {
    let cancelled = false;
    lastTsRef.current = null;
    setMessages(null);

    async function fetchMessages(after?: string | null) {
      const url = after
        ? `/api/dms/${conversationId}/messages?after=${encodeURIComponent(after)}`
        : `/api/dms/${conversationId}/messages`;
      const res = await fetch(url);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { messages: DmMessage[] };
      if (data.messages.length > 0 || !after) {
        merge(data.messages);
        if (!after) setTimeout(() => scrollToBottom(), 30);
      }
    }
    void fetchMessages();
    const interval = setInterval(() => void fetchMessages(lastTsRef.current), 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId, merge, scrollToBottom]);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/dms/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const data = (await res.json()) as { message: DmMessage };
        merge([data.message]);
        setDraft("");
        setTimeout(() => scrollToBottom(true), 30);
      }
    } finally {
      setSending(false);
    }
  }

  const online = other?.lastActiveAt
    ? Date.now() - new Date(other.lastActiveAt).getTime() < 10 * 60 * 1000
    : false;

  return (
    <div className="card flex-1 flex flex-col overflow-hidden">
      <div className="px-5 py-3 border-b border-edge flex items-center gap-3 shrink-0">
        <Link href="/messages" className="lg:hidden text-xs text-ink-dim">←</Link>
        {other && (
          <>
            <div className="relative">
              <Avatar name={other.name} size="sm" />
              {online && (
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-good border-2 border-surface" />
              )}
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">{other.name}</p>
              <p className="text-[11px] text-ink-dim">
                {online
                  ? "Active now"
                  : other.lastActiveAt
                    ? `Active ${timeAgo(other.lastActiveAt, tz)}`
                    : "Offline"}
              </p>
            </div>
          </>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {messages === null ? (
          <div className="space-y-4 pt-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`flex ${i % 2 ? "justify-end" : ""}`}>
                <div className="skeleton h-9 w-48 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            {other && <Avatar name={other.name} size="lg" />}
            <p className="font-semibold mt-3">{other?.name}</p>
            <p className="text-sm text-ink-mid mt-1">
              This is the beginning of your conversation. Say hello 👋
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
            const own = m.sender.id === meId;
            const prev = messages[i - 1];
            const gap =
              !prev ||
              new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 20 * 60 * 1000;
            return (
              <div key={m.id}>
                {gap && (
                  <p className="text-center text-[10px] text-ink-dim my-3">
                    {timeAgo(m.createdAt, tz)} · {formatTime(m.createdAt, tz)}
                  </p>
                )}
                <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words ${
                      own
                        ? "bg-accent/15 border border-accent/25 text-ink rounded-br-md"
                        : "bg-overlay border border-edge text-ink rounded-bl-md"
                    }`}
                  >
                    {m.deleted ? <em className="text-ink-dim">(deleted)</em> : m.content}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-edge p-3 flex items-end gap-2 shrink-0">
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
          placeholder={other ? `Message ${other.name.split(" ")[0]}` : "Type a message"}
          className="input resize-none max-h-32 flex-1"
        />
        <button className="btn btn-primary shrink-0" onClick={() => void send()} disabled={sending || !draft.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
