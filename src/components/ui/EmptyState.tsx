import Link from "next/link";

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  actionHref,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 gap-3">
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-overlay border border-edge text-ink-dim text-2xl">
          {icon}
        </div>
      )}
      <p className="font-semibold text-ink">{title}</p>
      {message && <p className="text-sm text-ink-mid max-w-sm">{message}</p>}
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn btn-secondary btn-sm mt-2">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
