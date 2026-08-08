import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessJob, canAccessJobBoard } from "@/lib/access";
import { enumLabel, timeAgo } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { LockedNotice } from "@/components/ui/Locked";
import { ApplyForm } from "@/components/jobs/ApplyForm";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const boardAccess = await canAccessJobBoard(user);
  if (!boardAccess.allowed) redirect("/jobs");

  const job = await db.job.findUnique({
    where: { id },
    include: { applications: { where: { userId: user.id } } },
  });
  if (!job || (job.status !== "PUBLISHED" && user.role === "LEARNER")) notFound();

  const access = canAccessJob(user, job);
  if (!access.allowed) {
    return (
      <div className="max-w-xl mx-auto animate-rise">
        <div className="card mt-12">
          <div className="p-6 border-b border-edge flex items-center gap-4">
            <Avatar name={job.company} src={job.companyLogoUrl} size="lg" />
            <div>
              <h1 className="text-xl font-bold">{job.title}</h1>
              <p className="text-sm text-ink-mid">{job.company}</p>
            </div>
          </div>
          <LockedNotice required={access.required ?? 0} current={user.starBalance} what="this position" />
          <div className="p-6 pt-0 text-center">
            <Link href="/training" className="btn btn-primary">Continue Training</Link>
          </div>
        </div>
      </div>
    );
  }

  const application = job.applications[0];
  const profile = await db.profile.findUnique({ where: { userId: user.id } });

  return (
    <div className="animate-rise max-w-3xl">
      <Link href="/jobs" className="text-xs text-ink-dim hover:text-ink mb-4 inline-block">
        ← All jobs
      </Link>

      <div className="card p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          <Avatar name={job.company} src={job.companyLogoUrl} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
            <p className="text-ink-mid mt-1">
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="chip">{enumLabel(job.category)}</span>
              <span className="chip">{enumLabel(job.locationType)}</span>
              <span className="chip">{enumLabel(job.employmentType)}</span>
              {job.minStars > 0 && <span className="chip chip-accent">⭐ {job.minStars}+ Stars</span>}
            </div>
            <p className="text-xs text-ink-dim mt-3">Posted {timeAgo(job.postedAt)}</p>
          </div>
        </div>

        {(job.compensation || job.baseSalary || job.commission) && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {job.compensation && (
              <div className="card-raised p-4">
                <p className="section-title mb-1">OTE</p>
                <p className="font-bold">{job.compensation}</p>
              </div>
            )}
            {job.baseSalary && (
              <div className="card-raised p-4">
                <p className="section-title mb-1">Base</p>
                <p className="font-bold">{job.baseSalary}</p>
              </div>
            )}
            {job.commission && (
              <div className="card-raised p-4">
                <p className="section-title mb-1">Commission</p>
                <p className="font-bold">{job.commission}</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-7">
          <p className="section-title mb-2">About the role</p>
          <p className="prose-sm-invert whitespace-pre-line">{job.description}</p>
        </div>
        {job.requirements && (
          <div className="mt-6">
            <p className="section-title mb-2">Requirements</p>
            <p className="prose-sm-invert whitespace-pre-line">{job.requirements}</p>
          </div>
        )}
      </div>

      <div className="card p-6 md:p-8 mt-6">
        <ApplyForm
          jobId={job.id}
          existing={
            application
              ? { id: application.id, status: application.status, createdAt: application.createdAt.toISOString() }
              : null
          }
          defaultResumeUrl={profile?.resumeUrl ?? ""}
          profileComplete={Boolean(profile?.headline && profile?.bio)}
        />
      </div>
    </div>
  );
}
