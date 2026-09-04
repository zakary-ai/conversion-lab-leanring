"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icons } from "@/components/ui/icons";
import { StarIcon } from "@/components/ui/Star";
import { Avatar } from "@/components/ui/Avatar";
import { NotificationsBell } from "./NotificationsBell";
import { CommandPalette } from "./CommandPalette";
import { TimeZoneProvider } from "@/components/time/TimeZoneContext";

export type ShellUser = {
  id: string;
  name: string;
  role: string;
  starBalance: number;
  // Account zone (null until chosen); every client component formats times with it
  timezone: string | null;
  isStaff: boolean;
  isAdmin: boolean;
};

const LEARNER_NAV = [
  { href: "/dashboard", label: "Home", icon: Icons.home },
  { href: "/training", label: "Training", icon: Icons.training },
  { href: "/community", label: "Community", icon: Icons.community },
  { href: "/messages", label: "Messages", icon: Icons.messages, badge: "dm" as const },
  { href: "/calls", label: "Live Calls", icon: Icons.calls },
  { href: "/one-on-ones", label: "1-on-1s", icon: Icons.calendar },
];

const ADMIN_NAV = [
  { href: "/admin", label: "Overview", icon: Icons.chart },
  { href: "/admin/training", label: "Training", icon: Icons.training },
  { href: "/admin/learners", label: "Learners", icon: Icons.users },
  { href: "/admin/stars", label: "Stars", icon: Icons.star },
  { href: "/admin/calls", label: "Live Calls", icon: Icons.calls },
  { href: "/admin/one-on-ones", label: "1-on-1s", icon: Icons.calendar },
  { href: "/admin/settings", label: "Settings", icon: Icons.settings },
  { href: "/admin/audit", label: "Audit Log", icon: Icons.audit },
];

// Super Admin-only: platform-wide DM oversight
const SUPER_ADMIN_NAV = [
  { href: "/admin/messages", label: "Message Oversight", icon: Icons.messages },
];

export function AppShell({
  user,
  unreadNotifications,
  unreadDms,
  children,
}: {
  user: ShellUser;
  unreadNotifications: number;
  unreadDms: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/signin");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/admin" || href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  const nav = (
    <>
      <nav className="space-y-0.5">
        {LEARNER_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive(item.href) ? "nav-item-active" : ""}`}
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
            {item.badge === "dm" && unreadDms > 0 && (
              <span className="ml-auto rounded-full bg-accent text-[#1c1303] text-[10px] font-bold px-1.5 py-0.5 min-w-5 text-center">
                {unreadDms}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {user.isStaff && (
        <div className="mt-6">
          <p className="section-title px-3 mb-2">{user.isAdmin ? "Admin" : "Staff"}</p>
          <nav className="space-y-0.5">
            {[
              ...(user.isAdmin ? ADMIN_NAV : ADMIN_NAV.slice(0, 1)),
              ...(user.role === "SUPER_ADMIN" ? SUPER_ADMIN_NAV : []),
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive(item.href) ? "nav-item-active" : ""}`}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );

  const userCard = (
    <div className="border-t border-edge pt-3 mt-4">
      <Link
        href="/profile"
        className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-overlay transition-colors"
      >
        <Avatar name={user.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{user.name}</p>
          <p className="text-xs text-accent-hi flex items-center gap-1">
            <StarIcon className="h-3 w-3" />
            {user.starBalance} {user.starBalance === 1 ? "Star" : "Stars"}
          </p>
        </div>
      </Link>
      <button
        onClick={() => void signOut()}
        className="w-full text-left text-xs text-ink-dim hover:text-ink px-2 py-1.5 rounded-lg hover:bg-overlay transition-colors"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <TimeZoneProvider timezone={user.timezone}>
    <div className="min-h-dvh flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-edge bg-surface/60 px-3 py-5 sticky top-0 h-dvh overflow-y-auto">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight px-2 mb-6">
          <StarIcon className="h-6 w-6" />
          Conversion Lab
        </Link>
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 text-sm text-ink-dim bg-raised border border-edge rounded-lg px-3 py-2 mb-5 hover:border-edge-strong transition-colors"
        >
          <Icons.search className="h-4 w-4" />
          Search…
          <kbd className="ml-auto text-[10px] border border-edge rounded px-1 py-0.5">⌘K</kbd>
        </button>
        <div className="flex-1">{nav}</div>
        {userCard}
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center gap-3 border-b border-edge bg-bg/90 backdrop-blur px-4 h-14">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="btn btn-ghost p-2 -ml-2">
          <Icons.menu />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight">
          <StarIcon className="h-5 w-5" />
          Conversion Lab
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setPaletteOpen(true)} aria-label="Search" className="btn btn-ghost p-2">
            <Icons.search />
          </button>
          <NotificationsBell initialCount={unreadNotifications} />
        </div>
      </div>

      {/* Mobile slide-over */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 animate-fade" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-surface border-r border-edge px-3 py-5 flex flex-col overflow-y-auto animate-rise">
            <div className="flex items-center justify-between px-2 mb-6">
              <span className="flex items-center gap-2 font-bold tracking-tight">
                <StarIcon className="h-6 w-6" />
                Conversion Lab
              </span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="btn btn-ghost p-1.5">
                <Icons.x />
              </button>
            </div>
            <div className="flex-1">{nav}</div>
            {userCard}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-end gap-2 px-8 h-16 border-b border-edge sticky top-0 bg-bg/85 backdrop-blur z-30">
          <NotificationsBell initialCount={unreadNotifications} />
        </div>
        <main className="flex-1 px-4 lg:px-8 py-6 pt-20 lg:pt-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
    </TimeZoneProvider>
  );
}
