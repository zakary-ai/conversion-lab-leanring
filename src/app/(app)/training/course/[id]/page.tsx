import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessCourse, canAccessModule } from "@/lib/access";
import { getCourseProgress, getModuleProgress } from "@/lib/progress";
import { ProgressBar } from "@/components/ui/Progress";
import { LockedNotice, LockIcon, LockOverlay } from "@/components/ui/Locked";
import { Icons } from "@/components/ui/icons";
import { StarIcon } from "@/components/ui/Star";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const course = await db.course.findUnique({
    where: { id },
    include: {
      modules: {
        where: { status: "PUBLISHED" },
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: {
            where: { status: "PUBLISHED" },
            orderBy: { sortOrder: "asc" },
            include: { progress: { where: { userId: user.id } } },
          },
          quizzes: {
            where: { status: "PUBLISHED" },
            orderBy: { sortOrder: "asc" },
            include: { attempts: { where: { userId: user.id, passed: true }, take: 1 } },
          },
        },
      },
    },
  });
  if (!course || (course.status !== "PUBLISHED" && user.role === "LEARNER")) notFound();

  const access = canAccessCourse(user, course);
  if (!access.allowed) {
    return (
      <div className="max-w-xl mx-auto animate-rise">
        <div className="card mt-12">
          <div className="p-6 border-b border-edge">
            <h1 className="text-xl font-bold">{course.title}</h1>
            {course.description && <p className="text-sm text-ink-mid mt-1">{course.description}</p>}
          </div>
          <LockedNotice
            required={access.reason === "stars" ? access.required ?? 0 : 0}
            current={user.starBalance}
            what="this course"
          />
          <div className="p-6 pt-0 text-center">
            <Link href="/training" className="btn btn-primary">Continue Training</Link>
          </div>
        </div>
      </div>
    );
  }

  const progress = await getCourseProgress(user.id, course.id);
  const moduleData = await Promise.all(
    course.modules.map(async (mod) => ({
      mod,
      access: await canAccessModule(user, { ...mod, course }),
      progress: await getModuleProgress(user.id, mod.id),
    }))
  );

  return (
    <div className="animate-rise max-w-4xl">
      <Link href="/training" className="text-xs text-ink-dim hover:text-ink flex items-center gap-1 mb-4">
        ← All training
      </Link>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{course.title}</h1>
        {course.description && <p className="text-ink-mid text-sm mt-1 max-w-2xl">{course.description}</p>}
        <div className="mt-4 max-w-md">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-ink-mid">
              {progress.completedLessons} / {progress.totalLessons} lessons complete
            </span>
            <span className="font-semibold">{progress.percent}%</span>
          </div>
          <ProgressBar percent={progress.percent} size="lg" />
        </div>
      </header>

      <div className="space-y-4">
        {moduleData.map(({ mod, access: modAccess, progress: modProgress }, mi) => (
          <section key={mod.id} className="card overflow-hidden relative">
            {!modAccess.allowed && (
              <LockOverlay
                required={modAccess.reason === "stars" ? modAccess.required ?? 0 : 0}
                current={user.starBalance}
                what="this module"
                title={mod.title}
                message={
                  modAccess.reason === "stars"
                    ? undefined
                    : modAccess.reason === "prerequisite"
                      ? `Finish ${modAccess.prerequisiteTitle} before you can access this module.`
                      : "This module isn't available to you yet."
                }
              />
            )}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-edge bg-raised/40">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-overlay border border-edge text-sm font-bold text-ink-mid">
                {mi + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold leading-tight">{mod.title}</h2>
                <p className="text-xs text-ink-dim mt-0.5">
                  {mod.lessons.length} lessons
                  {mod.quizzes.length > 0 && ` · ${mod.quizzes.length} assessment`}
                  {mod.starReward > 0 && (
                    <span className="text-accent-hi"> · ⭐ +{mod.starReward} Star{mod.starReward > 1 ? "s" : ""} on completion</span>
                  )}
                </p>
              </div>
              {modAccess.allowed ? (
                <span className="text-xs font-semibold text-ink-mid">{modProgress.percent}%</span>
              ) : (
                <span className="chip">
                  <LockIcon className="h-3 w-3" />
                  {modAccess.reason === "stars"
                    ? `${modAccess.required} Stars`
                    : modAccess.reason === "prerequisite"
                      ? `Finish ${modAccess.prerequisiteTitle}`
                      : "Locked"}
                </span>
              )}
            </div>

            <ul className="divide-y divide-edge">
              {mod.lessons.map((lesson) => {
                const done = Boolean(lesson.progress[0]?.completedAt);
                const started = Boolean(lesson.progress[0]) && !done;
                const row = (
                  <>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
                        done
                          ? "bg-good/15 text-good border border-good/30"
                          : started
                            ? "bg-accent/15 text-accent-hi border border-accent/30"
                            : "bg-overlay text-ink-dim border border-edge"
                      }`}
                    >
                      {done ? <Icons.check className="h-3 w-3" /> : <Icons.play className="h-2.5 w-2.5" />}
                    </span>
                    <span className={`text-sm ${done ? "text-ink-mid" : "font-medium"}`}>{lesson.title}</span>
                    {lesson.durationMin && (
                      <span className="ml-auto text-xs text-ink-dim shrink-0">{lesson.durationMin} min</span>
                    )}
                  </>
                );
                return (
                  <li key={lesson.id}>
                    {modAccess.allowed ? (
                      <Link
                        href={`/training/lesson/${lesson.id}`}
                        className="flex items-center gap-3 px-6 py-3 hover:bg-overlay/60 transition-colors"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-6 py-3 opacity-60">
                        <LockIcon className="h-4 w-4 shrink-0 text-ink-dim ml-1 mr-1" />
                        <span className="text-sm text-ink-dim">{lesson.title}</span>
                      </div>
                    )}
                  </li>
                );
              })}
              {mod.quizzes.map((quiz) => {
                const passed = quiz.attempts.length > 0;
                return (
                  <li key={quiz.id}>
                    {modAccess.allowed ? (
                      <Link
                        href={`/training/quiz/${quiz.id}`}
                        className="flex items-center gap-3 px-6 py-3 hover:bg-overlay/60 transition-colors"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
                            passed
                              ? "bg-good/15 text-good border border-good/30"
                              : "bg-accent/10 text-accent-hi border border-accent/25"
                          }`}
                        >
                          {passed ? <Icons.check className="h-3 w-3" /> : <StarIcon className="h-3 w-3" filled={false} />}
                        </span>
                        <span className={`text-sm ${passed ? "text-ink-mid" : "font-semibold"}`}>
                          {quiz.title}
                        </span>
                        <span className="chip chip-accent ml-auto shrink-0">Assessment</span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-6 py-3 opacity-60">
                        <LockIcon className="h-4 w-4 shrink-0 text-ink-dim ml-1 mr-1" />
                        <span className="text-sm text-ink-dim">{quiz.title}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
