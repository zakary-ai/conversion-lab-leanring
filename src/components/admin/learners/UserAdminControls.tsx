"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserAdminControls({
  user,
  actorRole,
}: {
  user: {
    id: string;
    name: string;
    role: string;
    status: string;
    hasEmail: boolean;
    accessCode: string | null;
  };
  actorRole: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function accessCodeAction(method: "POST" | "DELETE") {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/access-code`, { method });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? "Action failed" });
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function call(path: string, body: unknown) {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? "Action failed" });
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function adjustStars() {
    const n = Number(amount);
    if (!n || !reason.trim()) {
      setFeedback({ ok: false, text: "Enter an amount and a reason — every adjustment is logged." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/stars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: n, reason: reason.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        newBalance?: number;
      };
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? "Adjustment failed" });
        return;
      }
      setFeedback({ ok: true, text: `Recorded. New balance: ${data.newBalance} ⭐` });
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <p className="section-title mb-4">Admin actions</p>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold mb-2">Adjust Stars</p>
          <div className="flex gap-2">
            <input
              type="number"
              className="input w-20"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              title="Positive to award, negative to remove"
            />
            <input
              className="input flex-1"
              placeholder="Reason (required, stored in the ledger)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button className="btn btn-primary" onClick={() => void adjustStars()} disabled={busy}>
              Apply
            </button>
          </div>
          <p className="text-xs text-ink-dim mt-1.5">
            Positive awards, negative deducts. Every change is written to the star ledger with your
            name.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          {actorRole === "SUPER_ADMIN" && (
            <select
              className="input w-auto"
              value={user.role}
              onChange={(e) => void call(`/api/admin/users/${user.id}`, { role: e.target.value })}
              disabled={busy}
              title="Change role"
            >
              <option value="LEARNER">Learner</option>
              <option value="MODERATOR">Moderator</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          )}
          {user.status === "ACTIVE" ? (
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                if (confirm(`Suspend ${user.name}? They will be signed out immediately.`)) {
                  void call(`/api/admin/users/${user.id}`, { status: "SUSPENDED" });
                }
              }}
            >
              Suspend account
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void call(`/api/admin/users/${user.id}`, { status: "ACTIVE" })}
            >
              Reinstate account
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-edge/60">
        <p className="text-sm font-semibold mb-2">Access code</p>
        {user.accessCode ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="input w-auto font-mono tracking-widest select-all">{user.accessCode}</code>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void copyCode(user.accessCode!)}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => {
                if (confirm(`Generate a new code for ${user.name}? The current code will stop working.`)) {
                  void accessCodeAction("POST");
                }
              }}
            >
              Regenerate
            </button>
            <button
              className="btn btn-ghost btn-sm hover:text-bad"
              disabled={busy}
              onClick={() => {
                const warning = user.hasEmail
                  ? `Remove ${user.name}'s access code? They can still sign in with email.`
                  : `Remove ${user.name}'s access code? They have no email, so they won't be able to sign in at all until a new code is generated.`;
                if (confirm(warning)) void accessCodeAction("DELETE");
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-mid">No access code — signs in with email and password.</p>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void accessCodeAction("POST")}>
              Generate code
            </button>
          </div>
        )}
        <p className="text-xs text-ink-dim mt-1.5">
          The access code signs this person in without an email or password. Share it privately.
        </p>
      </div>

      {feedback && (
        <p className={`text-sm mt-3 ${feedback.ok ? "text-good" : "text-bad"}`}>{feedback.text}</p>
      )}
    </div>
  );
}
