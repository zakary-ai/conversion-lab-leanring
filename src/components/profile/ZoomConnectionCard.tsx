"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ZoomConnectionSummary } from "@/lib/zoom-connections";

/**
 * Where a staff member connects their own Zoom account. The secret is sent
 * once, verified server-side and never shown again.
 */
export function ZoomConnectionCard({
  initial,
  academyConfigured,
}: {
  initial: ZoomConnectionSummary | null;
  /** Academy-wide ZOOM_* env credentials exist, so hosts get links even without their own */
  academyConfigured: boolean;
}) {
  const router = useRouter();
  const [connection, setConnection] = useState(initial);
  const [editing, setEditing] = useState(initial === null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [zoomUserId, setZoomUserId] = useState(initial?.zoomUserId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSave = Boolean(accountId.trim() && clientId.trim() && zoomUserId.trim() && (clientSecret.trim() || connection));

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/profile/zoom", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: accountId.trim(), clientId: clientId.trim(), clientSecret: clientSecret.trim(), zoomUserId: zoomUserId.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; connection?: ZoomConnectionSummary };
      if (!res.ok || !data.connection) {
        setError(data.error ?? "Could not save your Zoom credentials");
        return;
      }
      setConnection(data.connection);
      setClientSecret("");
      setEditing(false);
      setNotice("Connected — Zoom accepted the credentials.");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/profile/zoom", { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not disconnect Zoom");
        return;
      }
      setConnection(null);
      setConfirmingRemove(false);
      setAccountId("");
      setClientId("");
      setClientSecret("");
      setZoomUserId("");
      setEditing(true);
      setNotice("Disconnected. Links already created keep working.");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {connection && !editing ? (
        <div className="space-y-3">
          <p className="chip chip-good">✓ Connected as {connection.zoomUserId}</p>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-dim">Account ID</dt>
            <dd className="font-mono text-xs break-all">{connection.accountId}</dd>
            <dt className="text-ink-dim">Client ID</dt>
            <dd className="font-mono text-xs break-all">{connection.clientId}</dd>
            <dt className="text-ink-dim">Client secret</dt>
            <dd className="text-xs">Saved and encrypted — never shown again</dd>
            {connection.verifiedAt && (
              <>
                <dt className="text-ink-dim">Last verified</dt>
                <dd className="text-xs">{new Date(connection.verifiedAt).toLocaleString()}</dd>
              </>
            )}
          </dl>
          <p className="text-xs text-ink-dim">Calls and 1-on-1s you host are created on this Zoom account.</p>
          {confirmingRemove ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Remove your Zoom credentials? Existing links keep working.</span>
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => void remove()}>
                {busy ? "Removing…" : "Yes, disconnect"}
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmingRemove(false)}>Keep</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(true); setNotice(null); }}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingRemove(true)}>Disconnect</button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {!connection && (
            <p className="text-sm text-ink-mid">
              {academyConfigured
                ? "Sessions you host currently use the academy's Zoom account. Connect your own to create them on your account instead."
                : "Without this, calls and 1-on-1s you host are scheduled without a Zoom link."}
            </p>
          )}
          <div className="rounded-lg border border-edge/60 bg-overlay/40 p-3 text-xs text-ink-mid space-y-1">
            <p className="font-semibold text-ink">How to get these</p>
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>
                Go to{" "}
                <a href="https://marketplace.zoom.us/develop/create" target="_blank" rel="noreferrer" className="underline hover:text-accent-hi">
                  marketplace.zoom.us → Develop → Build App
                </a>{" "}
                and choose <strong>Server-to-Server OAuth</strong>.
              </li>
              <li>Copy the Account ID, Client ID and Client Secret from the app&apos;s credentials tab.</li>
              <li>
                Add the scopes <code>meeting:write:admin</code>, <code>meeting:update:admin</code> and <code>meeting:delete:admin</code>, then activate the app.
              </li>
            </ol>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="zoom-account">Account ID</label>
              <input id="zoom-account" className="input font-mono text-sm" autoComplete="off" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="zoom-client">Client ID</label>
              <input id="zoom-client" className="input font-mono text-sm" autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="zoom-secret">Client secret</label>
              <input
                id="zoom-secret"
                className="input font-mono text-sm"
                type="password"
                autoComplete="new-password"
                value={clientSecret}
                placeholder={connection ? "Leave blank to keep the saved secret" : ""}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="zoom-user">Zoom user email</label>
              <input id="zoom-user" className="input" type="email" autoComplete="off" value={zoomUserId} placeholder="you@company.com" onChange={(e) => setZoomUserId(e.target.value)} />
              <p className="text-xs text-ink-dim mt-1">A licensed user on that Zoom account — usually you. Meetings are created under this user.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" disabled={busy || !canSave} onClick={() => void save()}>
              {busy ? "Checking with Zoom…" : "Test & save"}
            </button>
            {connection && (
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                  setAccountId(connection.accountId);
                  setClientId(connection.clientId);
                  setZoomUserId(connection.zoomUserId);
                  setClientSecret("");
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="text-sm text-bad bg-bad/10 border border-bad/25 rounded-lg px-3 py-2 animate-fade">{error}</p>}
      {notice && <p className="text-sm text-good animate-fade">{notice}</p>}
    </div>
  );
}
