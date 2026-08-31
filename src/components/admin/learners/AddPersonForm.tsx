"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";

/**
 * Admin "add a person without an email": creates the account and shows the
 * generated access code once, with a copy button. The code stays viewable on
 * the learner's admin page.
 */
export function AddPersonForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ name: string; accessCode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    if (name.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: { name: string };
        accessCode?: string;
      };
      if (!res.ok || !data.accessCode) {
        setError(data.error ?? "Couldn't create the account");
        return;
      }
      setCreated({ name: data.user?.name ?? name.trim(), accessCode: data.accessCode });
      setName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icons.plus className="h-4 w-4" />
        Add person
      </button>
    );
  }

  return (
    <div className="card p-4 w-full sm:max-w-md">
      {created ? (
        <div className="animate-fade">
          <p className="text-sm font-semibold">{created.name} was added.</p>
          <p className="text-xs text-ink-mid mt-1 mb-2">
            Share this access code with them — they sign in with it on the sign-in page.
          </p>
          <div className="flex items-center gap-2">
            <code className="input font-mono text-lg tracking-widest text-center flex-1 select-all">
              {created.accessCode}
            </code>
            <button className="btn btn-secondary" onClick={() => void copy(created.accessCode)}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn btn-secondary btn-sm" onClick={() => setCreated(null)}>
              Add another
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCreated(null); setOpen(false); }}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold mb-2">Add a person (no email needed)</p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Full name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void create()}
            />
            <button className="btn btn-primary" onClick={() => void create()} disabled={busy || name.trim().length < 2}>
              Create
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <p className="text-xs text-ink-dim mt-1.5">
            Creates a learner account with a generated access code they use to sign in.
          </p>
          {error && <p className="text-sm text-bad mt-2">{error}</p>}
        </>
      )}
    </div>
  );
}
