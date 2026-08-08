"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEMO_ACCOUNTS = [
  { email: "jordan@demo.conversionlab.io", label: "New learner", detail: "0 Stars" },
  { email: "alex@demo.conversionlab.io", label: "Alex Carter", detail: "2 Stars" },
  { email: "taylor@demo.conversionlab.io", label: "Taylor Brooks", detail: "5 Stars" },
  { email: "morgan@demo.conversionlab.io", label: "Moderator", detail: "Staff" },
  { email: "admin@demo.conversionlab.io", label: "Admin", detail: "Staff" },
  { email: "owner@demo.conversionlab.io", label: "Super Admin", detail: "Staff" },
];

/**
 * One-click role switching for evaluating the product. Renders nothing unless
 * the demo endpoint is enabled server-side (DEMO_MODE=true).
 */
export function DemoSwitcher() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  async function loginAs(email: string) {
    setBusy(email);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 404) {
        setHidden(true);
        return;
      }
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 border-t border-edge pt-5">
      <p className="section-title mb-3">Demo accounts</p>
      <div className="grid grid-cols-2 gap-2">
        {DEMO_ACCOUNTS.map((acc) => (
          <button
            key={acc.email}
            onClick={() => void loginAs(acc.email)}
            disabled={busy !== null}
            className="card-raised card-hover px-3 py-2 text-left disabled:opacity-50"
          >
            <span className="block text-sm font-semibold">
              {busy === acc.email ? "Signing in…" : acc.label}
            </span>
            <span className="block text-xs text-ink-dim">{acc.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
