import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getContinueTarget, getNextStarTarget } from "@/lib/progress";
import {
  getCommunityActivity,
  getNextUnlock,
  getRecentUnlocks,
  getUpcomingCalls,
} from "@/lib/dashboard";
import { canAccessJobBoard } from "@/lib/access";
import { StarIcon, StarRow } from "@/components/ui/Star";
import { ProgressBar } from "@/components/ui/Progress";
import { LockIcon } from "@/components/ui/Locked";
import { Avatar } from "@/components/ui/Avatar";
import { Icons } from "@/components/ui/icons";
import { formatDate, formatTime, timeAgo, enumLabel } from "@/lib/format";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Home" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [
    continueTarget,
    nextStar,
    nextUnlock,
    recentUnlocks,
    upcomingCalls,
    activity,
    jobBoardAccess,
    jobBoardMin,
  ] = await Promise.all([
    getContinueTarget(user.id),
    getNextStarTarget(user.id),
    getNextUnlock(user),
    getRecentUnlocks(user.id),
    getUpcomingCalls(),
    getCommunityActivity(user),
    canAccessJobBoard(user),
    getSetting("progression.jobBoardMinStars"),
  ]);

  const recentJobs = jobBoardAccess.allowed
    ? await db.job.findMany({
        where: { status: "PUBLISHED", minStars: { lte: user.starBalance } },
        orderBy: { postedAt: "desc" },
        take: 3,
      })
    : [];

  const firstName = user.name.split(" ")[0];
  const starTotal = Math.max(5, user.starBalance + 1);

  // Headline motivation line
  let headline: string;
  if (nextStar) {
    const remainingLessons = nextStar.progress.totalLessons - nextStar.progress.completedLessons;
    if (nextStar.progress.percent > 0 && remainingLessons > 0) {
      headline = `You're ${nextStar.progress.percent}% of the way to your next Star.`;
    } else if (remainingLessons > 0) {
      headline = `Complete ${remainingLessons} ${remainingLessons === 1 ? "lesson" : "lessons"} to unlock Star #${user.starBalance + 1}.`;
    } else {
      headline = `Pass the ${nextStar.module.quizzes[0]?.title ?? "assessment"} to earn Star #${user.starBalance + 1}.`;
    }
  } else {
    headline =
      user.starBalance > 0
        ? "You've earned every Star currently available. New training is coming."
        : "Start your first module to begin earning Stars.";
  }

  return (
    <div className="animate-rise space-y-6">
      {/* Welcome + star progress */}
      <section className="card relative overflow-hidden p-6 md:p-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(500px 220px at 85% -40px, rgba(246,178,27,0.10), transparent 70%)",
          }}
        />
        <div className="relative flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Welcome back, {firstName}
            </h1>
            <p className="text-ink-mid mt-2">{headline}</p>
            <div className="mt-5 flex items-center gap-4">
              <StarRow earned={user.starBalance} total={starTotal} size="lg" />
              <span className="text-sm font-semibold text-accent-hi">
                {user.starBalance} {user.starBalance === 1 ? "Star" : "Stars"} earned
              </span>
            </div>
          </div>

          {nextStar && (
            <div className="card-raised p-5 md:w-80 shrink-0">
              <p className="section-title mb-3">Next Star</p>
              <p className="font-semibold text-sm">{nextStar.module.title}</p>
              <div className="mt-3 space-y-2 text-xs text-ink-mid">
                <div className="flex justify-between">
                  <span>Lessons</span>
                  <span className="font-semibold text-ink">
                    {nextStar.progress.completedLessons} / {nextStar.progress.totalLessons}
                  </span>
                </div>
                {nextStar.progress.totalQuizzes > 0 && (
                  <div className="flex justify-between">
                    <span>{nextStar.module.quizzes[0]?.title ?? "Assessment"}</span>
                    <span className={nextStar.progress.quizzesPassed > 0 ? "text-good font-semibold" : ""}>
                      {nextStar.progress.quizzesPassed > 0 ? "Passed" : "Not taken"}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <ProgressBar percent={nextStar.progress.percent} />
                <p className="text-right text-xs font-semibold mt-1.5">{nextStar.progress.percent}%</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Continue learning */}
        <section className="lg:col-span-2 space-y-6">
          {continueTarget ? (
            <Link
              href={`/training/lesson/${continueTarget.lesson.id}`}
              className="card card-hover relative overflow-hidden p-6 md:p-7 block"
            >
              <p className="section-title mb-3">Continue learning</p>
              <div className="flex items-center gap-5">
                <span className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent/10 border border-accent/25 text-accent-hi">
                  <Icons.play className="h-7 w-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold leading-snug">{continueTarget.module.title}</h2>
                  <p className="text-sm text-ink-mid mt-1">
                    {continueTarget.lesson.title} · Lesson {continueTarget.lessonNumber} of{" "}
                    {continueTarget.lessonCount}
                  </p>
                  <div className="mt-3 max-w-sm">
                    <ProgressBar
                      percent={Math.round(
                        (continueTarget.completedInModule / continueTarget.lessonCount) * 100
                      )}
                    />
                  </div>
                </div>
                <span className="btn btn-primary hidden sm:inline-flex shrink-0">Continue Training</span>
              </div>
            </Link>
          ) : (
            <div className="card p-7 text-center">
              <p className="font-semibold">All caught up 🎉</p>
              <p className="text-sm text-ink-mid mt-1">
                You&apos;ve completed every available lesson. Check back for new training.
              </p>
            </div>
          )}

          {/* Recently unlocked + next unlock */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="card p-6">
              <p className="section-title mb-4">🎉 Newly unlocked</p>
              {recentUnlocks.length === 0 ? (
                <p className="text-sm text-ink-mid">
                  Earn your {user.starBalance === 0 ? "first" : "next"} Star to start unlocking
                  advanced content.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recentUnlocks.map((u) => (
                    <li key={u.id} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 border border-accent/25 text-sm">
                        🔓
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{u.title}</p>
                        <p className="text-xs text-ink-dim">
                          Unlocked at {u.atStars} {u.atStars === 1 ? "Star" : "Stars"} ·{" "}
                          {timeAgo(u.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-6">
              <p className="section-title mb-4">Next unlock</p>
              {nextUnlock ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-overlay border border-edge-strong text-ink-dim">
                      <LockIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold truncate">{nextUnlock.title}</p>
                      <p className="text-xs text-ink-dim">{nextUnlock.kind}</p>
                    </div>
                  </div>
                  <p className="text-sm text-ink-mid">
                    Requires {nextUnlock.minStars} {nextUnlock.minStars === 1 ? "Star" : "Stars"} — you
                    currently have {user.starBalance}.
                  </p>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: nextUnlock.minStars }).map((_, i) => (
                      <StarIcon key={i} className="h-4 w-4" filled={i < user.starBalance} />
                    ))}
                  </div>
                  <Link href="/training" className="btn btn-secondary btn-sm self-start mt-1">
                    Keep earning
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-ink-mid">
                  Nothing left to unlock — you have access to everything. 🏆
                </p>
              )}
            </div>
          </div>

          {/* Job board */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="section-title">Job board</p>
              {jobBoardAccess.allowed && (
                <Link href="/jobs" className="text-xs text-accent-hi hover:underline">
                  View all →
                </Link>
              )}
            </div>
            {jobBoardAccess.allowed ? (
              recentJobs.length === 0 ? (
                <p className="text-sm text-ink-mid">No open positions right now. Check back soon.</p>
              ) : (
                <ul className="divide-y divide-edge">
                  {recentJobs.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={`/jobs/${job.id}`}
                        className="flex items-center gap-4 py-3 hover:bg-overlay/40 -mx-2 px-2 rounded-lg transition-colors"
                      >
                        <Avatar name={job.company} size="sm" src={job.companyLogoUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{job.title}</p>
                          <p className="text-xs text-ink-dim truncate">
                            {job.company} · {enumLabel(job.locationType)}
                            {job.compensation ? ` · ${job.compensation}` : ""}
                          </p>
                        </div>
                        <Icons.chevronRight className="h-4 w-4 text-ink-dim shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-overlay border border-edge-strong text-ink-dim">
                  <LockIcon className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    Reach {String(jobBoardMin)} Stars to unlock sales opportunities
                  </p>
                  <p className="text-xs text-ink-mid mt-0.5">
                    Companies hire trained salespeople directly from the academy.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <StarRow earned={user.starBalance} total={Number(jobBoardMin)} size="sm" />
                    <span className="text-xs text-ink-dim">
                      {user.starBalance} / {String(jobBoardMin)}
                    </span>
                  </div>
                </div>
                <Link href="/training" className="btn btn-secondary btn-sm shrink-0">
                  Continue Training
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Right rail */}
        <aside className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="section-title">Upcoming live calls</p>
              <Link href="/calls" className="text-xs text-accent-hi hover:underline">
                All →
              </Link>
            </div>
            {upcomingCalls.length === 0 ? (
              <p className="text-sm text-ink-mid">No live sessions scheduled yet.</p>
            ) : (
              <ul className="space-y-4">
                {upcomingCalls.map((call) => (
                  <li key={call.id}>
                    <Link href={`/calls/${call.id}`} className="block group">
                      <p className="text-sm font-semibold group-hover:text-accent-hi transition-colors">
                        {call.status === "LIVE" && (
                          <span className="chip chip-bad mr-2 align-middle">● LIVE</span>
                        )}
                        {call.title}
                      </p>
                      <p className="text-xs text-ink-dim mt-1 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Icons.calendar className="h-3 w-3" />
                          {formatDate(call.scheduledAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Icons.clock className="h-3 w-3" />
                          {formatTime(call.scheduledAt)}
                        </span>
                      </p>
                      <p className="text-xs text-ink-dim mt-0.5">
                        {call.host ? `Hosted by ${call.host.name} · ` : ""}
                        {call._count.attendees} attending
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="section-title">Community</p>
              <Link href="/community" className="text-xs text-accent-hi hover:underline">
                Open →
              </Link>
            </div>
            {activity.length === 0 ? (
              <p className="text-sm text-ink-mid">
                It&apos;s quiet in the community. Be the first to post.
              </p>
            ) : (
              <ul className="space-y-4">
                {activity.map((m) => (
                  <li key={m.id}>
                    <Link href={`/community/${m.channel.id}`} className="block group">
                      <div className="flex items-center gap-2">
                        <Avatar name={m.user.name} size="xs" />
                        <span className="text-xs font-semibold">{m.user.name}</span>
                        <span className="text-[11px] text-ink-dim">
                          #{m.channel.name} · {timeAgo(m.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-mid mt-1.5 line-clamp-2 group-hover:text-ink transition-colors">
                        {m.content}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
