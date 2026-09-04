"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Values = Record<string, string | number | boolean>;

const SECTIONS: {
  title: string;
  description: string;
  fields: { key: string; label: string; type: "number" | "boolean" | "text"; hint?: string }[];
}[] = [
  {
    title: "Progression",
    description: "Business rules for stars and unlocking.",
    fields: [
      { key: "progression.defaultQuizPassingScore", label: "Default quiz passing score (%)", type: "number" },
      { key: "progression.allowStarDeduction", label: "Allow admins to deduct stars", type: "boolean" },
      { key: "progression.starLabel", label: "Star terminology (singular)", type: "text" },
      { key: "progression.starLabelPlural", label: "Star terminology (plural)", type: "text" },
    ],
  },
  {
    title: "1-on-1s",
    description: "Who can book time with staff.",
    fields: [
      { key: "booking.minStars", label: "1-on-1 booking star requirement", type: "number", hint: "Stars needed before a learner can book a 1-on-1 (0 = everyone)" },
    ],
  },
  {
    title: "Community",
    description: "Posting and messaging permissions.",
    fields: [
      { key: "community.learnersCanPost", label: "Learners can post in channels", type: "boolean" },
      { key: "community.learnersCanDm", label: "Learners can send direct messages", type: "boolean" },
    ],
  },
  {
    title: "Training",
    description: "Completion and quiz behavior.",
    fields: [
      { key: "training.completionRule", label: "Lesson completion rule", type: "text", hint: '"manual" — learner clicks Complete' },
      { key: "training.defaultAllowQuizRetry", label: "New quizzes allow retries by default", type: "boolean" },
    ],
  },
  {
    title: "Platform",
    description: "Branding and support.",
    fields: [
      { key: "platform.name", label: "Platform name", type: "text" },
      { key: "platform.logoUrl", label: "Logo URL", type: "text" },
      { key: "platform.accentColor", label: "Accent color", type: "text" },
      { key: "platform.supportEmail", label: "Support contact", type: "text" },
    ],
  },
];

export function SettingsForm({ settings }: { settings: Values }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(settings);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save settings");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-rise max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Platform Settings</h1>
        <p className="text-ink-mid text-sm mt-1">
          Business rules live here — not in source code. Changes apply immediately.
        </p>
      </header>

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.title} className="card p-6">
            <p className="font-bold">{section.title}</p>
            <p className="text-xs text-ink-dim mb-5">{section.description}</p>
            <div className="space-y-4">
              {section.fields.map((f) => (
                <div key={f.key} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{f.label}</p>
                    {f.hint && <p className="text-xs text-ink-dim">{f.hint}</p>}
                  </div>
                  {f.type === "boolean" ? (
                    <button
                      role="switch"
                      aria-checked={Boolean(values[f.key])}
                      onClick={() => {
                        setValues((v) => ({ ...v, [f.key]: !v[f.key] }));
                        setSaved(false);
                      }}
                      className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                        values[f.key] ? "bg-accent" : "bg-overlay border border-edge-strong"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                          values[f.key] ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  ) : f.type === "number" ? (
                    <input
                      type="number"
                      className="input w-24 shrink-0"
                      value={Number(values[f.key] ?? 0)}
                      onChange={(e) => {
                        setValues((v) => ({ ...v, [f.key]: Number(e.target.value) || 0 }));
                        setSaved(false);
                      }}
                    />
                  ) : (
                    <input
                      className="input w-56 shrink-0"
                      value={String(values[f.key] ?? "")}
                      onChange={(e) => {
                        setValues((v) => ({ ...v, [f.key]: e.target.value }));
                        setSaved(false);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-0 bg-bg/90 backdrop-blur border-t border-edge mt-6 -mx-4 px-4 py-4 flex items-center gap-3">
        <button className="btn btn-primary px-8" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-sm text-good">Saved ✓</span>}
        {error && <span className="text-sm text-bad">{error}</span>}
      </div>
    </div>
  );
}
