"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockIcon } from "@/components/ui/Locked";

type ChannelItem = {
  id: string;
  name: string;
  section: "COMMUNITY" | "ADVANCED" | "STAFF";
  readOnly: boolean;
  locked: boolean;
  requiredStars: number | null;
};

const SECTION_LABELS = { COMMUNITY: "Community", ADVANCED: "Advanced", STAFF: "Staff" };

export function CommunitySidebar({
  channels,
  userStars,
}: {
  channels: ChannelItem[];
  userStars: number;
}) {
  const pathname = usePathname();
  const inChannel = pathname !== "/community";

  const sections = (["COMMUNITY", "ADVANCED", "STAFF"] as const)
    .map((s) => ({ section: s, items: channels.filter((c) => c.section === s) }))
    .filter((s) => s.items.length > 0);

  return (
    <aside
      className={`${inChannel ? "hidden lg:flex" : "flex"} w-full lg:w-56 shrink-0 flex-col card p-3 overflow-y-auto`}
    >
      <p className="section-title px-2 pt-1 pb-2">Channels</p>
      {sections.map(({ section, items }) => (
        <div key={section} className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-dim px-2 mb-1">
            {SECTION_LABELS[section]}
          </p>
          <ul className="space-y-0.5">
            {items.map((c) => {
              const active = pathname === `/community/${c.id}`;
              return (
                <li key={c.id}>
                  <Link
                    href={`/community/${c.id}`}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-overlay text-ink font-semibold"
                        : c.locked
                          ? "text-ink-dim hover:bg-overlay/50"
                          : "text-ink-mid hover:bg-overlay hover:text-ink"
                    }`}
                  >
                    <span className="text-ink-dim">#</span>
                    <span className="truncate">{c.name}</span>
                    {c.locked && (
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-ink-dim shrink-0">
                        <LockIcon className="h-3 w-3" />
                        {c.requiredStars !== null && `${userStars}/${c.requiredStars}★`}
                      </span>
                    )}
                    {!c.locked && c.readOnly && (
                      <span className="ml-auto text-[9px] uppercase tracking-wide text-ink-dim shrink-0">
                        read
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}
