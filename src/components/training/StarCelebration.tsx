"use client";

import { useRouter } from "next/navigation";
import { StarIcon, StarRow } from "@/components/ui/Star";

export type AwardPayload = {
  stars: number;
  newBalance: number;
  reason: string;
  unlocks: { title: string; entityType: string }[];
};

/**
 * The full-screen "Star earned" moment. Fast, tasteful, and immediately
 * shows what the new star unlocked.
 */
export function StarCelebration({ award, onClose }: { award: AwardPayload; onClose: () => void }) {
  const router = useRouter();

  function explore() {
    onClose();
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-fade" />
      <div className="relative card-raised max-w-md w-full p-10 text-center shadow-2xl shadow-black/60 animate-pop overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(300px 200px at 50% 0%, rgba(246,178,27,0.15), transparent 70%)",
          }}
        />
        <div className="relative">
          <div className="mx-auto flex h-24 w-24 items-center justify-center">
            <StarIcon className="h-20 w-20 animate-star-burst drop-shadow-[0_0_24px_rgba(246,178,27,0.45)]" />
          </div>
          <p className="section-title mt-4">
            {award.stars > 1 ? `${award.stars} Stars earned` : "Star earned"}
          </p>
          <h2 className="text-2xl font-bold tracking-tight mt-2">{award.reason}</h2>
          <p className="text-sm text-ink-mid mt-3">You now have</p>
          <div className="flex justify-center mt-2">
            <StarRow earned={award.newBalance} total={Math.max(5, award.newBalance)} size="lg" />
          </div>
          <p className="text-lg font-bold text-accent-hi mt-1">
            {award.newBalance} {award.newBalance === 1 ? "Star" : "Stars"}
          </p>

          {award.unlocks.length > 0 && (
            <div className="mt-6 text-left">
              <p className="section-title text-center mb-3">You just unlocked</p>
              <ul className="space-y-2">
                {award.unlocks.slice(0, 4).map((u, i) => (
                  <li
                    key={i}
                    className="card px-4 py-2.5 text-sm font-medium flex items-center gap-2 animate-rise"
                    style={{ animationDelay: `${200 + i * 100}ms` }}
                  >
                    <span className="text-accent-hi">🔓</span>
                    {u.title}
                  </li>
                ))}
                {award.unlocks.length > 4 && (
                  <li className="text-xs text-ink-dim text-center">
                    +{award.unlocks.length - 4} more
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="flex gap-3 mt-8">
            <button className="btn btn-secondary flex-1" onClick={onClose}>
              Keep training
            </button>
            <button className="btn btn-primary flex-1" onClick={explore}>
              {award.unlocks.length > 0 ? "Explore new content" : "View dashboard"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
