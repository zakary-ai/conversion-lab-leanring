import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { enumLabel, formatDateShort } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icons } from "@/components/ui/icons";

export const metadata = { title: "My Applications" };

const STATUS_STYLES: Record<string, string> = {
  APPLIED: "chip-info",
  UNDER_REVIEW: "chip-accent",
  INTERVIEW: "chip-accent",
  OFFER: "chip-good",
  HIRED: "chip-good",
  REJECTED: "chip-bad",
  WITHDRAWN: "",
};

export default async function MyApplicationsPage() {
  const user = await requireUser();
  const applications = await db.jobApplication.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { job: true },
  });

  return (
    <div className="animate-rise max-w-3xl">
      <Link href="/jobs" className="text-xs text-ink-dim hover:text-ink mb-4 inline-block">
        ← Job board
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My Applications</h1>
        <p className="text-ink-mid text-sm mt-1">Track every position you&apos;ve applied to.</p>
      </header>

      {applications.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icons.jobs className="h-6 w-6" />}
            title="You haven't applied to any positions yet"
            message="When you apply to a job, you can track its status here."
            actionLabel="Browse open positions"
            actionHref="/jobs"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Link
              key={app.id}
              href={`/jobs/${app.jobId}`}
              className="card card-hover flex items-center gap-4 p-5"
            >
              <Avatar name={app.job.company} src={app.job.companyLogoUrl} size="md" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{app.job.title}</p>
                <p className="text-sm text-ink-mid">{app.job.company}</p>
                <p className="text-xs text-ink-dim mt-1">Applied {formatDateShort(app.createdAt)}</p>
              </div>
              <span className={`chip ${STATUS_STYLES[app.status] ?? ""} shrink-0`}>
                {enumLabel(app.status)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
