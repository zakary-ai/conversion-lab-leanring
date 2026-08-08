"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserAdminControls({
  user,
  actorRole,
}: {
  user: { id: string; name: string; role: string; status: string };
  actorRole: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

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
      {feedback && (
        <p className={`text-sm mt-3 ${feedback.ok ? "text-good" : "text-bad"}`}>{feedback.text}</p>
      )}
    </div>
  );
}
