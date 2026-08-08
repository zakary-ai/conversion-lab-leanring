"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <p className="text-4xl mb-4">⚠️</p>
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="text-ink-mid mt-2 max-w-sm text-sm">
        An unexpected error occurred{error.digest ? ` (ref: ${error.digest})` : ""}. Your progress is
        saved — try again.
      </p>
      <button onClick={reset} className="btn btn-primary mt-8">
        Try again
      </button>
    </div>
  );
}
