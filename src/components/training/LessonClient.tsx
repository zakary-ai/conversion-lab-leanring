"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";
import { StarCelebration, type AwardPayload } from "./StarCelebration";

/** Marks the lesson as started when it is actually opened. */
export function LessonStartTracker({ lessonId }: { lessonId: string }) {
  useEffect(() => {
    void fetch(`/api/lessons/${lessonId}/start`, { method: "POST" });
  }, [lessonId]);
  return null;
}

export function CompleteLessonButton({
  lessonId,
  initiallyCompleted,
  nextHref,
}: {
  lessonId: string;
  initiallyCompleted: boolean;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState(initiallyCompleted);
  const [busy, setBusy] = useState(false);
  const [award, setAward] = useState<AwardPayload | null>(null);

  async function complete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/complete`, { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { award: AwardPayload | null };
      setCompleted(true);
      if (data.award) setAward(data.award);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {completed ? (
          <span className="btn bg-good/10 text-good border border-good/25 cursor-default">
            <Icons.check className="h-4 w-4" />
            Lesson complete
          </span>
        ) : (
          <button className="btn btn-primary" onClick={() => void complete()} disabled={busy}>
            {busy ? "Saving…" : "Complete Lesson"}
          </button>
        )}
        {nextHref && (
          <button className="btn btn-secondary" onClick={() => router.push(nextHref)}>
            Next lesson
            <Icons.chevronRight />
          </button>
        )}
      </div>
      {award && <StarCelebration award={award} onClose={() => setAward(null)} />}
    </>
  );
}
