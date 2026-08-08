"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { enumLabel } from "@/lib/format";

export function ApplyForm({
  jobId,
  existing,
  defaultResumeUrl,
  profileComplete,
}: {
  jobId: string;
  existing: { id: string; status: string; createdAt: string } | null;
  defaultResumeUrl: string;
  profileComplete: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [resumeUrl, setResumeUrl] = useState(defaultResumeUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = existing && existing.status !== "WITHDRAWN";

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, resumeUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not submit application");
        return;
      }
      router.refresh();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!existing) return;
    setBusy(true);
    try {
      await fetch(`/api/applications/${existing.id}/withdraw`, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="font-semibold flex items-center gap-2">
            Application submitted
            <span className="chip chip-good">{enumLabel(existing.status)}</span>
          </p>
          <p className="text-sm text-ink-mid mt-1">
            Track progress in{" "}
            <Link href="/jobs/applications" className="text-accent-hi hover:underline">
              My Applications
            </Link>
            .
          </p>
        </div>
        {!["HIRED", "REJECTED"].includes(existing.status) && (
          <button className="btn btn-danger btn-sm" onClick={() => void withdraw()} disabled={busy}>
            Withdraw
          </button>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="font-semibold">Ready to apply?</p>
          <p className="text-sm text-ink-mid mt-1">
            Your profile, star level, and completed training are shared with your application.
            {!profileComplete && (
              <>
                {" "}
                <Link href="/profile" className="text-accent-hi hover:underline">
                  Complete your profile
                </Link>{" "}
                to stand out.
              </>
            )}
          </p>
        </div>
        <button className="btn btn-primary px-8" onClick={() => setOpen(true)}>
          Apply Now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-semibold">Your application</p>
      <div>
        <label className="label">Message to the hiring team (optional)</label>
        <textarea
          className="input min-h-28 resize-y"
          placeholder="Why are you a great fit for this role?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Resume URL</label>
        <input
          className="input"
          placeholder="https://…"
          value={resumeUrl}
          onChange={(e) => setResumeUrl(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-3">
        <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary px-8" onClick={() => void apply()} disabled={busy}>
          {busy ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </div>
  );
}
