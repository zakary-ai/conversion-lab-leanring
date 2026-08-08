"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ProfileFields = {
  headline: string;
  location: string;
  bio: string;
  salesExperience: string;
  skills: string[];
  resumeUrl: string;
  linkedinUrl: string;
  videoIntroUrl: string;
  availability: string;
};

export function ProfileEditor({ initial }: { initial: ProfileFields }) {
  const router = useRouter();
  const [fields, setFields] = useState(initial);
  const [skillsText, setSkillsText] = useState(initial.skills.join(", "));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fields,
          skills: skillsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 20),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not save profile");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label">Headline</label>
        <input className="input" value={fields.headline} placeholder="SDR turned closer · SaaS"
          onChange={(e) => set("headline", e.target.value)} />
      </div>
      <div>
        <label className="label">Location</label>
        <input className="input" value={fields.location} placeholder="Austin, TX"
          onChange={(e) => set("location", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Bio</label>
        <textarea className="input min-h-20 resize-y" value={fields.bio}
          placeholder="Tell employers who you are"
          onChange={(e) => set("bio", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Sales experience</label>
        <textarea className="input min-h-20 resize-y" value={fields.salesExperience}
          placeholder="Roles, industries, quota attainment…"
          onChange={(e) => set("salesExperience", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Skills (comma-separated)</label>
        <input className="input" value={skillsText} placeholder="Cold calling, Discovery, Objection handling"
          onChange={(e) => { setSkillsText(e.target.value); setSaved(false); }} />
      </div>
      <div>
        <label className="label">Resume URL</label>
        <input className="input" value={fields.resumeUrl} placeholder="https://…"
          onChange={(e) => set("resumeUrl", e.target.value)} />
      </div>
      <div>
        <label className="label">LinkedIn URL</label>
        <input className="input" value={fields.linkedinUrl} placeholder="https://linkedin.com/in/…"
          onChange={(e) => set("linkedinUrl", e.target.value)} />
      </div>
      <div>
        <label className="label">Intro video URL (Loom etc.)</label>
        <input className="input" value={fields.videoIntroUrl} placeholder="https://loom.com/…"
          onChange={(e) => set("videoIntroUrl", e.target.value)} />
      </div>
      <div>
        <label className="label">Availability</label>
        <input className="input" value={fields.availability} placeholder="Available immediately · Full-time"
          onChange={(e) => set("availability", e.target.value)} />
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="text-sm text-good">Saved ✓</span>}
        {error && <span className="text-sm text-bad">{error}</span>}
      </div>
    </div>
  );
}
