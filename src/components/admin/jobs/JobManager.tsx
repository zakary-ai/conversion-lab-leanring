"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/Avatar";
import { enumLabel, timeAgo } from "@/lib/format";

type ApplicationRow = {
  id: string;
  status: string;
  message: string | null;
  resumeUrl: string | null;
  createdAt: string;
  applicant: {
    id: string;
    name: string;
    email: string | null;
    stars: number;
    headline: string | null;
    linkedinUrl: string | null;
  };
};

type JobRow = {
  id: string;
  company: string;
  title: string;
  location: string;
  locationType: string;
  employmentType: string;
  category: string;
  compensation: string;
  baseSalary: string;
  commission: string;
  description: string;
  requirements: string;
  minStars: number;
  status: string;
  applications: ApplicationRow[];
};

const CATEGORIES = ["SETTER", "APPOINTMENT_SETTER", "SDR", "BDR", "CLOSER", "ACCOUNT_EXECUTIVE", "SALES_REPRESENTATIVE", "SALES_MANAGER"];
const APP_STATUSES = ["APPLIED", "UNDER_REVIEW", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

export function JobManager({ jobs }: { jobs: JobRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<JobRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedApps, setExpandedApps] = useState<string | null>(null);

  async function api(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Something went wrong");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const totalPending = jobs.reduce(
    (sum, j) => sum + j.applications.filter((a) => a.status === "APPLIED").length,
    0
  );

  return (
    <div className="animate-rise">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Board</h1>
          <p className="text-ink-mid text-sm mt-1">
            {jobs.length} listings · {totalPending} new application{totalPending === 1 ? "" : "s"}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Icons.plus className="h-4 w-4" />
          Post job
        </button>
      </header>

      {editing && (
        <JobForm
          initial={editing === "new" ? null : editing}
          busy={busy}
          onSubmit={async (fields) => {
            const ok =
              editing === "new"
                ? await api("/api/admin/jobs", "POST", fields)
                : await api(`/api/admin/jobs/${editing.id}`, "PATCH", fields);
            if (ok) setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="space-y-3">
        {jobs.length === 0 && (
          <div className="card p-10 text-center">
            <p className="font-semibold">No job listings yet</p>
            <p className="text-sm text-ink-mid mt-1">Post the first opportunity for your learners.</p>
          </div>
        )}
        {jobs.map((job) => (
          <div key={job.id} className="card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold flex items-center gap-2 flex-wrap">
                  {job.title}
                  <span className={`chip ${job.status === "PUBLISHED" ? "chip-good" : "chip-accent"}`}>
                    {enumLabel(job.status)}
                  </span>
                  {job.minStars > 0 && <span className="chip">⭐ {job.minStars}+</span>}
                </p>
                <p className="text-xs text-ink-dim mt-1">
                  {job.company} · {enumLabel(job.category)} · {enumLabel(job.locationType)}
                  {job.compensation && ` · ${job.compensation}`}
                </p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setExpandedApps(expandedApps === job.id ? null : job.id)}
              >
                {job.applications.length} application{job.applications.length === 1 ? "" : "s"}
                {job.applications.filter((a) => a.status === "APPLIED").length > 0 && (
                  <span className="ml-1 rounded-full bg-accent text-[#1c1303] text-[10px] font-bold px-1.5">
                    {job.applications.filter((a) => a.status === "APPLIED").length} new
                  </span>
                )}
              </button>
              {job.status !== "PUBLISHED" ? (
                <button className="btn btn-primary btn-sm" disabled={busy}
                  onClick={() => void api(`/api/admin/jobs/${job.id}`, "PATCH", { status: "PUBLISHED" })}>
                  Publish
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => void api(`/api/admin/jobs/${job.id}`, "PATCH", { status: "ARCHIVED" })}>
                  Archive
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(job)}>
                <Icons.edit className="h-3.5 w-3.5" />
              </button>
              <button
                className="btn btn-ghost btn-sm hover:text-bad"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete "${job.title}" and all its applications?`)) {
                    void api(`/api/admin/jobs/${job.id}`, "DELETE");
                  }
                }}
              >
                <Icons.trash className="h-3.5 w-3.5" />
              </button>
            </div>

            {expandedApps === job.id && (
              <div className="mt-4 border-t border-edge pt-4 space-y-3">
                {job.applications.length === 0 ? (
                  <p className="text-sm text-ink-mid">No applications yet.</p>
                ) : (
                  job.applications.map((app) => (
                    <div key={app.id} className="card-raised p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <Avatar name={app.applicant.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm">
                            {app.applicant.name}
                            <span className="text-accent-hi text-xs ml-2">⭐ {app.applicant.stars}</span>
                          </p>
                          <p className="text-xs text-ink-dim">
                            {app.applicant.headline ?? app.applicant.email ?? "No email"} · applied {timeAgo(app.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {app.resumeUrl && (
                            <a href={app.resumeUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                              Resume
                            </a>
                          )}
                          {app.applicant.linkedinUrl && (
                            <a href={app.applicant.linkedinUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                              LinkedIn
                            </a>
                          )}
                          {app.status === "WITHDRAWN" ? (
                            <span className="chip">Withdrawn</span>
                          ) : (
                            <select
                              className="input py-1 px-2 text-xs w-auto"
                              value={app.status}
                              disabled={busy}
                              onChange={(e) =>
                                void api(`/api/admin/applications/${app.id}`, "PATCH", {
                                  status: e.target.value,
                                })
                              }
                            >
                              {APP_STATUSES.map((s) => (
                                <option key={s} value={s}>{enumLabel(s)}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                      {app.message && (
                        <p className="text-sm text-ink-mid mt-3 bg-overlay rounded-lg px-3 py-2 whitespace-pre-wrap">
                          {app.message}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function JobForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: JobRow | null;
  busy: boolean;
  onSubmit: (fields: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState({
    company: initial?.company ?? "",
    title: initial?.title ?? "",
    location: initial?.location ?? "",
    locationType: initial?.locationType ?? "REMOTE",
    employmentType: initial?.employmentType ?? "FULL_TIME",
    category: initial?.category ?? "SDR",
    compensation: initial?.compensation ?? "",
    baseSalary: initial?.baseSalary ?? "",
    commission: initial?.commission ?? "",
    description: initial?.description ?? "",
    requirements: initial?.requirements ?? "",
    minStars: initial?.minStars ?? 0,
  });

  function set<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="card p-5 mb-6 grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Company</label>
        <input className="input" value={fields.company} onChange={(e) => set("company", e.target.value)} autoFocus />
      </div>
      <div>
        <label className="label">Job title</label>
        <input className="input" value={fields.title} onChange={(e) => set("title", e.target.value)} />
      </div>
      <div>
        <label className="label">Location</label>
        <input className="input" placeholder="Austin, TX" value={fields.location} onChange={(e) => set("location", e.target.value)} />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">Work style</label>
          <select className="input" value={fields.locationType} onChange={(e) => set("locationType", e.target.value)}>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ON_SITE">On-site</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="label">Employment</label>
          <select className="input" value={fields.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
            <option value="FULL_TIME">Full-time</option>
            <option value="PART_TIME">Part-time</option>
            <option value="CONTRACT">Contract</option>
            <option value="COMMISSION_ONLY">Commission-only</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">Category</label>
          <select className="input" value={fields.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{enumLabel(c)}</option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className="label">Min ⭐</label>
          <input className="input" type="number" min={0} value={fields.minStars}
            onChange={(e) => set("minStars", Math.max(0, Number(e.target.value) || 0))} />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">OTE / compensation</label>
          <input className="input" placeholder="$120k OTE" value={fields.compensation} onChange={(e) => set("compensation", e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="label">Base salary</label>
          <input className="input" placeholder="$50k" value={fields.baseSalary} onChange={(e) => set("baseSalary", e.target.value)} />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Commission structure</label>
        <input className="input" placeholder="10% of closed revenue, uncapped" value={fields.commission} onChange={(e) => set("commission", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <textarea className="input min-h-24 resize-y" value={fields.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Requirements</label>
        <textarea className="input min-h-16 resize-y" value={fields.requirements} onChange={(e) => set("requirements", e.target.value)} />
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <button
          className="btn btn-primary"
          disabled={busy || !fields.company.trim() || !fields.title.trim() || !fields.description.trim()}
          onClick={() =>
            void onSubmit({
              ...fields,
              company: fields.company.trim(),
              title: fields.title.trim(),
              location: fields.location.trim() || null,
              compensation: fields.compensation.trim() || null,
              baseSalary: fields.baseSalary.trim() || null,
              commission: fields.commission.trim() || null,
              description: fields.description.trim(),
              requirements: fields.requirements.trim() || null,
            })
          }
        >
          {initial ? "Save listing" : "Create listing (draft)"}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
