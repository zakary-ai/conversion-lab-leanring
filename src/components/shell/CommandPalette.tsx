"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";
import { LockIcon } from "@/components/ui/Locked";

type Result = {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  locked?: boolean;
};

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = (await res.json()) as { results: Result[] };
          setResults(data.results);
          setSelected(0);
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  function go(r: Result) {
    onClose();
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === "Enter" && results[selected]) go(results[selected]);
  }

  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-xl card-raised shadow-2xl shadow-black/60 animate-pop overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-edge">
          <Icons.search className="h-4 w-4 text-ink-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search training, resources, community, people, jobs…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-ink-dim"
          />
          <kbd className="text-[10px] text-ink-dim border border-edge rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && results.length === 0 && (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-10" />
              ))}
            </div>
          )}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm text-ink-mid text-center py-10">No results for “{query}”.</p>
          )}
          {query.trim().length < 2 && (
            <p className="text-sm text-ink-dim text-center py-10">
              Type at least 2 characters to search everything you have access to.
            </p>
          )}
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <p className="section-title px-4 pt-3 pb-1">{type}</p>
              {items.map((r) => {
                const idx = results.indexOf(r);
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => go(r)}
                    onMouseEnter={() => setSelected(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      idx === selected ? "bg-overlay" : ""
                    }`}
                  >
                    <span className="font-medium truncate">{r.title}</span>
                    {r.subtitle && <span className="text-xs text-ink-dim truncate">{r.subtitle}</span>}
                    {r.locked && <LockIcon className="h-3.5 w-3.5 ml-auto text-ink-dim shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
