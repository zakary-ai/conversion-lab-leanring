"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icons } from "@/components/ui/icons";
import { timeAgo } from "@/lib/format";
import { useTimeZone } from "@/components/time/TimeZoneContext";

type Conversation = {
  id: string;
  other: { id: string; name: string; lastActiveAt: string | null } | null;
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
};

type SearchUser = {
  id: string;
  name: string;
  role: string;
  starBalance: number;
  profile: { headline: string | null } | null;
};

function isRecentlyActive(lastActiveAt: string | null) {
  return Boolean(lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() < 10 * 60 * 1000);
}

function ConversationListInner() {
  const tz = useTimeZone();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const inConversation = pathname !== "/messages";

  // ?to=userId — start a conversation directly (e.g. from global search)
  useEffect(() => {
    const to = searchParams.get("to");
    if (to) {
      void (async () => {
        const res = await fetch("/api/dms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: to }),
        });
        if (res.ok) {
          const data = (await res.json()) as { conversationId: string };
          router.replace(`/messages/${data.conversationId}`);
        }
      })();
    }
  }, [searchParams, router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/dms");
      if (res.ok && !cancelled) {
        const data = (await res.json()) as { conversations: Conversation[] };
        setConversations(data.conversations);
      }
    }
    void load();
    const interval = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    if (!searching) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = (await res.json()) as { users: SearchUser[] };
        setResults(data.users);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, searching]);

  async function startConversation(userId: string) {
    const res = await fetch("/api/dms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const data = (await res.json()) as { conversationId: string };
      setSearching(false);
      setQuery("");
      router.push(`/messages/${data.conversationId}`);
    }
  }

  return (
    <aside
      className={`${inConversation ? "hidden lg:flex" : "flex"} w-full lg:w-72 shrink-0 flex-col card overflow-hidden`}
    >
      <div className="p-3 border-b border-edge flex items-center justify-between shrink-0">
        <p className="font-bold text-sm px-1">Messages</p>
        <button
          className="btn btn-ghost p-1.5"
          onClick={() => setSearching((v) => !v)}
          aria-label="New conversation"
        >
          {searching ? <Icons.x className="h-4 w-4" /> : <Icons.plus className="h-4 w-4" />}
        </button>
      </div>

      {searching && (
        <div className="p-3 border-b border-edge shrink-0">
          <input
            className="input text-sm"
            placeholder="Search members…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="mt-2 max-h-56 overflow-y-auto space-y-0.5">
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => void startConversation(u.id)}
                className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-overlay transition-colors"
              >
                <Avatar name={u.name} size="sm" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{u.name}</span>
                  <span className="block text-xs text-ink-dim truncate">
                    {u.profile?.headline ?? `${u.starBalance} ⭐`}
                  </span>
                </span>
              </button>
            ))}
            {query.trim().length > 0 && results.length === 0 && (
              <p className="text-xs text-ink-dim text-center py-3">No members found.</p>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {conversations === null ? (
          <div className="p-3 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 items-center">
                <div className="skeleton h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-24" />
                  <div className="skeleton h-3 w-36" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center px-6 py-12">
            <p className="text-3xl mb-3">💬</p>
            <p className="font-semibold text-sm">No conversations yet</p>
            <p className="text-xs text-ink-mid mt-1">
              Connect with other members of the academy.
            </p>
            <button className="btn btn-secondary btn-sm mt-4" onClick={() => setSearching(true)}>
              Find members
            </button>
          </div>
        ) : (
          conversations.map((c) => {
            const active = pathname === `/messages/${c.id}`;
            return (
              <Link
                key={c.id}
                href={`/messages/${c.id}`}
                className={`flex items-center gap-3 px-3 py-3 border-b border-edge/50 transition-colors ${
                  active ? "bg-overlay" : "hover:bg-overlay/50"
                }`}
              >
                <div className="relative shrink-0">
                  <Avatar name={c.other?.name ?? "Conversation"} size="md" />
                  {c.other && isRecentlyActive(c.other.lastActiveAt) && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-good border-2 border-surface" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-sm truncate ${c.unreadCount > 0 ? "font-bold" : "font-semibold"}`}>
                      {c.other?.name ?? "Conversation"}
                    </p>
                    {c.lastMessage && (
                      <span className="text-[10px] text-ink-dim shrink-0">
                        {timeAgo(c.lastMessage.createdAt, tz)}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${c.unreadCount > 0 ? "text-ink font-medium" : "text-ink-dim"}`}>
                    {c.lastMessage?.content ?? "Say hello 👋"}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <span className="rounded-full bg-accent text-[#1c1303] text-[10px] font-bold min-w-5 h-5 px-1.5 flex items-center justify-center shrink-0">
                    {c.unreadCount}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}

export function ConversationList() {
  return (
    <Suspense>
      <ConversationListInner />
    </Suspense>
  );
}
