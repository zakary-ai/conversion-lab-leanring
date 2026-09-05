import { StarIcon } from "./Star";

export function LockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10.5V7.5a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="15.2" r="1.4" fill="currentColor" />
    </svg>
  );
}

/**
 * Standard locked-content presentation: shows the requirement and how close
 * the learner is, turning locks into motivation instead of dead ends.
 */
export function LockedNotice({
  required,
  current,
  what = "this content",
}: {
  required: number;
  current: number;
  what?: string;
}) {
  const needed = Math.max(0, required - current);
  return (
    <div className="flex flex-col items-center gap-3 text-center py-10 px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-overlay border border-edge-strong text-ink-dim">
        <LockIcon className="h-6 w-6" />
      </div>
      <div>
        <p className="font-semibold text-ink">
          Requires {required} {required === 1 ? "Star" : "Stars"}
        </p>
        <p className="text-sm text-ink-mid mt-1">
          You currently have {current}. Earn{" "}
          <span className="text-accent-hi font-semibold">
            {needed} more {needed === 1 ? "Star" : "Stars"}
          </span>{" "}
          to unlock {what}.
        </p>
      </div>
      <div className="flex items-center gap-1 mt-1">
        {Array.from({ length: required }).map((_, i) => (
          <StarIcon key={i} className="h-5 w-5" filled={i < current} />
        ))}
      </div>
    </div>
  );
}

export function LockChip({ required }: { required: number }) {
  return (
    <span className="chip">
      <LockIcon className="h-3 w-3" />
      {required} {required === 1 ? "Star" : "Stars"}
    </span>
  );
}

/**
 * A lock that sits over a card and stays there: the content beneath is
 * dimmed and blurred, and the message says exactly what it takes to open it.
 * The parent needs `relative` (and usually `overflow-hidden`).
 */
export function LockOverlay({
  required,
  current,
  what = "this",
  title,
  message,
}: {
  required: number;
  current: number;
  what?: string;
  /** Name of the locked thing, shown so the blur doesn't hide what it is */
  title?: string;
  /** Overrides the star message, e.g. for a prerequisite module */
  message?: string;
}) {
  const needed = Math.max(0, required - current);
  const stars = (n: number) => `${n} ${n === 1 ? "Star" : "Stars"}`;
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-[inherit] bg-bg/65 backdrop-blur-[2px] px-6 py-6 text-center"
      role="status"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-overlay border border-edge-strong text-ink shadow-lg shadow-black/40">
        <LockIcon className="h-6 w-6" />
      </div>
      <p className="font-bold text-ink mt-1">{title ? `${title} is locked` : "Locked"}</p>
      {message ? (
        <p className="text-sm text-ink-mid">{message}</p>
      ) : (
        <>
          <p className="text-sm text-ink-mid">
            You need <span className="text-accent-hi font-semibold">{stars(required)}</span> before you can access {what}.
          </p>
          <p className="text-xs text-ink-dim">
            You have {current} · {needed === 0 ? "ready to unlock" : `earn ${needed} more`}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {Array.from({ length: Math.min(required, 10) }).map((_, i) => (
              <StarIcon key={i} className="h-4 w-4" filled={i < current} />
            ))}
            {required > 10 && <span className="text-xs text-ink-dim">+{required - 10}</span>}
          </div>
        </>
      )}
    </div>
  );
}
