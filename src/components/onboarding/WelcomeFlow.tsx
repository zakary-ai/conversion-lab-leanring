"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StarIcon, StarRow } from "@/components/ui/Star";

const UNLOCKS = [
  "Advanced Training",
  "Private Communities",
  "Live Coaching",
  "1-on-1 Coaching",
  "Call Recordings",
];

export function WelcomeFlow({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [headline, setHeadline] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline, location, bio }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirect?: string };
      router.push(data.redirect ?? "/dashboard");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const firstName = name.split(" ")[0];

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12 relative">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(700px 350px at 50% -80px, rgba(246,178,27,0.1), transparent 70%)",
        }}
      />
      <div className="w-full max-w-lg relative">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-8 bg-accent" : "w-1.5 bg-white/15"
              }`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="card p-10 text-center animate-pop" key="s0">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-accent/10 border border-accent/25">
              <StarIcon className="h-10 w-10 animate-star-burst" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Welcome to the Academy, {firstName}</h1>
            <p className="text-ink-mid mt-4 leading-relaxed">
              Your path starts at <span className="font-semibold text-ink">0 Stars</span>. Complete
              training, pass assessments, and prove your sales skills to earn Stars.
            </p>
            <div className="my-8 flex justify-center">
              <StarRow earned={0} total={5} size="lg" />
            </div>
            <button className="btn btn-primary w-full text-base py-3" onClick={() => setStep(1)}>
              Let&apos;s go
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="card p-10 animate-pop" key="s1">
            <h2 className="text-2xl font-bold tracking-tight">Set up your profile</h2>
            <p className="text-sm text-ink-mid mt-1 mb-6">
              Your profile helps coaches and the community get to know you. You can finish it any time.
            </p>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="headline">Headline</label>
                <input
                  id="headline"
                  className="input"
                  placeholder="Aspiring closer · SaaS sales"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="location">Location</label>
                <input
                  id="location"
                  className="input"
                  placeholder="Austin, TX"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="bio">About you</label>
                <textarea
                  id="bio"
                  className="input min-h-24 resize-y"
                  placeholder="What brings you to sales?"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button className="btn btn-ghost" onClick={() => setStep(2)}>Skip for now</button>
              <button className="btn btn-primary flex-1" onClick={() => setStep(2)}>Continue</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card p-10 animate-pop" key="s2">
            <h2 className="text-2xl font-bold tracking-tight text-center">Stars unlock everything</h2>
            <p className="text-ink-mid text-center mt-3">
              Every Star you earn opens more of the academy. As you progress, you&apos;ll unlock:
            </p>
            <ul className="mt-8 space-y-3">
              {UNLOCKS.map((u, i) => (
                <li
                  key={u}
                  className="flex items-center gap-3 card-raised px-4 py-3 animate-rise"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <StarIcon className="h-5 w-5 shrink-0" />
                  <span className="font-medium text-sm">{u}</span>
                </li>
              ))}
            </ul>
            <button
              className="btn btn-primary w-full text-base py-3 mt-8"
              onClick={() => void finish()}
              disabled={saving}
            >
              {saving ? "Preparing your training…" : "Start Training"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
