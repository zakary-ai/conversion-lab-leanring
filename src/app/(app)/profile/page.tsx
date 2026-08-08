import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCourseProgress } from "@/lib/progress";
import { isModuleCompleted, canAccessJobBoard } from "@/lib/access";
import { getSetting } from "@/lib/settings";
import { getUpcomingCalls } from "@/lib/dashboard";
import { StarRow } from "@/components/ui/Star";
import { ProgressBar } from "@/components/ui/Progress";
import { Avatar } from "@/components/ui/Avatar";
import { Icons } from "@/components/ui/icons";
import { formatDate, formatTime } from "@/lib/format";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import Link from "next/link";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [profile, courses, jobAccess, jobBoardMin, upcomingCalls] = await Promise.all([
    db.profile.findUnique({ where: { userId: user.id } }),
    db.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { sortOrder: "asc" },
      include: {
        modules: { where: { status: "PUBLISHED" }, orderBy: { sortOrder: "asc" } },
      },
    }),
    canAccessJobBoard(user),
    getSetting("progression.jobBoardMinStars"),
    getUpcomingCalls(1),
  ]);

  const courseProgress = await Promise.all(
    courses.map(async (c) => ({
      course: c,
      progress: await getCourseProgress(user.id, c.id),
      completedModules: await Promise.all(
        c.modules.map(async (m) => ({ module: m, done: await isModuleCompleted(user.id, m.id) }))
      ),
    }))
  );

  const allModules = courseProgress.flatMap((c) => c.completedModules);
  const completedModules = allModules.filter((m) => m.done);
  const overall =
    courseProgress.length === 0
      ? 0
      : Math.round(
          courseProgress.reduce((sum, c) => sum + c.progress.percent, 0) / courseProgress.length
        );

  // Profile strength: simple, honest scoring of application readiness
  const strengthChecks: { label: string; done: boolean }[] = [
    { label: "Headline", done: Boolean(profile?.headline) },
    { label: "Bio", done: Boolean(profile?.bio) },
    { label: "Location", done: Boolean(profile?.location) },
    { label: "Sales experience", done: Boolean(profile?.salesExperience) },
    { label: "Skills", done: (profile?.skills?.length ?? 0) > 0 },
    { label: "Resume link", done: Boolean(profile?.resumeUrl) },
    { label: "LinkedIn", done: Boolean(profile?.linkedinUrl) },
  ];
  const strength = Math.round(
    (strengthChecks.filter((c) => c.done).length / strengthChecks.length) * 100
  );

  return (
    <div className="animate-rise max-w-4xl">
      <div className="card relative overflow-hidden p-6 md:p-8 mb-6">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(400px 200px at 20% -40px, rgba(246,178,27,0.09), transparent 70%)",
          }}
        />
        <div className="relative flex flex-col sm:flex-row items-start gap-6">
          <Avatar name={user.name} size="xl" src={profile?.avatarUrl} />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
            {profile?.headline && <p className="text-ink-mid mt-1">{profile.headline}</p>}
            {profile?.location && (
              <p className="text-xs text-ink-dim mt-1">📍 {profile.location}</p>
            )}
            <div className="flex items-center gap-3 mt-4">
              <StarRow earned={user.starBalance} total={Math.max(5, user.starBalance)} size="md" />
              <span className="text-sm font-bold text-accent-hi">
                {user.starBalance} {user.starBalance === 1 ? "Star" : "Stars"}
              </span>
            </div>
          </div>
          <div className="card-raised px-5 py-4 text-center shrink-0">
            <p className="section-title mb-1">Training</p>
            <p className="text-3xl font-bold">{overall}%</p>
            <p className="text-xs text-ink-dim mt-0.5">
              {completedModules.length} / {allModules.length} modules
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-6">
          <p className="section-title mb-4">Sales training progress</p>
          <div className="space-y-5">
            {courseProgress.map(({ course, progress, completedModules: mods }) => (
              <div key={course.id}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-semibold">{course.title}</span>
                  <span className="text-ink-dim text-xs">{progress.percent}%</span>
                </div>
                <ProgressBar percent={progress.percent} />
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {mods.map(({ module: m, done }) => (
                    <li key={m.id} className={`chip ${done ? "chip-good" : ""}`}>
                      {done && <Icons.check className="h-3 w-3" />}
                      {m.title}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="card p-6">
            <p className="section-title mb-4">Job eligibility</p>
            {jobAccess.allowed ? (
              <div>
                <p className="chip chip-good mb-2">
                  <Icons.check className="h-3 w-3" />
                  Job Board unlocked
                </p>
                <p className="text-sm text-ink-mid">
                  You can apply to positions matching your star level.
                </p>
                <Link href="/jobs" className="btn btn-secondary btn-sm mt-3">
                  Browse jobs
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-sm text-ink-mid">
                  Reach {String(jobBoardMin)} Stars to unlock the Job Board. You have{" "}
                  {user.starBalance}.
                </p>
                <div className="mt-2">
                  <ProgressBar percent={(user.starBalance / Number(jobBoardMin)) * 100} />
                </div>
              </div>
            )}
          </section>

          <section className="card p-6">
            <p className="section-title mb-4">Profile strength</p>
            <div className="flex items-center gap-4">
              <p className="text-3xl font-bold">{strength}%</p>
              <div className="flex-1">
                <ProgressBar percent={strength} />
              </div>
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-1.5">
              {strengthChecks.map((c) => (
                <li
                  key={c.label}
                  className={`text-xs flex items-center gap-1.5 ${c.done ? "text-good" : "text-ink-dim"}`}
                >
                  {c.done ? <Icons.check className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-edge-strong inline-block" />}
                  {c.label}
                </li>
              ))}
            </ul>
          </section>

          {upcomingCalls[0] && (
            <section className="card p-6">
              <p className="section-title mb-3">Next live call</p>
              <Link href={`/calls/${upcomingCalls[0].id}`} className="block group">
                <p className="font-semibold text-sm group-hover:text-accent-hi transition-colors">
                  {upcomingCalls[0].title}
                </p>
                <p className="text-xs text-ink-dim mt-1">
                  {formatDate(upcomingCalls[0].scheduledAt)} · {formatTime(upcomingCalls[0].scheduledAt)}
                </p>
              </Link>
            </section>
          )}
        </div>
      </div>

      <section className="card p-6 mt-6">
        <p className="section-title mb-4">Edit profile</p>
        <ProfileEditor
          initial={{
            headline: profile?.headline ?? "",
            location: profile?.location ?? "",
            bio: profile?.bio ?? "",
            salesExperience: profile?.salesExperience ?? "",
            skills: profile?.skills ?? [],
            resumeUrl: profile?.resumeUrl ?? "",
            linkedinUrl: profile?.linkedinUrl ?? "",
            videoIntroUrl: profile?.videoIntroUrl ?? "",
            availability: profile?.availability ?? "",
          }}
        />
      </section>
    </div>
  );
}
