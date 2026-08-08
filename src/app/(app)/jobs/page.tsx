import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessJobBoard, starGate } from "@/lib/access";
import { getSetting } from "@/lib/settings";
import { enumLabel, timeAgo } from "@/lib/format";
import { StarRow } from "@/components/ui/Star";
import { LockIcon } from "@/components/ui/Locked";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icons } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/Avatar";
import { JobCategory, JobLocationType } from "@prisma/client";

export const metadata = { title: "Jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; location?: string }>;
}) {
  const { q, category, location } = await searchParams;
  const user = await requireUser();
  const access = await canAccessJobBoard(user);

  if (!access.allowed) {
    const required = access.required ?? Number(await getSetting("progression.jobBoardMinStars"));
    return (
      <div className="max-w-lg mx-auto animate-rise">
        <div className="card relative overflow-hidden mt-10 p-10 text-center">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(360px 200px at 50% -40px, rgba(246,178,27,0.1), transparent 70%)",
            }}
          />
          <div className="relative">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-overlay border border-edge-strong text-ink-dim">
              <LockIcon className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Job Board</h1>
            <p className="text-ink-mid mt-3">
              Unlock sales opportunities. Reach{" "}
              <span className="font-semibold text-ink">{required} Stars</span> to access positions
              from companies looking for trained salespeople.
            </p>
            <div className="mt-6">
              <p className="text-xs text-ink-dim mb-2">Your progress</p>
              <div className="flex items-center justify-center gap-3">
                <StarRow earned={user.starBalance} total={required} size="md" />
                <span className="text-sm font-bold">
                  {user.starBalance} / {required}
                </span>
              </div>
            </div>
            <Link href="/training" className="btn btn-primary mt-8 px-8">
              Continue Training
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const jobs = await db.job.findMany({
    where: {
      status: "PUBLISHED",
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] }
        : {}),
      ...(category && category in JobCategory ? { category: category as JobCategory } : {}),
      ...(location && location in JobLocationType ? { locationType: location as JobLocationType } : {}),
    },
    orderBy: { postedAt: "desc" },
    include: { applications: { where: { userId: user.id }, select: { id: true, status: true } } },
  });

  const visible = jobs.filter((job) => starGate(user, job.minStars).allowed);
  const gated = jobs.filter((job) => !starGate(user, job.minStars).allowed);

  const filterLink = (params: Record<string, string | undefined>) => {
    const merged = { q, category, location, ...params };
    const search = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/jobs${search ? `?${search}` : ""}`;
  };

  return (
    <div className="animate-rise">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Board</h1>
          <p className="text-ink-mid text-sm mt-1">
            Sales opportunities from companies hiring academy-trained talent.
          </p>
        </div>
        <Link href="/jobs/applications" className="btn btn-secondary btn-sm">
          My Applications
        </Link>
      </header>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form className="flex-1" action="/jobs">
          {category && <input type="hidden" name="category" value={category} />}
          {location && <input type="hidden" name="location" value={location} />}
          <div className="relative">
            <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-dim" />
            <input name="q" defaultValue={q ?? ""} placeholder="Search roles or companies…" className="input pl-9" />
          </div>
        </form>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link href={filterLink({ category: undefined })} className={`chip whitespace-nowrap ${!category ? "chip-accent" : ""}`}>
            All roles
          </Link>
          {Object.keys(JobCategory).map((c) => (
            <Link
              key={c}
              href={filterLink({ category: c })}
              className={`chip whitespace-nowrap ${category === c ? "chip-accent" : ""}`}
            >
              {enumLabel(c)}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex gap-2 mb-6 -mt-3">
        {(["REMOTE", "HYBRID", "ON_SITE"] as const).map((l) => (
          <Link
            key={l}
            href={filterLink({ location: location === l ? undefined : l })}
            className={`chip ${location === l ? "chip-info" : ""}`}
          >
            {enumLabel(l)}
          </Link>
        ))}
      </div>

      {visible.length === 0 && gated.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icons.jobs className="h-6 w-6" />}
            title={q || category || location ? "No matching positions" : "No open positions right now"}
            message={
              q || category || location
                ? "Try removing some filters."
                : "New opportunities are posted as partner companies open roles."
            }
            actionLabel={q || category || location ? "Clear filters" : undefined}
            actionHref={q || category || location ? "/jobs" : undefined}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="card card-hover flex items-center gap-4 p-5">
              <Avatar name={job.company} src={job.companyLogoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold">{job.title}</h2>
                  {job.applications[0] && (
                    <span className="chip chip-good">{enumLabel(job.applications[0].status)}</span>
                  )}
                </div>
                <p className="text-sm text-ink-mid mt-0.5">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ""} · {enumLabel(job.locationType)} ·{" "}
                  {enumLabel(job.employmentType)}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="chip">{enumLabel(job.category)}</span>
                  {job.compensation && <span className="chip chip-accent">{job.compensation}</span>}
                  <span className="text-[11px] text-ink-dim">Posted {timeAgo(job.postedAt)}</span>
                </div>
              </div>
              <Icons.chevronRight className="h-4 w-4 text-ink-dim shrink-0 hidden sm:block" />
            </Link>
          ))}

          {gated.map((job) => (
            <div key={job.id} className="card flex items-center gap-4 p-5 opacity-70">
              <Avatar name={job.company} src={job.companyLogoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="font-bold flex items-center gap-2">
                  <LockIcon className="h-4 w-4 text-ink-dim" />
                  {job.title}
                </h2>
                <p className="text-sm text-ink-mid mt-0.5">{job.company}</p>
                <p className="text-xs text-ink-dim mt-1.5">
                  Requires {job.minStars} Stars — you have {user.starBalance}. Keep training to
                  unlock high-level opportunities.
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
